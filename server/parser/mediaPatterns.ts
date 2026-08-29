// ============================================================================
// mediaPatterns — recognizes "this message IS a media attachment" lines, in
// the handful of real-world formats WhatsApp's exporter has used, and infers
// what kind of media it is.
//
// Deliberately a small, extensible, well-commented array rather than one
// giant regex — Stage 3 (media engine) or a future export-format change can
// add a new entry here without touching the line parser at all.
//
// A pattern only ever matches against the FULL, TRIMMED message text (not a
// substring) — this avoids false positives on ordinary messages that merely
// *mention* a filename in a sentence.
// ============================================================================

import type { MediaKind } from './types.ts';

export interface MediaReference {
  /** The referenced filename, if the export included one. */
  filename: string | null;
  /**
   * Set when the export marks a message as media but the file itself was
   * never included ("image omitted" — happens with partial/selective
   * exports). There is no filename to match against media in the archive,
   * so this always results in `status = 'missing'` downstream.
   */
  omittedKind: string | null;
}

interface MediaPattern {
  regex: RegExp;
  /** Extract the result from a regex match. */
  extract: (match: RegExpMatchArray) => MediaReference;
}

const PATTERNS: MediaPattern[] = [
  // Older Android exports, Russian locale: "IMG-20260412-WA0013.jpg (файл добавлен)"
  {
    regex: /^(.+?)\s*\(файл добавлен\)$/i,
    extract: (m) => ({ filename: m[1].trim(), omittedKind: null }),
  },
  // Older Android exports, English locale: "IMG-20260412-WA0013.jpg (file attached)"
  {
    regex: /^(.+?)\s*\(file attached\)$/i,
    extract: (m) => ({ filename: m[1].trim(), omittedKind: null }),
  },
  // Newer WhatsApp export format (English): "<attached: IMG-20260412-WA0013.jpg>"
  {
    regex: /^<attached:\s*(.+?)>$/i,
    extract: (m) => ({ filename: m[1].trim(), omittedKind: null }),
  },
  // Newer WhatsApp export format (Russian): "<прикреплено: IMG-20260412-WA0013.jpg>"
  {
    regex: /^<прикреплено:\s*(.+?)>$/i,
    extract: (m) => ({ filename: m[1].trim(), omittedKind: null }),
  },
  // Media referenced but not present in this particular export (English,
  // e.g. iOS "without media" export option): "image omitted", "video omitted", ...
  {
    regex: /^(image|video|audio|gif|sticker|document|contact card)\s+omitted$/i,
    extract: (m) => ({ filename: null, omittedKind: m[1].toLowerCase() }),
  },
  // Best-effort Russian equivalent of the above. Exact wording varies by
  // WhatsApp version — extend this list if a real export uses different text.
  {
    regex: /^(изображение|видео|аудио|стикер|документ)\s+(?:отсутствует|не включ\w*)$/i,
    extract: (m) => ({ filename: null, omittedKind: m[1].toLowerCase() }),
  },
];

/** Matches only if the ENTIRE message text is a media reference. */
export function extractMediaReference(text: string): MediaReference | null {
  const trimmed = text.trim();
  for (const pattern of PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (match) return pattern.extract(match);
  }
  return null;
}

/**
 * Infer media kind from filename, using WhatsApp's own naming convention
 * first (IMG-/VID-/PTT-/AUD-/STK-/DOC- + date + WA-number), falling back to
 * file extension for anything that doesn't follow it (manually renamed
 * files, forwarded media, etc).
 */
export function classifyMediaKind(filename: string): MediaKind {
  const base = filename.trim().toUpperCase();

  if (base.startsWith('STK-')) return 'sticker';
  if (base.startsWith('IMG-')) return 'photo';
  if (base.startsWith('VID-')) return 'video';
  if (base.startsWith('PTT-') || base.startsWith('AUD-')) return 'audio';
  if (base.startsWith('DOC-')) return 'document';

  const ext = base.split('.').pop() ?? '';
  if (['JPG', 'JPEG', 'PNG', 'WEBP', 'HEIC', 'GIF'].includes(ext)) return 'photo';
  if (['MP4', 'MOV', '3GP', 'AVI', 'MKV', 'WEBM'].includes(ext)) return 'video';
  if (['OPUS', 'MP3', 'M4A', 'AAC', 'WAV', 'OGG'].includes(ext)) return 'audio';

  return 'document';
}
