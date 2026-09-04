import { motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { PublicTimelineRow } from '@/lib/readerApi';
import type { BookOrientationId } from '@/lib/readerSettingsContext';
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

interface PageTurn {
  id: number;
  from: number;
  to: number;
  direction: 1 | -1;
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

function BookPageContent({
  page,
  token,
  ending,
  scrollRef,
  active = false,
}: {
  page: BookPage;
  token: string;
  ending: ReactNode;
  scrollRef?: RefObject<HTMLDivElement>;
  active?: boolean;
}) {
  return <div ref={scrollRef} className="story-book-scroll h-full overflow-y-auto overscroll-contain [scrollbar-width:none]">
    {page.kind === 'story' ? <div
      className="story-book-element min-h-full"
      {...(active ? { 'data-reader-element': page.item.row.element_id, 'data-reader-position': page.item.position } : {})}
    >
      {page.parts > 1 && <div className="pointer-events-none absolute left-4 top-4 z-30 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 font-pixel text-[10px] tracking-[1px] text-gold/75 backdrop-blur">лист {page.part}/{page.parts}</div>}
      <StoryElement row={page.row} galleryRows={page.item.galleryRows} token={token} hideReaction={page.part < page.parts} />
    </div> : ending}
    <div className="h-28" aria-hidden="true" />
  </div>;
}

export default function BookTimeline({
  items,
  token,
  orientation,
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
  orientation: BookOrientationId;
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
  const [turn, setTurn] = useState<PageTurn | null>(null);
  const [advanceAfterLoad, setAdvanceAfterLoad] = useState(false);
  const previousLength = useRef(pages.length);
  const turnSequence = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const touchStart = useRef({ y: 0, atTop: true, atBottom: true });
  const wheelLockUntil = useRef(0);
  const dragX = useMotionValue(0);
  const horizontalDragRotation = useTransform(dragX, [-390, 0, 150], [-48, 0, 8]);
  const safeIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const page = pages[safeIndex];

  useEffect(() => {
    setTurn(null);
    dragX.set(0);
  }, [dragX, orientation]);

  useEffect(() => {
    if (!targetElementId || turn) return;
    const nextIndex = pages.findIndex((candidate) => candidate.kind === 'story' && candidate.item.row.element_id === targetElementId);
    if (nextIndex >= 0) {
      setPageIndex(nextIndex);
      onTargetHandled();
    }
  }, [onTargetHandled, pages, targetElementId, turn]);

  useEffect(() => {
    if (!advanceAfterLoad || pages.length <= previousLength.current) {
      previousLength.current = pages.length;
      return;
    }
    const target = Math.min(safeIndex + 1, pages.length - 1);
    setAdvanceAfterLoad(false);
    previousLength.current = pages.length;
    if (reduced) setPageIndex(target);
    else setTurn({ id: ++turnSequence.current, from: safeIndex, to: target, direction: 1 });
  }, [advanceAfterLoad, pages.length, reduced, safeIndex]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    if (page?.kind !== 'story') return;
    localStorage.setItem(BOOK_PAGE_KEY, JSON.stringify({ elementId: page.item.row.element_id, part: page.part }));
    onActiveItem(page.item);
  }, [onActiveItem, page]);

  useEffect(() => {
    if (hasMore && safeIndex >= pages.length - 3) void onNeedMore();
  }, [hasMore, onNeedMore, pages.length, safeIndex]);

  function beginTurn(target: number, direction: 1 | -1) {
    if (turn || target < 0 || target >= pages.length || target === safeIndex) return;
    dragX.set(0);
    if (reduced) {
      setPageIndex(target);
      return;
    }
    setTurn({ id: ++turnSequence.current, from: safeIndex, to: target, direction });
  }

  async function nextPage() {
    if (turn) return;
    if (safeIndex < pages.length - 1) {
      beginTurn(safeIndex + 1, 1);
      return;
    }
    if (hasMore && !loadingMore) {
      setAdvanceAfterLoad(true);
      previousLength.current = pages.length;
      await onNeedMore();
    }
  }

  function previousPage() {
    if (turn || safeIndex <= 0) return;
    beginTurn(safeIndex - 1, -1);
  }

  function finishTurn(id: number) {
    if (!turn || turn.id !== id) return;
    setPageIndex(turn.to);
    setTurn(null);
  }

  function verticalSwipe(deltaY: number) {
    if (orientation !== 'vertical' || turn || Math.abs(deltaY) < 54) return;
    if (deltaY < 0 && touchStart.current.atBottom) void nextPage();
    if (deltaY > 0 && touchStart.current.atTop) previousPage();
  }

  if (!page) return null;
  const isLast = safeIndex >= pages.length - 1 && !hasMore;
  const baseIndex = turn && turn.direction > 0 ? turn.to : safeIndex;
  const basePage = pages[Math.min(baseIndex, pages.length - 1)];
  const turningIndex = turn ? (turn.direction > 0 ? turn.from : turn.to) : safeIndex;
  const turningPage = pages[Math.min(turningIndex, pages.length - 1)];
  const nextSymbol = orientation === 'horizontal' ? '▶' : '▲';
  const backSymbol = orientation === 'horizontal' ? '◀' : '▼';
  const nextLabel = orientation === 'horizontal' ? 'Перелистнуть справа налево' : 'Перелистнуть снизу вверх';
  const backLabel = orientation === 'horizontal' ? 'Вернуть слева направо' : 'Вернуть сверху вниз';
  const rotationFrames = turn?.direction === -1
    ? [-179.4, -154, -108, -70, -14, 0]
    : [0, -14, -70, -108, -154, -179.4];
  const turningInitial = orientation === 'horizontal'
    ? { rotateY: rotationFrames[0], rotateX: 0, rotateZ: 0, scale: 1 }
    : { rotateX: rotationFrames[0], rotateY: 0, rotateZ: 0, scale: 1 };
  const turningAnimation = orientation === 'horizontal'
    ? {
        rotateY: rotationFrames,
        rotateZ: turn?.direction === -1 ? [0, 0.25, -0.7, 0.2, 0.05, 0] : [0, -0.25, 0.7, -0.2, -0.05, 0],
        scaleX: [1, 0.998, 0.982, 0.987, 0.997, 1],
        filter: ['brightness(1)', 'brightness(1.04)', 'brightness(.86)', 'brightness(.78)', 'brightness(.88)', 'brightness(.94)'],
        boxShadow: ['0 0 0 rgba(0,0,0,0)', '16px 0 24px rgba(0,0,0,.18)', '36px 0 46px rgba(0,0,0,.46)', '25px 0 36px rgba(0,0,0,.34)', '8px 0 18px rgba(0,0,0,.16)', '0 0 0 rgba(0,0,0,0)'],
      }
    : {
        rotateX: rotationFrames,
        rotateZ: turn?.direction === -1 ? [0, -0.15, 0.45, -0.15, 0.05, 0] : [0, 0.15, -0.45, 0.15, -0.05, 0],
        scaleY: [1, 0.998, 0.98, 0.986, 0.997, 1],
        filter: ['brightness(1)', 'brightness(1.04)', 'brightness(.86)', 'brightness(.78)', 'brightness(.88)', 'brightness(.94)'],
        boxShadow: ['0 0 0 rgba(0,0,0,0)', '0 16px 24px rgba(0,0,0,.18)', '0 36px 46px rgba(0,0,0,.46)', '0 25px 36px rgba(0,0,0,.34)', '0 8px 18px rgba(0,0,0,.16)', '0 0 0 rgba(0,0,0,0)'],
      };

  return <section
    className="reader-book-stage relative h-[100dvh] min-h-[500px] w-full overflow-hidden bg-[#08080A] [perspective:1700px]"
    data-book-orientation={orientation}
    aria-label={orientation === 'horizontal' ? 'Книга с горизонтальным перелистыванием' : 'Книга с вертикальным перелистыванием'}
    onKeyDown={(event) => {
      if ((orientation === 'horizontal' && event.key === 'ArrowRight') || (orientation === 'vertical' && event.key === 'ArrowUp')) void nextPage();
      if ((orientation === 'horizontal' && event.key === 'ArrowLeft') || (orientation === 'vertical' && event.key === 'ArrowDown')) previousPage();
    }}
  >
    <div aria-hidden="true" className="book-page-stack book-page-stack-back" />
    <div aria-hidden="true" className="book-page-stack book-page-stack-middle" />
    <motion.div
      key={basePage.key}
      className={`story-book-page book-base-page story-book-skin-${baseIndex % 5} absolute inset-0 overflow-hidden bg-[#0B0B0D] shadow-2xl`}
      style={orientation === 'horizontal' ? { x: dragX, rotateY: horizontalDragRotation, transformOrigin: 'left center' } : { transformOrigin: 'center top' }}
      drag={!reduced && !turn && orientation === 'horizontal' ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.14}
      dragMomentum={false}
      whileDrag={{ cursor: 'grabbing' }}
      onDragEnd={(_, info) => {
        if (info.offset.x < -66 || info.velocity.x < -390) void nextPage();
        if (info.offset.x > 66 || info.velocity.x > 390) previousPage();
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        const scroll = scrollRef.current;
        if (touch) touchStart.current = {
          y: touch.clientY,
          atTop: !scroll || scroll.scrollTop <= 3,
          atBottom: !scroll || scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 3,
        };
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        if (touch) verticalSwipe(touch.clientY - touchStart.current.y);
      }}
      onWheel={(event) => {
        if (orientation !== 'vertical' || Math.abs(event.deltaY) < 38 || performance.now() < wheelLockUntil.current) return;
        const scroll = scrollRef.current;
        const atTop = !scroll || scroll.scrollTop <= 3;
        const atBottom = !scroll || scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 3;
        if ((event.deltaY > 0 && atBottom) || (event.deltaY < 0 && atTop)) {
          wheelLockUntil.current = performance.now() + 980;
          if (event.deltaY > 0) void nextPage();
          else previousPage();
        }
      }}
      aria-live="polite"
    >
      <BookPageContent page={basePage} token={token} ending={ending} scrollRef={scrollRef} active />
      <div aria-hidden="true" className="book-paper-grain pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="book-page-fold pointer-events-none absolute" />
    </motion.div>

    {turn && turningPage && <motion.div
      key={turn.id}
      className={`book-turning-sheet story-book-skin-${turningIndex % 5} absolute inset-0`}
      data-turn-direction={turn.direction > 0 ? 'forward' : 'backward'}
      initial={turningInitial}
      animate={turningAnimation}
      transition={{ duration: 0.94, times: [0, 0.16, 0.43, 0.62, 0.84, 1], ease: [0.2, 0.72, 0.18, 1] }}
      onAnimationComplete={() => finishTurn(turn.id)}
      aria-hidden="true"
    >
      <div className="book-sheet-face book-sheet-front absolute inset-0 overflow-hidden">
        <BookPageContent page={turningPage} token={token} ending={ending} />
        <div aria-hidden="true" className="book-paper-grain pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="book-live-fold pointer-events-none absolute" />
      </div>
      <div className="book-sheet-face book-sheet-back absolute inset-0 overflow-hidden">
        <div className="book-paper-backside absolute inset-0"><span aria-hidden="true">♡</span></div>
        <div aria-hidden="true" className="book-live-fold pointer-events-none absolute" />
      </div>
    </motion.div>}

    <div aria-hidden="true" className="book-spine pointer-events-none absolute z-20" />

    <div className="pointer-events-none absolute inset-x-0 bottom-[78px] z-30 flex items-end justify-between px-3 pb-[env(safe-area-inset-bottom)]">
      <button type="button" onClick={previousPage} disabled={safeIndex === 0 || Boolean(turn)} aria-label={backLabel} className="pixel-book-control pointer-events-auto flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-black/45 font-pixel text-lg text-gold/65 shadow-lg backdrop-blur disabled:invisible"><span aria-hidden="true">{backSymbol}</span></button>
      <div className="mb-1 rounded-full bg-black/35 px-2.5 py-1 font-pixel text-[10px] tracking-[1px] text-white/45 backdrop-blur">{safeIndex + 1} / {hasMore ? '…' : pages.length}</div>
      {!isLast && <button type="button" onClick={() => void nextPage()} disabled={Boolean(turn) || (loadingMore && safeIndex >= pages.length - 1)} aria-label={nextLabel} className="pixel-page-arrow pixel-book-control pointer-events-auto flex h-12 w-12 items-center justify-center rounded-lg border border-gold/30 bg-[#171117]/90 font-pixel text-xl text-gold shadow-[0_0_22px_rgba(201,160,99,.18)] disabled:opacity-50"><span aria-hidden="true">{nextSymbol}</span></button>}
    </div>
    {moreError && safeIndex >= pages.length - 2 && <button type="button" onClick={() => void onNeedMore()} className="absolute bottom-36 left-1/2 z-40 -translate-x-1/2 rounded-full border border-gold/25 bg-black/70 px-4 py-2 text-xs text-gold">Попробовать загрузить дальше</button>}
  </section>;
}
