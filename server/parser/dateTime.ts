// ============================================================================
// dateTime — turns the (dateStr, timeStr) pair captured from a WhatsApp
// export header into a stable ISO-8601 timestamp.
//
// Design decision (documented because it's not obvious): WhatsApp export
// timestamps carry NO timezone information at all — just the wall-clock time
// as it was on the phone that exported the chat. We deliberately do NOT try
// to guess a real-world timezone/instant. Instead we treat the digits
// exactly as written and encode them as UTC (via Date.UTC), which:
//   - guarantees correct chronological ORDER (all that actually matters for
//     a diary/timeline — never a cross-timezone comparison against "now"),
//   - is 100% reproducible regardless of the admin's machine timezone when
//     the import runs (we never call `new Date(someLocaleString)`, which is
//     locale/timezone-dependent and notoriously unreliable),
//   - is simple to explain in the README.
// If the two participants' phones ever had wall-clock skew between them,
// that's a pre-existing property of the source data, not something this
// parser can or should try to correct.
// ============================================================================

export interface ParsedDateTime {
  iso: string; // e.g. "2026-04-12T14:23:00.000Z"
  valid: boolean;
}

const DATE_SPLIT = /[./-]/;

/**
 * Resolve (partA, partB, partC, separator) into a { year, month, day } guess.
 *
 * Heuristic (documented, not hidden magic):
 *  - separator '.' or '-' with a 4-digit first part → ISO-ish YYYY.MM.DD.
 *  - separator '.' or '-' otherwise → DD.MM.YYYY (matches the Android/European
 *    convention the product's own spec example uses: "ДД.ММ.ГГГГ").
 *  - separator '/' → MM/DD/YYYY (common iPhone/US export convention), UNLESS
 *    the first part is > 12 (impossible as a month), in which case it must be
 *    DD/MM/YYYY.
 *  - 2-digit years: 00–79 → 20xx, 80–99 → 19xx (rough but sane default; real
 *    WhatsApp exports with 2-digit years are effectively always 20xx anyway).
 */
function resolveDateParts(
  a: number,
  b: number,
  c: number,
  separator: string,
): { year: number; month: number; day: number } | null {
  const normalizeYear = (y: number) => (y < 100 ? (y <= 79 ? 2000 + y : 1900 + y) : y);

  let year: number;
  let month: number;
  let day: number;

  if (separator === '/') {
    if (a > 12) {
      // Can't be a month → must be day-first.
      day = a;
      month = b;
      year = normalizeYear(c);
    } else {
      month = a;
      day = b;
      year = normalizeYear(c);
    }
  } else {
    // '.' or '-'
    if (String(a).length === 4) {
      year = a;
      month = b;
      day = c;
    } else {
      day = a;
      month = b;
      year = normalizeYear(c);
    }
  }

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1990 || year > 2100) return null;

  return { year, month, day };
}

export function parseDateTime(dateStr: string, timeStr: string): ParsedDateTime {
  const dateParts = dateStr.trim().split(DATE_SPLIT);
  const sepMatch = dateStr.match(DATE_SPLIT);
  if (dateParts.length !== 3 || !sepMatch) {
    return { iso: '', valid: false };
  }
  const [a, b, c] = dateParts.map((p) => parseInt(p, 10));
  if ([a, b, c].some((n) => Number.isNaN(n))) {
    return { iso: '', valid: false };
  }

  const resolved = resolveDateParts(a, b, c, sepMatch[0]);
  if (!resolved) return { iso: '', valid: false };

  const timeMatch = timeStr
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?$/);
  if (!timeMatch) return { iso: '', valid: false };

  let hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);
  const second = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
  const meridiem = timeMatch[4]?.toUpperCase();

  if (minute > 59 || second > 59) return { iso: '', valid: false };

  if (meridiem) {
    if (hour < 1 || hour > 12) return { iso: '', valid: false };
    if (meridiem === 'AM') {
      hour = hour === 12 ? 0 : hour;
    } else {
      hour = hour === 12 ? 12 : hour + 12;
    }
  } else if (hour > 23) {
    return { iso: '', valid: false };
  }

  const ms = Date.UTC(resolved.year, resolved.month - 1, resolved.day, hour, minute, second);
  if (Number.isNaN(ms)) return { iso: '', valid: false };

  return { iso: new Date(ms).toISOString(), valid: true };
}
