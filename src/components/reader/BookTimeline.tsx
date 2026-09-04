import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PublicTimelineRow } from '@/lib/readerApi';
import { splitBookText } from '@/lib/bookPagination';
import StoryElement from './StoryElement';

export interface BookStoryItem {
  row: PublicTimelineRow;
  galleryRows?: PublicTimelineRow[];
  position: number;
}

interface StoryBookPage {
  kind: 'story';
  key: string;
  item: BookStoryItem;
  row: PublicTimelineRow;
  part: number;
  parts: number;
}

interface EndingBookPage {
  kind: 'ending';
  key: 'story-ending';
}

type BookPage = StoryBookPage | EndingBookPage;
const BOOK_PAGE_KEY = 'for-you-book-page-v1';

function hasVisualMedia(item: BookStoryItem) {
  const row = item.row;
  return Boolean(
    item.galleryRows?.length
    || row.media_id
    || row.screenshot_id
    || row.memory_photo_storage_path
    || (typeof row.style?.externalMediaUrl === 'string' && row.style.externalMediaUrl),
  );
}

export function buildBookPages(items: BookStoryItem[], showEnding: boolean): BookPage[] {
  const pages: BookPage[] = [];
  items.forEach((item) => {
    const row = item.row;
    const text = row.type === 'message' && !hasVisualMedia(item)
      ? row.display_text ?? row.original_text ?? ''
      : '';
    const parts = text ? splitBookText(text) : [text];
    parts.forEach((part, index) => {
      const pageRow = parts.length > 1
        ? { ...row, display_text: row.display_text ? part : null, original_text: row.display_text ? null : part }
        : row;
      pages.push({
        kind: 'story',
        key: `${row.element_id}:book:${index}`,
        item,
        row: pageRow,
        part: index + 1,
        parts: parts.length,
      });
    });
  });
  if (showEnding) pages.push({ kind: 'ending', key: 'story-ending' });
  return pages;
}

export default function BookTimeline({
  items,
  token,
  hasMore,
  loadingMore,
  moreError,
  targetElementId,
  ending,
  onNeedMore,
  onActiveItem,
  onTargetHandled,
}: {
  items: BookStoryItem[];
  token: string;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: string;
  targetElementId: string | null;
  ending: ReactNode;
  onNeedMore: () => Promise<void>;
  onActiveItem: (item: BookStoryItem) => void;
  onTargetHandled: () => void;
}) {
  const reduced = useReducedMotion();
  const pages = useMemo(() => buildBookPages(items, !hasMore), [hasMore, items]);
  const [pageIndex, setPageIndex] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BOOK_PAGE_KEY) ?? '{}') as { elementId?: string; part?: number };
      const found = pages.findIndex((page) => page.kind === 'story' && page.item.row.element_id === saved.elementId && page.part === saved.part);
      return found >= 0 ? found : 0;
    } catch { return 0; }
  });
  const [direction, setDirection] = useState(1);
  const [advanceAfterLoad, setAdvanceAfterLoad] = useState(false);
  const previousLength = useRef(pages.length);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const safeIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const page = pages[safeIndex];

  useEffect(() => {
    if (!targetElementId) return;
    const nextIndex = pages.findIndex((candidate) => candidate.kind === 'story' && candidate.item.row.element_id === targetElementId);
    if (nextIndex >= 0) {
      setDirection(nextIndex >= safeIndex ? 1 : -1);
      setPageIndex(nextIndex);
      onTargetHandled();
    }
  }, [onTargetHandled, pages, safeIndex, targetElementId]);

  useEffect(() => {
    if (!advanceAfterLoad || pages.length <= previousLength.current) {
      previousLength.current = pages.length;
      return;
    }
    setDirection(1);
    setPageIndex((current) => Math.min(current + 1, pages.length - 1));
    setAdvanceAfterLoad(false);
    previousLength.current = pages.length;
  }, [advanceAfterLoad, pages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    if (page?.kind !== 'story') return;
    localStorage.setItem(BOOK_PAGE_KEY, JSON.stringify({ elementId: page.item.row.element_id, part: page.part }));
    onActiveItem(page.item);
  }, [onActiveItem, page]);

  useEffect(() => {
    if (hasMore && safeIndex >= pages.length - 3) void onNeedMore();
  }, [hasMore, onNeedMore, pages.length, safeIndex]);

  async function nextPage() {
    if (safeIndex < pages.length - 1) {
      setDirection(1);
      setPageIndex(safeIndex + 1);
      return;
    }
    if (hasMore && !loadingMore) {
      setAdvanceAfterLoad(true);
      previousLength.current = pages.length;
      await onNeedMore();
    }
  }

  function previousPage() {
    if (safeIndex <= 0) return;
    setDirection(-1);
    setPageIndex(safeIndex - 1);
  }

  if (!page) return null;
  const isLast = safeIndex >= pages.length - 1 && !hasMore;
  const variants = {
    enter: (value: number) => reduced ? { opacity: 0 } : { x: value > 0 ? '68%' : '-38%', rotateY: value > 0 ? -18 : 12, opacity: 0.25, scale: 0.985 },
    center: { x: 0, rotateY: 0, opacity: 1, scale: 1 },
    exit: (value: number) => reduced ? { opacity: 0 } : { x: value > 0 ? '-34%' : '66%', rotateY: value > 0 ? 14 : -18, opacity: 0.18, scale: 0.985 },
  };

  return <section className="reader-book-stage relative h-[100dvh] min-h-[560px] w-full overflow-hidden bg-[#08080A] [perspective:1400px]" aria-label="Режим книги">
    <AnimatePresence initial={false} custom={direction} mode="popLayout">
      <motion.div
        key={page.key}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: reduced ? 0.16 : 0.62, ease: [0.22, 1, 0.36, 1] }}
        drag={reduced ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        onDragEnd={(_, info) => {
          if (info.offset.x < -70 || info.velocity.x < -420) void nextPage();
          if (info.offset.x > 70 || info.velocity.x > 420) previousPage();
        }}
        className={`story-book-page story-book-skin-${safeIndex % 5} absolute inset-0 origin-left overflow-hidden bg-[#0B0B0D] shadow-2xl`}
      >
        <div ref={scrollRef} className="story-book-scroll h-full overflow-y-auto overscroll-contain [scrollbar-width:none]">
          {page.kind === 'story' ? <div className="story-book-element min-h-full" data-reader-element={page.item.row.element_id} data-reader-position={page.item.position}>
            {page.parts > 1 && <div className="pointer-events-none absolute left-4 top-4 z-30 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 font-pixel text-[10px] tracking-[1px] text-gold/75 backdrop-blur">лист {page.part}/{page.parts}</div>}
            <StoryElement row={page.row} galleryRows={page.item.galleryRows} token={token} hideReaction={page.part < page.parts} />
          </div> : ending}
          <div className="h-28" aria-hidden="true" />
        </div>
        <div aria-hidden="true" className="book-page-fold pointer-events-none absolute inset-y-0 right-0 w-10" />
      </motion.div>
    </AnimatePresence>

    <div className="pointer-events-none absolute inset-x-0 bottom-[78px] z-30 flex items-end justify-between px-3 pb-[env(safe-area-inset-bottom)]">
      <button type="button" onClick={previousPage} disabled={safeIndex === 0} aria-label="Предыдущая страница" className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-black/45 text-gold/65 shadow-lg backdrop-blur disabled:invisible"><ChevronLeft size={19}/></button>
      <div className="mb-1 rounded-full bg-black/35 px-2.5 py-1 font-pixel text-[10px] tracking-[1px] text-white/45 backdrop-blur">{safeIndex + 1} / {hasMore ? '…' : pages.length}</div>
      {!isLast && <button type="button" onClick={() => void nextPage()} disabled={loadingMore && safeIndex >= pages.length - 1} aria-label="Следующая страница" className="pixel-page-arrow pointer-events-auto flex h-12 w-12 items-center justify-center rounded-lg border border-gold/30 bg-[#171117]/90 font-pixel text-xl text-gold shadow-[0_0_22px_rgba(201,160,99,.18)] disabled:opacity-50"><span aria-hidden="true">▶</span></button>}
    </div>
    {moreError && safeIndex >= pages.length - 2 && <button type="button" onClick={() => void onNeedMore()} className="absolute bottom-36 left-1/2 z-40 -translate-x-1/2 rounded-full border border-gold/25 bg-black/70 px-4 py-2 text-xs text-gold">Попробовать загрузить дальше</button>}
  </section>;
}
