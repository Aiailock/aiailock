import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDown,
  Bookmark,
  BookOpen,
  ChevronUp,
  Focus,
  Gauge,
  Heart,
  Map as MapIcon,
  Pencil,
  Pause,
  Play,
  RotateCcw,
  Rows3,
  Search,
  ShieldCheck,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicChapterSummary, PublicTimelineCursor, PublicTimelineRow } from '@/lib/readerApi';
import {
  comparePublicTimelineRows,
  fetchPublicTimeline,
  fetchResumeTimeline,
  preloadTimelineMedia,
  recordReaderAnalytics,
} from '@/lib/readerApi';
import { useReaderSettings } from '@/lib/readerSettingsContext';
import StoryElement from './StoryElement';

const ReaderPreviewEditor = lazy(() => import('@/pages/admin/ReaderPreviewEditor'));

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

function StoryEnding() {
  const reduced = useReducedMotion();
  const [opened, setOpened] = useState(() => localStorage.getItem('for-you-ending-heart-v1') === '1');
  function openHeart() {
    localStorage.setItem('for-you-ending-heart-v1', '1');
    setOpened(true);
  }
  return <section className="relative overflow-hidden bg-[#0B0B0D] px-6 pb-40 pt-24 text-center text-[#F4EFE6]">
    <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgba(151,61,92,.16),transparent_34%)]"/>
    <div className="relative mx-auto max-w-sm">
      <div className="mx-auto h-px w-20 bg-gold/50" />
      <p className="mt-6 font-script text-3xl text-[#F4EFE6]/75">ты дошла до края этой страницы</p>
      {!opened ? <button type="button" onClick={openHeart} className="group mx-auto mt-8 flex min-h-12 items-center gap-2 rounded-full border border-gold/25 bg-white/[.035] px-5 py-3 text-xs text-gold transition hover:border-gold/50 hover:bg-white/[.06]"><Heart size={16} className="transition group-hover:scale-110"/>Оставить здесь сердечко</button>
        : <motion.div initial={reduced ? false : { opacity: 0, y: 12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="mt-8 rounded-[28px] border border-gold/15 bg-white/[.035] px-6 py-7"><Heart size={20} fill="currentColor" className="mx-auto text-gold"/><p className="mt-4 font-serif text-xl leading-relaxed text-[#F4EFE6]/85">Спасибо, что читаешь. Для меня это не просто сайт — это место, где я бережно храню нас.</p><p className="mt-4 font-script text-2xl text-gold/70">продолжение обязательно будет ♡</p></motion.div>}
    </div>
  </section>;
}

const READING_PLACE_KEY = 'for-you-reading-place-v3';
const BOOKMARK_KEY = 'for-you-reader-bookmark-v1';
const TEXT_SIZE_KEY = 'for-you-reader-text-size-v1';
const READER_DENSITY_KEY = 'for-you-reader-density-v1';
const READER_FOCUS_KEY = 'for-you-reader-focus-v1';

function searchableRowText(row: PublicTimelineRow) {
  return [
    row.sender_name,
    row.original_text,
    row.display_text,
    row.memory_title,
    row.memory_body,
    row.screenshot_title,
    row.screenshot_caption,
    row.screenshot_description,
    ...Object.values(row.metadata ?? {}).filter((value): value is string => typeof value === 'string'),
  ].filter(Boolean).join(' ').toLocaleLowerCase('ru');
}

function savedReadingPlace(): ReadingPlace | null {
  try {
    const value = JSON.parse(localStorage.getItem(READING_PLACE_KEY) ?? '') as Partial<ReadingPlace>;
    return value.elementId && Number(value.position) > 0
      ? { elementId: value.elementId, position: Number(value.position), progress: Number(value.progress) || 0, chapter: String(value.chapter ?? '') }
      : null;
  } catch { return null; }
}

function scrollToElement(id: string, behavior: ScrollBehavior = 'smooth') {
  document.querySelector<HTMLElement>(`[data-reader-element="${id}"]`)?.scrollIntoView({ behavior, block: 'start' });
}

function nearestVisualMedia(rows: PublicTimelineRow[], count = 2) {
  return rows.filter((row) => Boolean(
    row.media_id
    || row.screenshot_id
    || row.memory_photo_storage_path
    || (typeof row.style?.externalMediaUrl === 'string' && row.style.externalMediaUrl),
  )).slice(0, count);
}

function JourneyLoader({ state, onRetry }: { state: LoaderState; onRetry: () => void }) {
  const reduced = useReducedMotion();
  const settings = useReaderSettings();
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
        {isError ? <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold/30 bg-white/[.035] text-gold"><RotateCcw size={22} /></div>
          : settings.loaderStyle === 'hearts' ? <div className="story-heart-loader mx-auto" aria-hidden="true"><span>♡</span><span>♡</span><span>♡</span></div>
          : settings.loaderStyle === 'minimal' ? <div className="story-loader-ring mx-auto" aria-hidden="true" />
          : <motion.div animate={reduced ? undefined : { rotate: [0, 8, -6, 0], scale: [1, 1.08, 1] }} transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }} className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold/30 bg-white/[.035] text-gold shadow-[0_0_55px_rgba(201,160,99,.12)]"><Sparkles size={23} /></motion.div>}
        <div className="mt-7 text-[10px] uppercase tracking-[4px] text-gold/60">{isError ? 'попробуем ещё раз' : 'подготавливаю путешествие'}</div>
        <h2 className="mt-3 font-serif text-[34px] leading-tight">{isError ? state.label : settings.loaderTitle}</h2>
        <p className="mx-auto mt-3 max-w-[280px] text-xs leading-relaxed text-white/42">{isError ? state.detail : settings.loaderSubtitle}</p>
        {!isError && <p className="mx-auto mt-2 max-w-[280px] text-[10px] leading-relaxed text-white/25">{state.detail}</p>}
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
  chapters,
  onJump,
  progress,
  currentChapter,
  readingPlace,
  total,
}: {
  rows: PublicTimelineRow[];
  chapters: PublicChapterSummary[];
  onJump: (elementId: string, position?: number) => void | Promise<void>;
  progress: number;
  currentChapter: string;
  readingPlace: ReadingPlace | null;
  total: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [textSize, setTextSize] = useState(() => localStorage.getItem(TEXT_SIZE_KEY) || 'normal');
  const [density, setDensity] = useState(() => localStorage.getItem(READER_DENSITY_KEY) || 'normal');
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem(READER_FOCUS_KEY) === '1');
  const [searchQuery, setSearchQuery] = useState('');
  const [bookmark, setBookmark] = useState<ReadingPlace | null>(() => {
    try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY) ?? '') as ReadingPlace; } catch { return null; }
  });
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  const minutesLeft = Math.max(1, Math.ceil((((total ?? rows.length) * (100 - progress)) / 100) * 0.18));
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('ru');
    return query ? rows.filter((row) => searchableRowText(row).includes(query)).slice(0, 12) : [];
  }, [rows, searchQuery]);

  useEffect(() => {
    document.documentElement.dataset.readerText = textSize;
    localStorage.setItem(TEXT_SIZE_KEY, textSize);
    return () => { delete document.documentElement.dataset.readerText; };
  }, [textSize]);

  useEffect(() => {
    document.documentElement.dataset.readerDensity = density;
    localStorage.setItem(READER_DENSITY_KEY, density);
    return () => { delete document.documentElement.dataset.readerDensity; };
  }, [density]);

  useEffect(() => {
    document.documentElement.dataset.readerFocus = focusMode ? 'true' : 'false';
    localStorage.setItem(READER_FOCUS_KEY, focusMode ? '1' : '0');
    return () => { delete document.documentElement.dataset.readerFocus; };
  }, [focusMode]);

  useEffect(() => {
    if (!autoScroll) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
        setAutoScroll(false);
        return;
      }
      const elapsed = Math.min(50, now - previous);
      previous = now;
      window.scrollBy(0, elapsed * 0.03);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [autoScroll]);

  function saveBookmark() {
    if (!readingPlace) return;
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(readingPlace));
    setBookmark(readingPlace);
    setBookmarkSaved(true);
    window.setTimeout(() => setBookmarkSaved(false), 1400);
  }

  function nextChapter() {
    const currentOrder = readingPlace
      ? rows.find((row) => row.element_id === readingPlace.elementId)?.display_order ?? -Infinity
      : -Infinity;
    const next = chapters.find((chapter) => chapter.displayOrder > currentOrder);
    if (next) void onJump(next.elementId, next.storyPosition);
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
                <button type="button" onClick={saveBookmark} disabled={!readingPlace} className="rounded-2xl bg-white/[.055] p-3 text-left disabled:opacity-35"><span className="flex items-center gap-2 text-gold"><Bookmark size={15}/> Закладка</span><span className="mt-1 block text-[10px] text-white/35">{bookmarkSaved ? 'место сохранено' : 'сохранить это место'}</span></button>
                <button type="button" onClick={nextChapter} className="rounded-2xl bg-white/[.055] p-3 text-left"><span className="flex items-center gap-2 text-gold"><ArrowDown size={15}/> Дальше</span><span className="mt-1 block text-[10px] text-white/35">к следующей главе</span></button>
                <button type="button" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setOpen(false); }} className="rounded-2xl bg-white/[.055] p-3 text-left"><span className="flex items-center gap-2 text-gold"><ChevronUp size={15}/> В начало</span><span className="mt-1 block text-[10px] text-white/35">вернуться к обложке</span></button>
                <button type="button" onClick={() => setFocusMode((value) => !value)} className="col-span-2 rounded-2xl bg-white/[.055] p-3 text-left"><span className="flex items-center gap-2 text-gold"><Focus size={15}/> Фокус на сцене</span><span className="mt-1 block text-[10px] text-white/35">{focusMode ? 'включён — соседние сцены приглушены' : 'читать одну сцену без визуального шума'}</span></button>
              </div>
              <div className="mt-3 rounded-2xl bg-white/[.04] p-3"><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-white/60"><Type size={14}/> Размер текста</span><div className="flex rounded-full bg-black/25 p-1">{[['small','А'],['normal','Аа'],['large','АА']].map(([id,label]) => <button type="button" key={id} onClick={() => setTextSize(id)} className={`rounded-full px-2.5 py-1 text-[10px] ${textSize === id ? 'bg-gold text-black' : 'text-white/45'}`}>{label}</button>)}</div></div></div>
              <div className="mt-3 rounded-2xl bg-white/[.04] p-3"><div className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2 text-white/60"><Rows3 size={14}/> Плотность</span><div className="flex rounded-full bg-black/25 p-1">{[['compact','Плотно'],['normal','Обычно'],['cinematic','Кино']].map(([id,label]) => <button type="button" key={id} onClick={() => setDensity(id)} className={`rounded-full px-2 py-1 text-[9px] ${density === id ? 'bg-gold text-black' : 'text-white/45'}`}>{label}</button>)}</div></div></div>
              <div className="mt-3 rounded-2xl bg-white/[.04] p-3">
                <label className="flex items-center gap-2 rounded-xl bg-black/20 px-3"><Search size={14} className="text-gold/65"/><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Найти фразу в загруженной истории…" className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-xs text-white outline-none placeholder:text-white/25"/></label>
                {searchQuery.trim() && <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">{searchResults.length > 0 ? searchResults.map((row) => <button type="button" key={row.element_id} onClick={() => { void onJump(row.element_id); setOpen(false); }} className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/[.06]"><span className="block text-[9px] uppercase tracking-[1.5px] text-gold/55">{row.type}</span><span className="mt-0.5 block truncate text-xs text-white/65">{searchableRowText(row) || 'Сцена без текста'}</span></button>) : <div className="px-2 py-3 text-center text-[10px] text-white/35">В загруженной части совпадений нет.</div>}</div>}
              </div>
              {bookmark?.elementId && <button type="button" onClick={() => { void onJump(bookmark.elementId, bookmark.position); setOpen(false); }} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-gold/15 px-4 py-3 text-left text-xs text-gold/75"><span><Bookmark size={13} className="mr-2 inline"/>Открыть сохранённую закладку</span><span>{bookmark.progress}%</span></button>}
              {chapters.length > 0 && <div className="mt-4"><div className="mb-2 text-[9px] uppercase tracking-[2px] text-white/30">все главы · {chapters.length}</div><div className="space-y-1">{chapters.map((chapter, index) => <button type="button" key={chapter.elementId} onClick={() => { void onJump(chapter.elementId, chapter.storyPosition); setOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/[.06]"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-gold/20 text-[9px] text-gold/65">{index + 1}</span><span className="min-w-0 flex-1 truncate font-serif text-base">{chapter.title}</span></button>)}</div></div>}
            </motion.div>
          )}
        </AnimatePresence>
        <button type="button" aria-expanded={open} aria-label="Открыть карту путешествия" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 rounded-full border border-white/10 bg-[#131116]/90 px-3 py-2.5 text-[#F4EFE6] shadow-2xl backdrop-blur-xl">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold"><MapIcon size={17}/></span>
          <span className="min-w-0 flex-1 text-left"><span className="block truncate text-[11px] text-white/62">{currentChapter || 'Путешествие по истории'}</span><span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/[.07]"><span className="block h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${progress}%` }}/></span></span>
          <span className="shrink-0 text-right"><span className="block text-xs text-gold">{progress}%</span><span className="flex items-center gap-1 text-[9px] text-white/30"><Gauge size={10}/>{minutesLeft} мин</span></span>
        </button>
      </div>
      {autoScroll && <button type="button" onClick={() => setAutoScroll(false)} className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-[10px] uppercase tracking-[2px] text-white/65 backdrop-blur"><Pause size={12} className="mr-1 inline"/>пауза</button>}
    </>
  );
}

export default function TimelineStory({ token, track = true, preview = false }: { token: string; track?: boolean; preview?: boolean }) {
  const previewTargetElementId = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('element');
    return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  }, []);
  const [rows, setRows] = useState<PublicTimelineRow[]>([]);
  const [allChapters, setAllChapters] = useState<PublicChapterSummary[]>([]);
  const [booting, setBooting] = useState(true);
  const [loader, setLoader] = useState<LoaderState>({ phase: 'pages', progress: 8, label: 'Собираю страницы', detail: 'Загружаю первую часть истории.' });
  const [retryKey, setRetryKey] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [readProgress, setReadProgress] = useState(0);
  const [readingPlace, setReadingPlace] = useState<ReadingPlace | null>(() => track ? savedReadingPlace() : null);
  const [showResumeCard, setShowResumeCard] = useState(() => Boolean(track && Number(savedReadingPlace()?.position) > 3));
  const [resumeLoading, setResumeLoading] = useState(false);
  const [positionOffset, setPositionOffset] = useState(0);
  const [currentChapter, setCurrentChapter] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [activeElementId, setActiveElementId] = useState('');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(preview);
  const runId = useRef(0);
  const cursorRef = useRef<PublicTimelineCursor | null>(null);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const reportTimer = useRef(0);
  const visitId = useRef(crypto.randomUUID());
  const lastReported = useRef({ id: '', progress: 0 });
  const previewTargetOpened = useRef(false);

  const setPaging = useCallback((cursor: PublicTimelineCursor | null, nextHasMore: boolean) => {
    cursorRef.current = cursor;
    hasMoreRef.current = nextHasMore && Boolean(cursor);
    setHasMore(hasMoreRef.current);
  }, []);

  const loadJourney = useCallback(async () => {
    const currentRun = ++runId.current;
    setBooting(true);
    setRows([]);
    setPositionOffset(0);
    setMoreError('');
    setLoader({ phase: 'pages', progress: 8, label: 'Собираю страницы', detail: 'Загружаю первую часть истории.' });
    try {
      const result = previewTargetElementId
        ? await fetchResumeTimeline(previewTargetElementId, token)
        : await fetchPublicTimeline(null, token);
      if (currentRun !== runId.current) return;
      const ordered = [...result.elements].sort(comparePublicTimelineRows);
      setRows(ordered);
      setAllChapters(result.chapters);
      if (result.total !== null) setTotal(result.total);
      setPaging(result.nextCursor, result.hasMore);
      setLoader({ phase: 'media', progress: 62, label: 'Проявляю воспоминания', detail: 'Готовлю фотографии с первых страниц.' });
      await preloadTimelineMedia(nearestVisualMedia(ordered), token, (completed, mediaTotal) => {
        if (currentRun !== runId.current) return;
        const ratio = mediaTotal ? completed / mediaTotal : 1;
        setLoader({ phase: 'media', progress: 62 + ratio * 34, label: 'Проявляю воспоминания', detail: mediaTotal ? `${completed} из ${mediaTotal} первых медиа готовы.` : 'Первая часть готова.' });
      });
      if (currentRun !== runId.current) return;
      setLoader({ phase: 'ready', progress: 100, label: 'Можно начинать', detail: 'Первая часть истории готова. Остальное появится незаметно во время чтения.' });
      window.setTimeout(() => { if (currentRun === runId.current) setBooting(false); }, 220);
    } catch (error) {
      if (currentRun !== runId.current) return;
      setLoader({ phase: 'error', progress: 0, label: 'История не открылась', detail: error instanceof Error ? error.message : 'Проверь соединение и попробуй ещё раз.' });
    }
  }, [previewTargetElementId, setPaging, token]);

  useEffect(() => {
    void loadJourney();
    return () => {
      runId.current += 1;
      window.clearTimeout(reportTimer.current);
    };
  }, [loadJourney, retryKey]);

  useEffect(() => {
    if (previewTargetOpened.current || booting || !previewTargetElementId || !rows.some((row) => row.element_id === previewTargetElementId)) return;
    previewTargetOpened.current = true;
    if (preview) setSelectedElementId(previewTargetElementId);
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => scrollToElement(previewTargetElementId, 'auto'));
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, [booting, preview, previewTargetElementId, rows]);

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor || !hasMoreRef.current || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError('');
    try {
      const result = await fetchPublicTimeline(cursor, token);
      setRows((current) => {
        const merged = new Map(current.map((row) => [row.element_id, row]));
        result.elements.forEach((row) => merged.set(row.element_id, row));
        return Array.from(merged.values()).sort(comparePublicTimelineRows);
      });
      setAllChapters(result.chapters);
      if (result.total !== null) setTotal(result.total);
      setPaging(result.nextCursor, result.hasMore);
      void preloadTimelineMedia(nearestVisualMedia(result.elements), token);
    } catch (error) {
      setMoreError(error instanceof Error ? error.message : 'Следующая часть пока не загрузилась.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [setPaging, token]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || booting || !hasMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void loadMore();
    }, { rootMargin: '1400px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [booting, hasMore, loadMore]);

  const resumeFromSavedPlace = useCallback(async () => {
    if (!readingPlace || resumeLoading) return;
    if (rows.some((row) => row.element_id === readingPlace.elementId)) {
      setShowResumeCard(false);
      scrollToElement(readingPlace.elementId);
      return;
    }
    setResumeLoading(true);
    setMoreError('');
    try {
      const result = await fetchResumeTimeline(readingPlace.elementId, token);
      const ordered = [...result.elements].sort(comparePublicTimelineRows);
      setPositionOffset(Math.max(0, readingPlace.position - 1));
      setRows(ordered);
      setAllChapters(result.chapters);
      if (result.total !== null) setTotal(result.total);
      setPaging(result.nextCursor, result.hasMore);
      setCurrentChapter(readingPlace.chapter);
      setReadProgress((current) => Math.max(current, readingPlace.progress));
      setShowResumeCard(false);
      void preloadTimelineMedia(nearestVisualMedia(ordered), token);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => scrollToElement(readingPlace.elementId, 'auto')));
    } catch (error) {
      setMoreError(error instanceof Error ? error.message : 'Сохранённое место пока не открылось.');
    } finally {
      setResumeLoading(false);
    }
  }, [readingPlace, resumeLoading, rows, setPaging, token]);

  const jumpToElement = useCallback(async (elementId: string, position?: number) => {
    if (rows.some((row) => row.element_id === elementId)) {
      scrollToElement(elementId);
      return;
    }
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError('');
    try {
      const result = await fetchResumeTimeline(elementId, token);
      const ordered = [...result.elements].sort(comparePublicTimelineRows);
      setPositionOffset(Math.max(0, Number(position || 1) - 1));
      setRows(ordered);
      setAllChapters(result.chapters);
      if (result.total !== null) setTotal(result.total);
      setPaging(result.nextCursor, result.hasMore);
      void preloadTimelineMedia(nearestVisualMedia(ordered), token);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => scrollToElement(elementId, 'auto')));
    } catch (error) {
      setMoreError(error instanceof Error ? error.message : 'Не удалось открыть выбранную главу.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [rows, setPaging, token]);

  const renderedRows = useMemo(() => {
    const result: Array<{ row: PublicTimelineRow; galleryRows?: PublicTimelineRow[]; position: number }> = [];
    const collections = new Map<string, number>();
    rows.forEach((row, index) => {
      const position = positionOffset + index + 1;
      const groupId = row.screenshot_collection_id;
      if (!groupId) {
        result.push({ row, position });
        return;
      }
      const existingIndex = collections.get(groupId);
      if (existingIndex === undefined) {
        collections.set(groupId, result.length);
        result.push({ row, galleryRows: [row], position });
        return;
      }
      const existing = result[existingIndex];
      existing.galleryRows?.push(row);
      existing.position = position;
    });
    return result;
  }, [positionOffset, rows]);

  const chunks = useMemo(() => {
    const result: Array<typeof renderedRows> = [];
    for (let index = 0; index < renderedRows.length; index += 12) result.push(renderedRows.slice(index, index + 12));
    return result;
  }, [renderedRows]);

  const elementMeta = useMemo(() => {
    const result = new Map<string, { position: number; chapter: string }>();
    let chapter = positionOffset > 0 ? readingPlace?.chapter ?? '' : '';
    renderedRows.forEach((item) => {
      if (item.row.type === 'chapter' && typeof item.row.metadata?.title === 'string') chapter = item.row.metadata.title;
      result.set(item.row.element_id, { position: item.position, chapter });
    });
    return result;
  }, [positionOffset, readingPlace?.chapter, renderedRows]);

  const selectedIndex = useMemo(() => renderedRows.findIndex((item) => item.row.element_id === selectedElementId), [renderedRows, selectedElementId]);
  const selectedItem = selectedIndex >= 0 ? renderedRows[selectedIndex] : null;

  const previewRow = useCallback((next: PublicTimelineRow) => {
    setRows((current) => current.map((row) => row.element_id === next.element_id ? next : row));
  }, []);

  const refreshEditedRow = useCallback(async (elementId: string) => {
    const result = await fetchResumeTimeline(elementId, token);
    const fresh = new Map(result.elements.map((row) => [row.element_id, row]));
    setRows((current) => current.map((row) => fresh.get(row.element_id) ?? row));
    setAllChapters(result.chapters);
    if (result.total !== null) setTotal(result.total);
  }, [token]);

  const navigatePreviewEditor = useCallback((direction: -1 | 1) => {
    if (selectedIndex < 0) return;
    const next = renderedRows[selectedIndex + direction];
    if (!next) return;
    setSelectedElementId(next.row.element_id);
    const url = new URL(window.location.href);
    url.searchParams.set('element', next.row.element_id);
    window.history.replaceState(null, '', url);
    scrollToElement(next.row.element_id);
  }, [renderedRows, selectedIndex]);

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
    if (booting || renderedRows.length === 0) return;
    const visitorId = track ? localStorage.getItem('for-you-reader-id') : null;
    if (track && !visitorId) return;
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reader-element]'));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      const target = visible[0]?.target as HTMLElement | undefined;
      if (!target) return;
      const elementId = target.dataset.readerElement ?? '';
      const meta = elementMeta.get(elementId);
      if (!elementId || !meta) return;
      setActiveElementId(elementId);
      const denominator = total ?? Math.max(meta.position, positionOffset + rows.length + (hasMore ? 1 : 0));
      const progress = Math.max(1, Math.min(100, Math.round((meta.position / Math.max(1, denominator)) * 100)));
      setReadProgress((current) => track ? Math.max(current, progress) : progress);
      if (meta.chapter) setCurrentChapter(meta.chapter);
      if (track && meta.position > 0) {
        const place = { elementId, position: meta.position, progress, chapter: meta.chapter };
        localStorage.setItem(READING_PLACE_KEY, JSON.stringify(place));
        setReadingPlace(place);
      }
      if (!track || !visitorId) return;
      if (lastReported.current.id === elementId && progress <= lastReported.current.progress) return;
      lastReported.current = { id: elementId, progress };
      window.clearTimeout(reportTimer.current);
      reportTimer.current = window.setTimeout(() => {
        void recordReaderAnalytics({
          action: progress >= 99 ? 'complete' : 'progress',
          visitorId,
          visitId: visitId.current,
          elementId,
          position: meta.position,
          progress,
          chapter: meta.chapter,
        }, token);
      }, 900);
    }, { threshold: [0.35, 0.65], rootMargin: '-12% 0px -18%' });
    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      window.clearTimeout(reportTimer.current);
    };
  }, [booting, elementMeta, hasMore, positionOffset, renderedRows.length, rows.length, token, total, track]);

  return <div className="w-full">
    <AnimatePresence>{booting && <JourneyLoader state={loader} onRetry={() => setRetryKey((value) => value + 1)} />}</AnimatePresence>
    {preview && !booting && <div className="fixed left-3 top-3 z-[70] flex max-w-[calc(100vw-24px)] items-center gap-2 rounded-2xl border border-white/15 bg-[#171218]/92 p-2 text-[#F4EFE6] shadow-2xl backdrop-blur-xl">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gold/12 text-gold"><ShieldCheck size={15}/></span>
      <span className="hidden min-w-0 sm:block"><span className="block text-[9px] uppercase tracking-[1.5px] text-gold/55">защищённый preview</span><span className="block truncate text-[10px] text-white/45">нажми «Изменить» у сцены</span></span>
      <button type="button" disabled={Boolean(selectedItem)} onClick={() => setEditMode((value) => !value)} className={`shrink-0 rounded-xl px-3 py-2 text-[10px] ${editMode ? 'bg-gold text-[#171218]' : 'bg-white/8 text-white/65'} disabled:opacity-35`}><Pencil size={12} className="mr-1 inline"/>{editMode ? 'Редактирование' : 'Включить правки'}</button>
      <a href="/admin#admin-timeline" className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-[10px] text-white/65">В админку</a>
    </div>}
    {!booting && rows.length === 0 && <div className="mx-auto max-w-md px-6 py-28 text-center font-serif text-2xl opacity-55">Здесь пока пусто.</div>}
    {!booting && rows.length > 0 && <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-px bg-white/5"><div className="h-full bg-gold/80 transition-[width] duration-700" style={{ width: `${readProgress}%` }} /></div>
      {currentChapter && !preview && <div className="pointer-events-none fixed inset-x-0 top-3 z-30 text-center"><span className="inline-block max-w-[78vw] truncate rounded-full bg-black/35 px-4 py-1.5 text-[9px] uppercase tracking-[2px] text-gold/65 backdrop-blur-md">{currentChapter}</span></div>}
      {showResumeCard && readingPlace && <div className="flex min-h-[24vh] items-center justify-center bg-[#0B0B0D] px-6"><button type="button" disabled={resumeLoading} onClick={() => void resumeFromSavedPlace()} className="group border-y border-gold/25 px-7 py-6 text-center text-[#F4EFE6] transition hover:border-gold/50 disabled:opacity-55"><BookOpen className="mx-auto text-gold/70" size={20}/><span className="mt-3 block font-serif text-xl">{resumeLoading ? 'Открываю это место…' : 'Продолжить с места'}</span><span className="mt-1 block text-[10px] uppercase tracking-[2px] text-white/35">прочитано {readingPlace.progress}%{readingPlace.chapter ? ` · ${readingPlace.chapter}` : ''}</span></button></div>}
      {chunks.map((chunk, chunkIndex) => <div className="story-page-chunk" key={chunk[0]?.row.element_id ?? chunkIndex}>{chunk.map(({ row, galleryRows, position }) => <div key={row.screenshot_collection_id ?? row.element_id} data-reader-element={row.element_id} data-reader-position={position} data-reader-active={activeElementId === row.element_id ? 'true' : 'false'} className={`reader-scene-shell relative ${activeElementId === row.element_id ? 'is-reader-active' : ''} ${selectedElementId === row.element_id ? 'is-preview-selected' : ''}`}>
        <span aria-hidden="true" className="reader-scene-index">{String(position).padStart(2, '0')}</span>
        {preview && editMode && <button type="button" onClick={() => setSelectedElementId(row.element_id)} className="preview-scene-edit"><Pencil size={13}/>Изменить</button>}
        <StoryElement row={row} galleryRows={galleryRows} token={token} />
      </div>)}</div>)}
      <div ref={sentinelRef} className="flex min-h-24 items-center justify-center bg-[#0B0B0D] px-6 text-center text-[#F4EFE6]/45">
        {loadingMore && <div><div className="story-loader-ring mx-auto h-7 w-7"/><div className="mt-3 text-[10px] uppercase tracking-[2px]">готовлю следующие страницы</div></div>}
        {!loadingMore && moreError && <button type="button" onClick={() => void loadMore()} className="rounded-full border border-gold/25 px-5 py-3 text-xs text-gold">Загрузить дальше ещё раз</button>}
      </div>
      {!hasMore && <StoryEnding />}
      <JourneyTools rows={rows} chapters={allChapters} onJump={jumpToElement} total={total} progress={readProgress} currentChapter={currentChapter} readingPlace={readingPlace} />
      {preview && selectedItem && <Suspense fallback={<div className="fixed bottom-3 right-3 z-[90] rounded-2xl bg-white p-4 text-xs text-burgundy shadow-2xl">Открываю редактор…</div>}><ReaderPreviewEditor key={selectedItem.row.element_id} row={selectedItem.row} position={selectedItem.position} total={total ?? renderedRows.length} canGoPrevious={selectedIndex > 0} canGoNext={selectedIndex < renderedRows.length - 1} onPreview={previewRow} onClose={(original) => { previewRow(original); setSelectedElementId(null); }} onSaved={refreshEditedRow} onNavigate={navigatePreviewEditor}/></Suspense>}
    </>}
  </div>;
}
