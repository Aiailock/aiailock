export { parseChatExport } from './lineParser.ts';
export { computeFingerprint } from './fingerprint.ts';
export { classifyMediaKind, extractMediaReference } from './mediaPatterns.ts';
export { parseDateTime } from './dateTime.ts';
export { normalizeExportText } from './textNormalize.ts';
export * from './types.ts';
export { detectExportFormat } from './formatDetector.ts';
export { validateParsedMessages, validateFingerprints } from './validator.ts';

import { parseChatExport } from './lineParser.ts';
import { computeFingerprint } from './fingerprint.ts';
import type { FingerprintedMessage, ParseWarning } from './types.ts';
import { detectExportFormat } from './formatDetector.ts';
import { validateParsedMessages, validateFingerprints } from './validator.ts';

export interface ParseAndFingerprintResult {
  messages: FingerprintedMessage[];
  warnings: ParseWarning[];
  format: ReturnType<typeof detectExportFormat>;
}

/**
 * Convenience wrapper: parse the raw chat text AND compute every message's
 * dedup fingerprint in one call. This is what the import edge function uses.
 */
export async function parseAndFingerprint(rawText: string): Promise<ParseAndFingerprintResult> {
  const { messages, warnings } = parseChatExport(rawText);
  const format = detectExportFormat(rawText);
  const validation = validateParsedMessages(messages);
  const fingerprinted: FingerprintedMessage[] = await Promise.all(
    messages.map(async (m) => ({ ...m, fingerprint: await computeFingerprint(m) })),
  );
  const fingerprintValidation = validateFingerprints(fingerprinted);
  const allWarnings = [...warnings, ...validation.warnings, ...fingerprintValidation.warnings];
  if (format.format === 'unknown') allWarnings.push({ line: 1, message: 'Формат WhatsApp-экспорта не распознан: не найдено ни одной строки-заголовка сообщения.' });
  return { messages: fingerprinted, warnings: allWarnings, format };
}
