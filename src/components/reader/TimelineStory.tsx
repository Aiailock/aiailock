import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { PublicTimelineCursor, PublicTimelineRow } from '@/lib/readerApi';
import { fetchPublicTimeline } from '@/lib/readerApi';
import StoryElement from './StoryElement';

export default function TimelineStory({ token }: { token: string }) {
  const [rows, setRows] = useState<PublicTimelineRow[]>([]);
  const [cursor, setCursor] = useState<PublicTimelineCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async (nextCursor: PublicTimelineCursor | null) => {
    if (loadingRef.current || (!nextCursor && rows.length > 0)) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await fetchPublicTimeline(nextCursor, token);
      setRows((prev) => nextCursor ? [...prev, ...result.elements] : result.elements);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить историю.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [rows.length, token]);

  useEffect(() => { void load(null); }, [load]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && cursor) void load(cursor);
    }, { rootMargin: '900px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [cursor, hasMore, load]);

  if (error && rows.length === 0) return <div className="mx-auto max-w-md px-6 py-20 text-center text-sm opacity-60">История пока не открылась. {error}</div>;
  if (!loading && rows.length === 0) return <div className="mx-auto max-w-md px-6 py-28 text-center font-serif text-2xl opacity-55">Здесь пока пусто.</div>;

  return <div className="w-full">{rows.map((row) => <StoryElement key={row.element_id} row={row} token={token} />)}<div ref={sentinel} className="flex min-h-24 items-center justify-center">{loading && <LoaderCircle className="animate-spin opacity-35" size={20} />}</div>{!hasMore && rows.length > 0 && <div className="px-6 pb-32 pt-20 text-center"><div className="mx-auto h-px w-20 bg-gold/50" /><p className="mt-6 font-script text-3xl text-burgundy">продолжение следует</p><p className="mt-2 text-xs uppercase tracking-[2px] opacity-35">новая глава появится здесь</p></div>}</div>;
}
