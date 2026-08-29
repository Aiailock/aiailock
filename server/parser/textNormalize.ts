// ============================================================================
// textNormalize — strips WhatsApp/Unicode artifacts that carry no real
// content, so they never leak into original_text / fingerprints / the reader.
//
// WhatsApp's exporter (both Android and iOS, across locales) litters the
// .txt file with invisible bidi-control characters — most commonly U+200E
// (LEFT-TO-RIGHT MARK), which it prepends to media placeholder lines and
// sometimes sender names. It also uses a narrow no-break space (U+202F) or a
// regular no-break space (U+00A0) between the time and "AM"/"PM" on iOS
// exports, which a naive regex with a plain " " would miss.
//
// This module is intentionally the ONLY place that touches raw bytes this
// way — everything downstream (line parsing, sender/text split, fingerprint)
// assumes it has already run.
// ============================================================================

// Zero-width / bidi-control characters WhatsApp is known to emit. Safe to
// strip unconditionally: they are never meaningful message content for a
// reader, only export-format plumbing.
const INVISIBLE_CONTROL_CHARS = /[\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069\uFEFF]/g;

// Non-breaking / narrow-no-break spaces used before AM/PM on iOS exports —
// collapse to a regular space so downstream regexes only need to match `' '`.
const SPECIAL_SPACES = /[\u00A0\u202F]/g;

export function normalizeExportText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '') // BOM, if present
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(INVISIBLE_CONTROL_CHARS, '')
    .replace(SPECIAL_SPACES, ' ');
}
