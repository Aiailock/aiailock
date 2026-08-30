import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown,
  Bookmark,
  BookOpen,
  ChevronUp,
  Gauge,
  Map as MapIcon,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicTimelineCursor, PublicTimelineRow } from '@/lib/readerApi';
import {
  comparePublicTimelineRows,
  fetchPublicTimeline,
  preloadTimelineMedia,
  recordReaderAnalytics,
} from '@/lib/readerApi';
import StoryElement from './StoryElement';

interface ReadingPlace {
  elementId: string;
  position: number;
  progress: number;
  chapter: string;
}

interface LoaderState {
  phase: 'pages' | 'media' | 'ready' | 'error';
  progress: number;
  label: string;
  detail: string;
}

const READING_PLACE_KEY = 'for-you-reading-place-v3';
const BOOKMARK_KEY = 'for-you-reader-bookmark-v1';
const TEXT_SIZE_KEY = 'for-you-reader-text-size-v1';

function savedReadingPlace(): ReadingPlace | null {
  try {
    const value = JSON.parse(localStorage.getItem(READING_PLACE_KEY) ?? '') as Partial<ReadingPlace>;
    return value.elementId && Number(value.position) > 3
      ? { elementId: value.elementId, position: Number(value.position), progress: Number(value.progress) || 0, chapter: String(value.chapter ?? '') }
      : null;
  } catch { return null; }
}

function scrollToElement(id: string, behavior: ScrollBehavior = 'smooth') {
  document.querySelector<HTMLElement>(`[data-reader-element="${id}"]`)?.scrollIntoView({ behavior, block: 'start' });
}

function JourneyLoader({ state, onRetry }: { state: LoaderState; onRetry: () => void }) {
  const reduced = useReducedMotion();
  const isError = state.phase === 'error';
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#09090B] px-7 text-[#F4EFE6]"
      initial={false}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.65, ease: 'easeInOut' }}
      role="status"
      aria-live="polite"
    >
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(173,91,126,.24),transparent_33%),radial-gradient(circle_at_50%_82%,rgba(201,160,99,.12),transparent_38%)]" />
      <div aria-hidden className="cinema-vignette absolute inset-0" />
      <div className="relative w-full max-w-[360px] text-center">
        <motion.div
          animate={reduced || isError ? undefined : { rotate: [0, 8, -6, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold/30 bg-white/[.035] text-gold shadow-[0_0_55px_rgba(201,160,99,.12)]"
        >
          {isError ? <RotateCcw size={22} /> : <Sparkles size={23} />}
        </motion.div>
        <div className="mt-7 text-[10px] uppercase tracking-[4px] text-gold/60">подготавливаю путешествие</div>
        <h2 className="mt-3 font-serif text-[34px] leading-tight">{state.label}</h2>
        <p className="mx-auto mt-3 max-w-[280px] text-xs leading-relaxed text-white/42">{state.detail}</p>
        {!isError ? (
          <>
            <div className="mt-9 overflow-hidden rounded-full bg-white/[.07] p-[2px]">
              <motion.div className="h-1.5 rounded-full bg-gradient-to-r from-[#9D456B] via-gold to-[#F3D7A5]" animate={{ width: `${state.progress}%` }} transition={{ duration: 0.45, ease: 'easeOut' }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[2px] text-white/30"><span>страницы · фото · детали</span><span>{Math.round(state.progress)}%</span></div>
          </>
        ) : (
          <button type="button" onClick={onRetry} className="mt-8 rounded-full border border-gold/35 bg-gold/10 px-6 py-3 text-xs uppercase tracking-[2px] text-gold">Попробовать снова</button>
        )}
      </div>
    </motion.div>
  );
}

function JourneyTools({
  rows,
  progress,
  currentChapter,
  readingPlace,
}: {
  rows: PublicTimelineRow[];
  progress: number;
  currentChapter: string;
  readingPlace: ReadingPlace | null;
}) {
  const [open, setOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [textSize, setTextSize] = useState(() => localStorage.getItem(TEXT_SIZE_KEY) || 'normal');
  const [bookmark, setBookmark] = useState<ReadingPlace | null>(() => {
    try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY) ?? '') as ReadingPlace; } catch { return null; }
  });

  const chapters = useMemo(() => rows.filter((row) => row.type === 'chapter').map((row) => ({
    id: row.element_id,
    title: typeof row.metadata?.title === 'string' ? row.metadata.title : 'Новая глава',
  })), [rows]);
  const minutesLeft = Math.max(1, Math.ceil((rows.length * (100 - progress) / 100) * 0.18));

  useEffect(() => {
    document.documentElement.dataset.readerText = textSize;
    localStorage.setItem(TEXT_SIZE_KEY, textSize);
    return () => { delete document.documentElement.dataset.readerText; };
  }, [textSize]);

  useEffect(() => {
    if (!autoScroll) return;
    const timer = window.setInterval(() => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
        setAutoScroll(false);
        return;
      }
      window.scrollBy(0, 1);
    }, 34);
    return () => window.clearInterval(timer);
  }, [autoScroll]);

  function saveBookmark() {
    if (!readingPlace) return;
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(readingPlace));
    setBookmark(readingPlace);
  }

  function nextChapter() {
    const currentIndex = readingPlace ? rows.findIndex((row) => row.element_id === readingPlace.elementId) : -1;
    const next = rows.slice(currentIndex + 1).find((row) => row.type === 'chapter');
    if (next) scrollToElement(next.element_id);
    else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    setOpen(false);
  }

  return (
    <>
      <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-28px)] max-w-[410px] -translate-x-1/2">
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} className="mb-2 max-h-[68vh] overflow-y-auto rounded-[28px] border border-white/10 bg-[#131116]/95 p-4 text-[#F4EFE6] shadow-2xl backdrop-blur-2xl">
              <div className="flex items-center justify-between"><div><div className="text-[9px] uppercase tracking-[2.5px] text-gold/55">карта путешествия</div><div className="mt-1 font-serif text-xl">{currentChapter || 'Вся история'}</div></div><button type="button" aria-label="Закрыть" onClick={() => setOpen(false)} className="rounded-full bg-white/[.06] p-2 text-white/55"><X size={16}/></button></div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <button type="button" onClick={() => setAutoScroll((value) => !value)} className="rounded-2xl bg-white/[.055] p-3 text-left"><span className="flex items-center gap-2 text-gold">{autoScroll ? <Pause size={15}/> : <Play size={15}/>} Авточтение</span><span className="mt-1 block text-[10px] text-white/35">{autoScroll ? 'остановить движение' : 'медленно листать'}</span></button>
                <button type="button" onClick={saveBookmark} disabled={!readingPlace} className="rounded-2xl bg-white/[.055] p-3 text-left disabled:opacity-35"><span className="flex items-center gap-2 text-gold"><Bookmark size={15}/> Закладка</span><span className="mt-1 block text-[10px] text-white/35">сохранить это место</span></button>
                <button type="button" onClick={nextChapter} className="rounded-2xl bg-white/[.055] p-3 text-left"><span className="flex items-center gap-2 text-gold"><ArrowDown size={15}/> Дальше</span><span className="mt-1 block text-[10px] text-white/35">к следующей главе</span></button>
                <button type="button" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setOpen(false); }} className="rounded-2xl bg-white/[.055] p-3 text-left"><span className="flex items-center gap-2 text-gold"><ChevronUp size={15}/> В начало</span><span className="mt-1 block text-[10px] text-white/35">вернуться к обложке</span></button>
              </div>
              <div className="mt-3 rounded-2xl bg-white/[.04] p-3"><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-white/60"><Type size={14}/> Размер текста</span><div className="flex rounded-full bg-black/25 p-1">{[['small','А'],['normal','Аа'],['large','АА']].map(([id,label]) => <button type="button" key={id} onClick={() => setTextSize(id)} className={`rounded-full px-2.5 py-1 text-[10px] ${textSize === id ? 'bg-gold text-black' : 'text-white/45'}`}>{label}</button>)}</div></div></div>
              {bookmark?.elementId && <button type="button" onClick={() => { scrollToElement(bookmark.elementId); setOpen(false); }} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-gold/15 px-4 py-3 text-left text-xs text-gold/75"><span><Bookmark size={13} className="mr-2 inline"/>Открыть сохранённую закладку</span><span>{bookmark.progress}%</span></button>}
              {chapters.length > 0 && <div className="mt-4"><div className="mb-2 text-[9px] uppercase tracking-[2px] text-white/30">главы</div><div className="space-y-1">{chapters.map((chapter, index) => <button type="button" key={chapter.id} onClick={() => { scrollToElement(chapter.id); setOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/[.06]"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-gold/20 text-[9px] text-gold/65">{index + 1}</span><span className="min-w-0 flex-1 truncate font-serif text-base">{chapter.title}</span></button>)}</div></div>}
            </motion.div>
          )}
        </AnimatePresence>
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 rounded-full border border-white/10 bg-[#131116]/90 px-3 py-2.5 text-[#F4EFE6] shadow-2xl backdrop-blur-xl">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold"><MapIcon size={17}/></span>
          <span className="min-w-0 flex-1 text-left"><span className="block truncate text-[11px] text-white/62">{currentChapter || 'Путешествие по истории'}</span><span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/[.07]"><span className="block h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${progress}%` }}/></span></span>
          <span className="shrink-0 text-right"><span className="block text-xs text-gold">{progress}%</span><span className="flex items-center gap-1 text-[9px] text-white/30"><Gauge size={10}/>{minutesLeft} мин</span></span>
        </button>
      </div>
      {autoScroll && <button type="button" onClick={() => setAutoScroll(false)} className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-[10px] uppercase tracking-[2px] text-white/65 backdrop-blur"><Pause size={12} className="mr-1 inline"/>пауза</button>}
    </>
  );
}

export default function TimelineStory({ token, track = true }: { token: string; track?: boolean }) {
  const [rows, setRows] = useState<PublicTimelineRow[]>([]);
  const [booting, setBooting] = useState(true);
  const [loader, setLoader] = useState<LoaderState>({ phase: 'pages', progress: 4, label: 'Собираю страницы', detail: 'Текст, даты и главы выстраиваются в правильном порядке.' });
  const [retryKey, setRetryKey] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [readProgress, setReadProgress] = useState(0);
  const [readingPlace, setReadingPlace] = useState<ReadingPlace | null>(() => track ? savedReadingPlace() : null);
  const [currentChapter, setCurrentChapter] = useState('');
  const runId = useRef(0);
  const visitId = useRef(crypto.randomUUID());
  const lastReported = useRef({ id: '', progress: 0 });

  const loadJourney = useCallback(async () => {
    const currentRun = ++runId.current;
    setBooting(true);
    setRows([]);
    setLoader({ phase: 'pages', progress: 4, label: 'Собираю страницы', detail: 'Текст, даты и главы выстраиваются в правильном порядке.' });
    try {
      let cursor: PublicTimelineCursor | null = null;
      let hasMore = true;
      let page = 0;
      const collected = new Map<string, PublicTimelineRow>();
      while (hasMore && page < 250) {
        const result = await fetchPublicTimeline(cursor, token);
        if (currentRun !== runId.current) return;
        result.elements.forEach((row) => collected.set(row.element_id, row));
        cursor = result.nextCursor;
        hasMore = result.hasMore && Boolean(cursor);
        page += 1;
        setLoader({ phase: 'pages', progress: Math.min(54, 8 + page * 7), label: 'Собираю страницы', detail: `Уже найдено ${collected.size.toLocaleString('ru-RU')} фрагментов истории.` });
      }
      if (page >= 250 && hasMore) throw new Error('История слишком большая для одной загрузки.');

      const ordered = Array.from(collected.values()).sort(comparePublicTimelineRows);
      setLoader({ phase: 'media', progress: 56, label: 'Проявляю воспоминания', detail: 'Фотографии и обложки загружаются заранее, чтобы чтение не прерывалось.' });
      await preloadTimelineMedia(ordered, token, (completed, mediaTotal) => {
        if (currentRun !== runId.current) return;
        const ratio = mediaTotal ? completed / mediaTotal : 1;
        setLoader({ phase: 'media', progress: 56 + ratio * 40, label: 'Проявляю воспоминания', detail: mediaTotal ? `${completed} из ${mediaTotal} медиа готовы.` : 'Все страницы готовы.' });
      });
      if (currentRun !== runId.current) return;
      setRows(ordered);
      setLoader({ phase: 'ready', progress: 100, label: 'Можно начинать', detail: `${ordered.length.toLocaleString('ru-RU')} фрагментов выстроены в одно путешествие.` });
      window.setTimeout(() => { if (currentRun === runId.current) setBooting(false); }, 450);
    } catch (error) {
      if (currentRun !== runId.current) return;
      setLoader({ phase: 'error', progress: 0, label: 'История не открылась', detail: error instanceof Error ? error.message : 'Проверь соединение и попробуй ещё раз.' });
    }
  }, [token]);

  useEffect(() => {
    void loadJourney();
    return () => { runId.current += 1; };
  }, [loadJourney, retryKey]);

  const renderedRows = useMemo(() => {
    const result: Array<{ row: PublicTimelineRow; galleryRows?: PublicTimelineRow[]; position: number }> = [];
    rows.forEach((row, index) => {
      const groupId = row.screenshot_collection_id;
      if (!groupId) { result.push({ row, position: index + 1 }); return; }
      const firstIndex = rows.findIndex((candidate) => candidate.screenshot_collection_id === groupId);
      if (firstIndex !== index) return;
      const galleryRows = rows.filter((candidate) => candidate.screenshot_collection_id === groupId);
      const lastPosition = Math.max(...galleryRows.map((candidate) => rows.indexOf(candidate) + 1));
      result.push({ row, galleryRows, position: lastPosition });
    });
    return result;
  }, [rows]);

  useEffect(() => {
    if (!track || booting) return;
    const key = 'for-you-reader-id';
    let visitorId = localStorage.getItem(key);
    if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem(key, visitorId); }
    void recordReaderAnalytics({ action: 'open', visitorId, visitId: visitId.current }, token).then((result) => {
      if (result.total !== null) setTotal(result.total);
    });
  }, [token, track, booting]);

  useEffect(() => {
    if (!track || booting || rows.length === 0) return;
    const visitorId = localStorage.getItem('for-you-reader-id');
    if (!visitorId) return;
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reader-element]'));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      const target = visible[0]?.target as HTMLElement | undefined;
      if (!target) return;
      const position = Number(target.dataset.readerPosition ?? 0);
      const elementId = target.dataset.readerElement ?? '';
      if (!elementId || !position) return;
      const denominator = total ?? rows.length;
      const progress = Math.max(1, Math.min(100, Math.round((position / Math.max(1, denominator)) * 100)));
      setReadProgress((current) => Math.max(current, progress));
      const rowIndex = rows.findIndex((row) => row.element_id === elementId);
      const chapterRow = rowIndex >= 0 ? [...rows.slice(0, rowIndex + 1)].reverse().find((row) => row.type === 'chapter') : null;
      const chapter = chapterRow && typeof chapterRow.metadata?.title === 'string' ? chapterRow.metadata.title : currentChapter;
      if (chapter) setCurrentChapter(chapter);
      if (position > 3) {
        const place = { elementId, position, progress, chapter: chapter || '' };
        localStorage.setItem(READING_PLACE_KEY, JSON.stringify(place));
        setReadingPlace(place);
      }
      if (lastReported.current.id === elementId && progress <= lastReported.current.progress) return;
      lastReported.current = { id: elementId, progress };
      window.clearTimeout(Number(target.dataset.readerTimer ?? 0));
      const timer = window.setTimeout(() => {
        void recordReaderAnalytics({ action: progress >= 99 ? 'complete' : 'progress', visitorId, visitId: visitId.current, elementId, position, progress }, token);
      }, 900);
      target.dataset.readerTimer = String(timer);
    }, { threshold: [0.35, 0.65], rootMargin: '-12% 0px -18%' });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [rows, total, token, track, currentChapter, booting]);

  return <div className="w-full">
    <AnimatePresence>{booting && <JourneyLoader state={loader} onRetry={() => setRetryKey((value) => value + 1)} />}</AnimatePresence>
    {!booting && rows.length === 0 && <div className="mx-auto max-w-md px-6 py-28 text-center font-serif text-2xl opacity-55">Здесь пока пусто.</div>}
    {!booting && rows.length > 0 && <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-px bg-white/5"><div className="h-full bg-gold/80 transition-[width] duration-700" style={{ width: `${readProgress}%` }} /></div>
      {currentChapter && <div className="pointer-events-none fixed inset-x-0 top-3 z-30 text-center"><span className="inline-block max-w-[78vw] truncate rounded-full bg-black/35 px-4 py-1.5 text-[9px] uppercase tracking-[2px] text-gold/65 backdrop-blur-md">{currentChapter}</span></div>}
      {readingPlace && <div className="flex min-h-[24vh] items-center justify-center bg-[#0B0B0D] px-6"><button type="button" onClick={() => scrollToElement(readingPlace.elementId)} className="group border-y border-gold/25 px-7 py-6 text-center text-[#F4EFE6] transition hover:border-gold/50"><BookOpen className="mx-auto text-gold/70" size={20}/><span className="mt-3 block font-serif text-xl">Продолжить с места</span><span className="mt-1 block text-[10px] uppercase tracking-[2px] text-white/35">прочитано {readingPlace.progress}%{readingPlace.chapter ? ` · ${readingPlace.chapter}` : ''}</span></button></div>}
      {renderedRows.map(({ row, galleryRows, position }) => <div key={row.screenshot_collection_id ?? row.element_id} data-reader-element={row.element_id} data-reader-position={position}><StoryElement row={row} galleryRows={galleryRows} token={token} /></div>)}
      <div className="bg-[#0B0B0D] px-6 pb-40 pt-24 text-center text-[#F4EFE6]"><div className="mx-auto h-px w-20 bg-gold/50" /><p className="mt-6 font-script text-3xl text-[#F4EFE6]/75">продолжение следует</p><p className="mt-2 text-xs uppercase tracking-[2px] text-gold/40">новая глава появится здесь</p></div>
      <JourneyTools rows={rows} progress={readProgress} currentChapter={currentChapter} readingPlace={readingPlace} />
    </>}
  </div>;
}
