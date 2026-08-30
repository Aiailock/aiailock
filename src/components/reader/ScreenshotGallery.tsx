import { useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PublicTimelineRow } from '@/lib/readerApi';
import ReaderMedia from './ReaderMedia';

export default function ScreenshotGallery({ rows, token, renderFrame }: { rows: PublicTimelineRow[]; token: string; renderFrame: (children: ReactNode, minimal?: boolean) => ReactNode }) {
  const ordered = [...rows].sort((a, b) => Number(a.screenshot_collection_order ?? 0) - Number(b.screenshot_collection_order ?? 0));
  const layout = ordered[0]?.screenshot_collection_layout ?? 'carousel';
  const [active, setActive] = useState(0);
  const scroller = useRef<HTMLDivElement | null>(null);

  function go(index: number) {
    const next = Math.max(0, Math.min(ordered.length - 1, index));
    setActive(next);
    scroller.current?.children[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  if (layout === 'collage') return (
    <div className="screenshot-collage grid grid-cols-2 gap-2">
      {ordered.map((row, index) => <div key={row.element_id} className={index === 0 && ordered.length % 2 === 1 ? 'col-span-2' : ''}>{renderFrame(<ReaderMedia row={row} token={token} />, index !== 0)}</div>)}
    </div>
  );

  if (layout === 'stack') return (
    <div className="relative mx-auto max-w-[320px] pb-8">
      {ordered.map((row, index) => <div key={row.element_id} className="relative" style={{ marginTop: index ? '-18px' : 0, transform: `rotate(${index % 2 ? 1.5 : -1.2}deg)`, zIndex: index + 1 }}>{renderFrame(<ReaderMedia row={row} token={token} />)}</div>)}
    </div>
  );

  return (
    <div className="relative mx-auto max-w-[340px]">
      <div ref={scroller} onScroll={(event) => { const target = event.currentTarget; const width = target.clientWidth || 1; setActive(Math.round(target.scrollLeft / width)); }} className="screenshot-carousel flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth">
        {ordered.map((row) => <div key={row.element_id} className="w-full shrink-0 snap-center px-2">{renderFrame(<ReaderMedia row={row} token={token} />)}</div>)}
      </div>
      {ordered.length > 1 && <>
        <button type="button" aria-label="Предыдущий скриншот" onClick={() => go(active - 1)} disabled={active === 0} className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-burgundy shadow-md disabled:opacity-25"><ChevronLeft size={17} /></button>
        <button type="button" aria-label="Следующий скриншот" onClick={() => go(active + 1)} disabled={active === ordered.length - 1} className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-burgundy shadow-md disabled:opacity-25"><ChevronRight size={17} /></button>
        <div className="mt-4 flex justify-center gap-1.5">{ordered.map((row, index) => <button type="button" aria-label={`Скриншот ${index + 1}`} key={row.element_id} onClick={() => go(index)} className={`h-1.5 rounded-full transition-all ${index === active ? 'w-5 bg-burgundy/60' : 'w-1.5 bg-burgundy/20'}`} />)}</div>
        <div className="mt-2 text-center text-[10px] uppercase tracking-[1.5px] opacity-35">{active + 1} / {ordered.length} · листай</div>
      </>}
    </div>
  );
}
