import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import type { PublicTimelineRow } from '@/lib/readerApi';
import ReaderMedia from './ReaderMedia';

const moodLabel: Record<string, string> = {
  romantic: 'любовь', sad: 'тихая грусть', funny: 'улыбка', deep: 'важная мысль', night: 'ночь', memory: 'память', important: 'важное', hopeful: 'надежда', normal: '', neutral: '',
};

const bgByZone: Record<string, string> = {
  default: 'linear-gradient(180deg,#FBF3EE,#F7E6E0)',
  romantic: 'linear-gradient(180deg,#FFF5F4,#F2C9C2)',
  night: 'linear-gradient(180deg,#2C2140,#1F1730)',
  burgundy: 'linear-gradient(180deg,#4A1B2F,#2E1020)',
  pixel: 'linear-gradient(180deg,#0D1321,#1B2340)',
  gif: 'linear-gradient(180deg,#FFF6DA,#FFE39A)',
  travel: 'linear-gradient(180deg,#FCEFD8,#F4C89A)',
  winter: 'linear-gradient(180deg,#EAF3FB,#D3E6F5)',
  sepia: 'linear-gradient(180deg,#EFE3C9,#DCC9A0)',
  rain: 'linear-gradient(180deg,#DCE3EA,#B9C6D1)',
};

function wallClockDate(value: string, withYear = true) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(value));
}
function wallClockTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(value));
}
function year(value: string) { return Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'UTC' }).format(new Date(value))); }

function zoneOf(row: PublicTimelineRow) {
  const explicit = typeof row.style?.zone === 'string' ? row.style.zone : '';
  if (explicit) return explicit;
  if (row.mood === 'night') return 'night';
  if (row.mood === 'sad') return 'burgundy';
  if (row.mood === 'romantic') return 'romantic';
  if (row.mood === 'memory') return 'sepia';
  return 'default';
}

function Frame({ frame, children }: { frame: string; children: React.ReactNode }) {
  const common = 'relative mx-auto w-full overflow-visible transition-transform duration-700';
  switch (frame) {
    case 'polaroid': return <div className={`${common} max-w-[290px] rotate-[-2deg] bg-white p-3 pb-10 shadow-[0_18px_45px_-22px_rgba(74,27,47,.55)]`}><div className="overflow-hidden">{children}</div></div>;
    case 'gold': return <div className={`${common} max-w-[300px] border border-gold p-3 shadow-[0_16px_38px_-22px_rgba(74,27,47,.55)]`}>{children}</div>;
    case 'flowers': return <div className={`${common} max-w-[300px] rounded-[22px] border-2 border-blush p-3 shadow-lg`}><Botanical kind="flowers" />{children}</div>;
    case 'branches': return <div className={`${common} max-w-[300px] rounded-[18px] border border-[#8FA06E]/20 p-3 shadow-lg`}><Botanical kind="branches" />{children}</div>;
    case 'stars': return <div className={`${common} max-w-[300px] bg-gradient-to-br from-[#2C2140] to-[#1F1730] p-3 shadow-xl`}><Botanical kind="stars" />{children}</div>;
    case 'ribbon': return <div className={`${common} max-w-[300px] rounded-[20px] border border-burgundy/10 p-3 shadow-lg`}><div aria-hidden className="absolute left-1/2 top-[-13px] -translate-x-1/2 text-2xl text-burgundy/70">⌁</div>{children}</div>;
    case 'washi': return <div className={`${common} max-w-[300px] bg-white p-2 shadow-lg`}><span className="absolute left-[-12px] top-[-8px] h-6 w-16 rotate-[-15deg] bg-lavender/75" />{children}</div>;
    case 'ticket': return <div className={`${common} max-w-[310px] border-x-2 border-dashed border-burgundy/20 bg-white p-4 shadow-lg`}>{children}<div className="mt-2 text-center font-script text-base opacity-60">оставь на память</div></div>;
    case 'film': return <div className={`${common} max-w-[310px] bg-[#111] p-2 shadow-xl`}><div className="border-y border-white/10 p-2">{children}</div></div>;
    case 'heart': return <div className={`${common} max-w-[260px] overflow-visible`}><div className="rounded-[42%_58%_60%_40%/48%_40%_60%_52%] bg-gradient-to-br from-blush to-peach p-2 shadow-xl">{children}</div></div>;
    case 'sepia': return <div className={`${common} max-w-[290px] bg-[#EFE3C9] p-3 shadow-xl`}>{children}</div>;
    case 'wood': return <div className={`${common} max-w-[290px] bg-gradient-to-br from-[#8a5a34] to-[#6b4223] p-3 shadow-xl`}>{children}</div>;
    case 'neon': return <div className={`${common} max-w-[290px] bg-gradient-to-br from-[#FF6FB5] via-[#7CF7C4] to-[#7BB8FF] p-[2px] shadow-2xl`}><div className="bg-[#141420] p-2">{children}</div></div>;
    case 'pixel': return <div className={`${common} max-w-[260px] border-[4px] border-[#7CF7C4] bg-[#0D1321] p-2 shadow-[0_0_0_6px_#1B2340,0_0_0_10px_#FF6FB5]`}>{children}</div>;
    case 'minimal': return <div className={`${common} max-w-[300px] bg-white p-2 shadow-md`}>{children}</div>;
    default: return <div className={`${common} max-w-[300px] rounded-[18px] bg-white/55 p-2 shadow-lg`}>{children}</div>;
  }
}

function Botanical({ kind }: { kind: string }) {
  return <svg aria-hidden="true" className="pointer-events-none absolute -right-1 -top-1 h-24 w-24 opacity-35" viewBox="0 0 100 100" fill="none">
    {kind === 'branches' && <><path d="M86 94C68 70 58 43 48 8" stroke="currentColor" strokeWidth="1.4"/><ellipse cx="83" cy="38" rx="6" ry="2" transform="rotate(-40 83 38)" fill="currentColor"/><ellipse cx="31" cy="27" rx="6" ry="2" transform="rotate(35 31 27)" fill="currentColor"/></>}
    {kind === 'flowers' && <><path d="M78 94C72 73 67 57 65 43" stroke="currentColor" strokeWidth="1.3"/><circle cx="65" cy="37" r="6" stroke="currentColor"/><circle cx="65" cy="25" r="5" stroke="currentColor"/><circle cx="76" cy="31" r="5" stroke="currentColor"/><circle cx="54" cy="31" r="5" stroke="currentColor"/><circle cx="65" cy="32" r="2.5" fill="currentColor"/></>}
    {kind === 'stars' && <><path d="M20 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5ZM74 14l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5 1.5-4ZM77 66l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="currentColor"/></>}
  </svg>;
}

function MotionWrap({ children, className, reduced }: { children: React.ReactNode; className?: string; reduced: boolean | null }) {
  return <motion.div className={className} initial={reduced ? undefined : { opacity: 0, y: 24 }} whileInView={reduced ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, margin: '-8% 0px' }} transition={{ duration: 0.95, ease: 'easeOut' }}>{children}</motion.div>;
}

export default function StoryElement({ row, token }: { row: PublicTimelineRow; token: string }) {
  const reducedMotion = useReducedMotion();
  const zone = zoneOf(row);
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const parallaxY = useTransform(scrollYProgress, [0, 1], reducedMotion ? [0, 0] : [-8, 8]);

  if (row.type === 'year_break') return <MotionWrap reduced={reducedMotion}><section className="mx-auto flex min-h-[55vh] max-w-page items-center justify-center px-6 text-center"><div><div className="mx-auto mb-6 h-px w-16 bg-gold/60"/><div className="font-serif text-[68px] font-medium leading-none text-burgundy">{year(row.occurred_at)}</div><div className="mx-auto mt-5 h-px w-28 bg-gold/35"/><p className="mt-4 font-script text-2xl opacity-55">ещё одна глава</p></div></section></MotionWrap>;

  if (row.type === 'on_this_day') {
    const previous = typeof row.metadata?.previous_text === 'string' ? row.metadata.previous_text : null;
    return <MotionWrap reduced={reducedMotion}><section className="mx-auto flex min-h-[34vh] max-w-page items-center justify-center px-6"><div className="w-full border-l-2 border-gold/45 bg-white/35 px-6 py-8 shadow-sm"><div className="font-script text-2xl text-gold">в этот день</div><div className="mt-2 font-serif text-2xl text-burgundy">{wallClockDate(row.occurred_at)}</div>{previous && <p className="mt-5 whitespace-pre-wrap font-serif text-xl italic leading-relaxed text-ink/80">«{previous}»</p>}</div></section></MotionWrap>;
  }

  const text = row.display_text ?? row.original_text;
  const frame = typeof row.style?.frame === 'string' ? row.style.frame : 'minimal';
  const label = row.mood ? moodLabel[row.mood] : '';
  const media = Boolean(row.media_id || row.screenshot_id || row.memory_photo_storage_path);
  const isSpecial = row.type === 'special' || row.metadata?.kind === 'special';

  const content = (
    <article ref={ref} style={{ background: bgByZone[zone] ?? bgByZone.default }} className="relative overflow-hidden py-8 transition-[background] duration-[1800ms]">
      <div className="mx-auto w-full max-w-page px-[22px]">
        {isSpecial && <div className="mb-8 text-center"><div className="text-[12px] uppercase tracking-[3px] text-gold">особенный момент</div><div className="mx-auto mt-4 h-px w-12 bg-gold/55" /></div>}
        <div className={`mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[1.8px] ${zone === 'night' || zone === 'burgundy' ? 'text-white/60' : 'text-burgundy/55'}`}>
          <time>{wallClockDate(row.occurred_at)}</time><span>·</span><time>{wallClockTime(row.occurred_at)}</time>{label && <><span>·</span><span>{label}</span></>}
        </div>
        {media && <motion.div style={{ y: parallaxY }} className="mb-8"><Frame frame={frame}><ReaderMedia row={row} token={token} /></Frame></motion.div>}
        {text && <div className={isSpecial ? 'mx-auto max-w-[390px] text-center' : ''}>
          <p className={`whitespace-pre-wrap font-serif text-[23px] leading-[1.58] sm:text-[25px] ${zone === 'night' || zone === 'burgundy' ? 'text-[#F4EAF0]' : 'text-ink'} ${isSpecial ? 'text-[27px] italic text-burgundy' : ''}`}>{text}</p>
          {row.display_text && row.original_text && row.display_text !== row.original_text && <details className="mt-5 text-[11px] opacity-45"><summary className="cursor-pointer">оригинал</summary><p className="mt-2 whitespace-pre-wrap font-sans">{row.original_text}</p></details>}
          {row.reaction_emoji && <div className="mt-4 text-sm opacity-50">{row.reaction_emoji}</div>}
          {isSpecial && <div className="mt-5 text-lg text-gold/70">♡</div>}
        </div>}
      </div>
    </article>
  );
  return <motion.div initial={reducedMotion ? undefined : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, margin: '-5% 0px' }} transition={{ duration: 0.8 }}>{content}</motion.div>;
}
