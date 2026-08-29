// ============================================================================
// lineParser — turns normalized WhatsApp export text into RawParsedMessage[].
//
// Supports the two header shapes WhatsApp's exporter actually produces:
//   DASH:    "12.04.2026, 14:23 - Имя: текст"        (Android, most locales)
//   BRACKET: "[12.04.2026, 14:23:07] Имя: текст"     (iOS, most locales)
// with any of '.', '/', '-' as the date separator, optional seconds, and an
// optional 12-hour AM/PM suffix (iOS). See dateTime.ts for the day/month/year
// disambiguation heuristic.
//
// Multiline messages: any line that does NOT match a header is a
// continuation of the message currently being built, exactly as WhatsApp
// itself renders them (the app never splits one bubble across two exported
// "Name: " lines).
//
// A line is classified as a SYSTEM message in one of two ways:
//   1. Structurally — the text right after the header has no "Name: " prefix
//      at all (group/global notices like the encryption banner or "X added
//      Y" are written this way — there's no per-sender attribution).
//   2. By content — the text after a normal "Name: " prefix matches a known
//      deleted-message notice (WhatsApp writes deletions as a message FROM
//      that sender, e.g. "Name: This message was deleted").
// ============================================================================

import { normalizeExportText } from './textNormalize.ts';
import { parseDateTime } from './dateTime.ts';
import { extractMediaReference, classifyMediaKind } from './mediaPatterns.ts';
import { isDeletedMessageText } from './systemPatterns.ts';
import type { ParseResult, ParseWarning, RawParsedMessage } from './types.ts';

const BRACKET_HEADER =
  /^\[(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]\s?(.*)$/;

const DASH_HEADER =
  /^(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\s*[-\u2013\u2014]\s?(.*)$/;

// First line of a message body, split into sender + first line of text.
// Kept intentionally strict (sender chunk capped at 80 chars, no newline) so
// we don't accidentally treat "Note: bought milk" mid-message as a new
// sender — only the FIRST line of a freshly-started block is ever tested.
const SENDER_SPLIT = /^([^\n:]{1,80}?):\s(.*)$/;

interface Block {
  sentAtIso: string;
  restLines: string[];
  headerLine: number;
}

function matchHeader(line: string): { dateStr: string; timeStr: string; rest: string } | null {
  const bracket = line.match(BRACKET_HEADER);
  if (bracket) return { dateStr: bracket[1], timeStr: bracket[2], rest: bracket[3] };
  const dash = line.match(DASH_HEADER);
  if (dash) return { dateStr: dash[1], timeStr: dash[2], rest: dash[3] };
  return null;
}

function finalizeBlock(block: Block): RawParsedMessage {
  const firstLine = block.restLines[0] ?? '';
  const remainder = block.restLines.slice(1);
  const senderMatch = firstLine.match(SENDER_SPLIT);

  let senderName: string;
  let text: string;
  let isSystemMessage: boolean;

  if (senderMatch) {
    senderName = senderMatch[1].trim();
    text = [senderMatch[2], ...remainder].join('\n');
    isSystemMessage = isDeletedMessageText(text);
  } else {
    // No "Name: " prefix at all → global/group notice, no per-sender text.
    senderName = '';
    text = block.restLines.join('\n');
    isSystemMessage = true;
  }

  const isMultiline = text.includes('\n');
  const mediaRef = isSystemMessage ? null : extractMediaReference(text);

  if (mediaRef) {
    return {
      senderName,
      sentAtIso: block.sentAtIso,
      isSystemMessage,
      isMultiline,
      originalText: null,
      hasMedia: true,
      mediaFilename: mediaRef.filename,
      mediaOmittedKind: mediaRef.omittedKind,
      mediaKind: mediaRef.filename ? classifyMediaKind(mediaRef.filename) : null,
    };
  }

  return {
    senderName,
    sentAtIso: block.sentAtIso,
    isSystemMessage,
    isMultiline,
    originalText: text.length > 0 ? text : null,
    hasMedia: false,
    mediaFilename: null,
    mediaOmittedKind: null,
    mediaKind: null,
  };
}

export function parseChatExport(rawText: string): ParseResult {
  const text = normalizeExportText(rawText);
  const lines = text.split('\n');

  const blocks: Block[] = [];
  const warnings: ParseWarning[] = [];
  let current: Block | null = null;

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const header = matchHeader(line);

    if (header) {
      const parsed = parseDateTime(header.dateStr, header.timeStr);
      if (parsed.valid) {
        if (current) blocks.push(current);
        current = { sentAtIso: parsed.iso, restLines: [header.rest], headerLine: lineNo };
        return;
      }
      warnings.push({
        line: lineNo,
        message: `Строка похожа на заголовок сообщения, но дата/время не распознаны ("${header.dateStr}, ${header.timeStr}") — присоединена как продолжение предыдущего сообщения.`,
      });
      // fall through: treat the whole line as a continuation below
    }

    if (current) {
      current.restLines.push(line);
    } else if (line.trim().length > 0) {
      warnings.push({
        line: lineNo,
        message: 'Строка встретилась до первого распознанного сообщения и была проигнорирована.',
      });
    }
  });

  if (current) blocks.push(current);

  const messages = blocks.map(finalizeBlock);

  return { messages, warnings };
}
