import type { PublicTimelineCursor, PublicTimelineRow } from './readerApi';
type Page = {
  elements: PublicTimelineRow[];
  hasMore: boolean;
  nextCursor: PublicTimelineCursor | null;
  positionOffset: number;
};
// Build a replacement snapshot. Never merge old rows: deletions must disappear.
export async function refreshReaderWindow<T extends Page>(
  snapshot: { rows: PublicTimelineRow[]; positionOffset: number },
  api: { first: () => Promise<T>; resume: (id: string) => Promise<T>; next: (cursor: PublicTimelineCursor) => Promise<T> },
  cancelled: () => boolean,
): Promise<T> {
  let result: T | undefined;
  if (snapshot.positionOffset > 0) {
    for (const row of snapshot.rows.slice(0, 3)) {
      if (cancelled()) throw new Error('cancelled');
      try { result = await api.resume(row.element_id); break; } catch { /* deleted first row or temporary failure */ }
    }
  }
  result ??= await api.first();
  const offset = result.positionOffset;
  let rows = result.elements;
  const wanted = Math.max(45, snapshot.rows.length);
  const seen = new Set<string>();
  while (result.hasMore && rows.length < wanted && result.nextCursor && !cancelled()) {
    const key = `${result.nextCursor.displayOrder}:${result.nextCursor.id}`;
    if (seen.has(key)) throw new Error('Cursor did not advance');
    seen.add(key);
    result = await api.next(result.nextCursor);
    rows = rows.concat(result.elements);
  }
  return { ...result, positionOffset: offset, elements: Array.from(new Map(rows.map((row) => [row.element_id, row])).values()) };
}
