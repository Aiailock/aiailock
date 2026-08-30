import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, LoaderCircle } from 'lucide-react';
import type { PublicTimelineCursor, PublicTimelineRow } from '@/lib/readerApi';
import { fetchPublicTimeline, fetchResumeTimeline, recordReaderAnalytics } from '@/lib/readerApi';
import StoryElement from './StoryElement';

interface ReadingPlace {
  elementId: string;
  position: number;
  progress: number;
  chapter: string;
}

const READING_PLACE_KEY = 'for-you-reading-place-v2';

function savedReadingPlace(): ReadingPlace | null {
  try {
    const value = JSON.parse(localStorage.getItem(READING_PLACE_KEY) ?? '') as Partial<ReadingPlace>;
    return value.elementId && Number(value.position) > 3
      ? { elementId: value.elementId, position: Number(value.position), progress: Number(value.progress) || 0, chapter: String(value.chapter ?? '') }
      : null;
  } catch { return null; }
}

export default function TimelineStory({ token, track = true }: { token: string; track?: boolean }) {
  const [rows, setRows] = useState<PublicTimelineRow[]>([]);
  const [cursor, setCursor] = useState<PublicTimelineCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [readProgress, setReadProgress] = useState(0);
  const [basePosition, setBasePosition] = useState(0);
  const [readingPlace, setReadingPlace] = useState<ReadingPlace | null>(() => track ? savedReadingPlace() : null);
  const [currentChapter, setCurrentChapter] = useState('');
  const [resuming, setResuming] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const visitId = useRef(crypto.randomUUID());
  const lastReported = useRef({ id: '', progress: 0 });

  const renderedRows: Array<{ row: PublicTimelineRow; galleryRows?: PublicTimelineRow[]; position: number }> = [];
  rows.forEach((row, index) => {
    const groupId = row.screenshot_collection_id;
    if (!groupId) { renderedRows.push({ row, position: index + 1 }); return; }
    const firstIndex = rows.findIndex((candidate) => candidate.screenshot_collection_id === groupId);
    if (firstIndex !== index) return;
    const galleryRows = rows.filter((candidate) => candidate.screenshot_collection_id === groupId);
    const lastPosition = Math.max(...galleryRows.map((candidate) => rows.indexOf(candidate) + 1));
    renderedRows.push({ row, galleryRows, position: lastPosition });
  });

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

  const resumeReading = useCallback(async () => {
    if (!readingPlace || resuming) return;
    setResuming(true);
    try {
      const result = await fetchResumeTimeline(readingPlace.elementId, token);
      setRows(result.elements);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setBasePosition(Math.max(0, readingPlace.position - 1));
      setReadProgress(readingPlace.progress);
      setCurrentChapter(readingPlace.chapter);
      window.setTimeout(() => document.querySelector<HTMLElement>(`[data-reader-element="${readingPlace.elementId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось продолжить чтение.');
      localStorage.removeItem(READING_PLACE_KEY);
      setReadingPlace(null);
    } finally { setResuming(false); }
  }, [readingPlace, resuming, token]);

  useEffect(() => {
    if (!track || rows.length === 0) return;
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
      const denominator = total ?? Math.max(index, rows.length + (hasMore ? 45 : 0));
      const progress = Math.max(1, Math.min(100, Math.round((index / denominator) * 100)));
      setReadProgress((current) => Math.max(current, progress));
      const rowIndex = rows.findIndex((row) => row.element_id === elementId);
      const chapterRow = rowIndex >= 0 ? [...rows.slice(0, rowIndex + 1)].reverse().find((row) => row.type === 'chapter') : null;
      const chapter = chapterRow && typeof chapterRow.metadata?.title === 'string' ? chapterRow.metadata.title : currentChapter;
      if (chapter) setCurrentChapter(chapter);
      if (index > 3) {
        const place = { elementId, position: index, progress, chapter: chapter || '' };
        localStorage.setItem(READING_PLACE_KEY, JSON.stringify(place));
        setReadingPlace(place);
      }
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
  }, [rows, total, token, hasMore, track, currentChapter]);

  if (error && rows.length === 0) return <div className="mx-auto max-w-md px-6 py-20 text-center text-sm opacity-60">История пока не открылась. {error}</div>;
  if (!loading && rows.length === 0) return <div className="mx-auto max-w-md px-6 py-28 text-center font-serif text-2xl opacity-55">Здесь пока пусто.</div>;

  return <div className="w-full">
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-px bg-white/5"><div className="h-full bg-gold/80 transition-[width] duration-700" style={{ width: `${readProgress}%` }} /></div>
    {currentChapter && <div className="pointer-events-none fixed inset-x-0 top-3 z-30 text-center"><span className="inline-block max-w-[78vw] truncate rounded-full bg-black/35 px-4 py-1.5 text-[9px] uppercase tracking-[2px] text-gold/65 backdrop-blur-md">{currentChapter}</span></div>}
    {readingPlace && basePosition === 0 && <div className="flex min-h-[24vh] items-center justify-center bg-[#0B0B0D] px-6"><button type="button" onClick={() => void resumeReading()} disabled={resuming} className="group border-y border-gold/25 px-7 py-6 text-center text-[#F4EFE6] transition hover:border-gold/50 disabled:opacity-45"><BookOpen className="mx-auto text-gold/70" size={20}/><span className="mt-3 block font-serif text-xl">{resuming ? 'Открываю…' : 'Продолжить с места'}</span><span className="mt-1 block text-[10px] uppercase tracking-[2px] text-white/35">прочитано {readingPlace.progress}%{readingPlace.chapter ? ` · ${readingPlace.chapter}` : ''}</span></button></div>}
    {error && rows.length > 0 && <div className="bg-[#0B0B0D] px-6 py-3 text-center text-xs text-amber-200/70">{error}</div>}
    {renderedRows.map(({ row, galleryRows, position }) => <div key={row.screenshot_collection_id ?? row.element_id} data-reader-element={row.element_id} data-reader-position={basePosition + position}><StoryElement row={row} galleryRows={galleryRows} token={token} /></div>)}
    <div ref={sentinel} className="flex min-h-24 items-center justify-center">{loading && <LoaderCircle className="animate-spin opacity-35" size={20} />}</div>
    {!hasMore && rows.length > 0 && <div className="bg-[#0B0B0D] px-6 pb-32 pt-20 text-center text-[#F4EFE6]"><div className="mx-auto h-px w-20 bg-gold/50" /><p className="mt-6 font-script text-3xl text-[#F4EFE6]/75">продолжение следует</p><p className="mt-2 text-xs uppercase tracking-[2px] text-gold/40">новая глава появится здесь</p></div>}
  </div>;
}
