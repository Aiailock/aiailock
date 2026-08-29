// Detects the two structural WhatsApp text-export header families used by the
// parser. It intentionally works on normalized text and returns a confidence
// rather than guessing a locale for ambiguous slash dates.
export type WhatsAppExportFormat = 'dash' | 'bracket' | 'mixed' | 'unknown';

const BRACKET = /^\[\d{1,4}[./-]\d{1,2}[./-]\d{1,4},?\s+\d{1,2}:\d{2}/m;
const DASH = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4},?\s+\d{1,2}:\d{2}\s*[-–—]/m;

export interface FormatDetection {
  format: WhatsAppExportFormat;
  confidence: number;
}

export function detectExportFormat(rawText: string): FormatDetection {
  const bracket = rawText.split('\n').filter((line) => BRACKET.test(line)).length;
  const dash = rawText.split('\n').filter((line) => DASH.test(line)).length;
  if (bracket === 0 && dash === 0) return { format: 'unknown', confidence: 0 };
  if (bracket && dash) return { format: 'mixed', confidence: 0.7 };
  const total = bracket + dash;
  return { format: bracket ? 'bracket' : 'dash', confidence: Math.min(1, total >= 3 ? 1 : 0.8) };
}
