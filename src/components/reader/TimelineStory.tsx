import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { PublicTimelineCursor, PublicTimelineRow } from '@/lib/readerApi';
import { fetchPublicTimeline, recordReaderAnalytics } from '@/lib/readerApi';
import StoryElement from './StoryElement';

export default function TimelineStory({ token, track = true }: { token: string; track?: boolean }) {
  const [rows, setRows] = useState<PublicTimelineRow[]>([]);
  const [cursor, setCursor] = useState<PublicTimelineCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [readProgress, setReadProgress] = useState(0);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const visitId = useRef(crypto.randomUUID());
  const lastReported = useRef({ id: '', progress: 0 });

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
    if (!track) return;
    const key = 'for-you-reader-id';
    let visitorId = localStorage.getItem(key);
    if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem(key, visitorId); }
    void recordReaderAnalytics({ action: 'open', visitorId, visitId: visitId.current }, token).then((result) => {
      if (result.total !== null) setTotal(result.total);
    });
  }, [token, track]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && cursor) void load(cursor);
    }, { rootMargin: '900px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [cursor, hasMore, load]);

  useEffect(() => {
    if (!track || rows.length === 0 || total === null) return;
    const visitorId = localStorage.getItem('for-you-reader-id');
    if (!visitorId) return;
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reader-element]'));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      const target = visible[0]?.target as HTMLElement | undefined;
      if (!target) return;
      const index = Number(target.dataset.readerPosition ?? 0);
      const elementId = target.dataset.readerElement ?? '';
      if (!elementId || !index) return;
      const denominator = total;
      const progress = Math.max(1, Math.min(100, Math.round((index / denominator) * 100)));
      setReadProgress((current) => Math.max(current, progress));
      if (lastReported.current.id === elementId && progress <= lastReported.current.progress) return;
      lastReported.current = { id: elementId, progress };
      window.clearTimeout(Number(target.dataset.readerTimer ?? 0));
      const timer = window.setTimeout(() => {
        void recordReaderAnalytics({ action: progress >= 99 && !hasMore ? 'complete' : 'progress', visitorId, visitId: visitId.current, elementId, position: index, progress }, token);
      }, 900);
      target.dataset.readerTimer = String(timer);
    }, { threshold: [0.35, 0.65], rootMargin: '-12% 0px -18%' });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [rows, total, token, hasMore, track]);

  if (error && rows.length === 0) return <div className="mx-auto max-w-md px-6 py-20 text-center text-sm opacity-60">История пока не открылась. {error}</div>;
  if (!loading && rows.length === 0) return <div className="mx-auto max-w-md px-6 py-28 text-center font-serif text-2xl opacity-55">Здесь пока пусто.</div>;

  return <div className="w-full">
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-1 bg-black/5"><div className="h-full bg-gradient-to-r from-burgundy via-[#b66b7f] to-gold transition-[width] duration-700" style={{ width: `${readProgress}%` }} /></div>
    {rows.map((row, index) => <div key={row.element_id} data-reader-element={row.element_id} data-reader-position={index + 1}><StoryElement row={row} token={token} /></div>)}
    <div ref={sentinel} className="flex min-h-24 items-center justify-center">{loading && <LoaderCircle className="animate-spin opacity-35" size={20} />}</div>
    {!hasMore && rows.length > 0 && <div className="px-6 pb-32 pt-20 text-center"><div className="mx-auto h-px w-20 bg-gold/50" /><p className="mt-6 font-script text-3xl text-burgundy">продолжение следует</p><p className="mt-2 text-xs uppercase tracking-[2px] opacity-35">новая глава появится здесь</p></div>}
  </div>;
}
