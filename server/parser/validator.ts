import type { FingerprintedMessage, ParseWarning, RawParsedMessage } from './types.ts';

export interface ParseValidation {
  valid: boolean;
  warnings: ParseWarning[];
}

export function validateParsedMessages(messages: RawParsedMessage[]): ParseValidation {
  const warnings: ParseWarning[] = [];
  messages.forEach((message, index) => {
    const line = index + 1;
    if (!message.sentAtIso || Number.isNaN(Date.parse(message.sentAtIso))) {
      warnings.push({ line, message: 'Сообщение содержит некорректную дату/время.' });
    }
    if (!message.isSystemMessage && !message.senderName.trim()) {
      warnings.push({ line, message: 'У пользовательского сообщения отсутствует отправитель.' });
    }
  });
  return { valid: messages.length > 0 && warnings.filter((x) => x.message.includes('некорректную дату')).length === 0, warnings };
}

export function validateFingerprints(messages: FingerprintedMessage[]): ParseValidation {
  const seen = new Set<string>();
  const warnings: ParseWarning[] = [];
  messages.forEach((message, index) => {
    if (seen.has(message.fingerprint)) warnings.push({ line: index + 1, message: 'Внутренний duplicate fingerprint в одном экспортированном файле.' });
    seen.add(message.fingerprint);
  });
  return { valid: warnings.length === 0, warnings };
}
