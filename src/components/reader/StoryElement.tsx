import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import type { PublicTimelineRow } from '@/lib/readerApi';
import { useReaderSettings, type TimeFormatId } from '@/lib/readerSettingsContext';
import ReaderMedia from './ReaderMedia';
import EffectsLayer from './EffectsLayer';
import InteractiveMoment from './InteractiveMoment';

// A message renders as a full "letter" layout (bigger serif type, generous
// paragraph spacing, no visual truncation) once it crosses this length —
// ported from reader-prototype.html's `.long-letter` treatment (see the
// "ОЧЕНЬ ДЛИННЫЙ ТЕКСТ" zone in the prototype).
const LONG_LETTER_THRESHOLD = 420;

const moodLabel: Record<string, string> = {
  romantic: 'любовь', sad: 'тихая грусть', funny: 'улыбка', deep: 'важная мысль', night: 'ночь', memory: 'память', important: 'важное', hopeful: 'надежда', normal: '', neutral: '',
};

export const bgByZone: Record<string, string> = {
  default: 'linear-gradient(180deg,var(--cream),color-mix(in srgb,var(--blush) 30%,var(--cream)))',
  romantic: 'linear-gradient(180deg,color-mix(in srgb,var(--cream) 78%,white),var(--blush))',
  night: 'linear-gradient(180deg,#2C2140,#1F1730)',
  burgundy: 'linear-gradient(180deg,var(--burgundy),color-mix(in srgb,var(--burgundy) 74%,black))',
  pixel: 'linear-gradient(180deg,#0D1321,#1B2340)',
  gif: 'linear-gradient(180deg,color-mix(in srgb,var(--gold) 18%,white),color-mix(in srgb,var(--gold) 55%,white))',
  travel: 'linear-gradient(180deg,color-mix(in srgb,var(--peach) 20%,white),var(--peach))',
  winter: 'linear-gradient(180deg,#EAF3FB,#D3E6F5)',
  sepia: 'linear-gradient(180deg,#EFE3C9,#DCC9A0)',
  rain: 'linear-gradient(180deg,#DCE3EA,#B9C6D1)',
  // New: soft forest green with tree silhouettes (see Botanical "trees" kind).
  forest: 'linear-gradient(180deg,#EAF0E1,#C7D8B6)',
  // New: a scene that visibly darkens as it enters view (see .dusk-veil in
  // globals.css) — for goodbyes, endings of a chapter, or bittersweet notes.
  dusk: 'linear-gradient(180deg,#3B3452,#1B1730)',
};

// Date/time formatting is style-selectable from Admin → Настройки
// ("Формат даты и времени", theme.timeFormat) — see readerSettingsContext.tsx.
function pluralRu(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
function relativeRu(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 30) return `${days} ${pluralRu(days, ['день', 'дня', 'дней'])} назад`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} ${pluralRu(months, ['месяц', 'месяца', 'месяцев'])} назад`;
  const years = Math.floor(days / 365.25);
  return `${years} ${pluralRu(years, ['год', 'года', 'лет'])} назад`;
}
function wallClockDate(value: string, format: TimeFormatId = 'default', withYear = true) {
  const date = new Date(value);
  if (format === 'short') return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(date);
  if (format === 'relative') return relativeRu(value);
  if (format === 'weekday') return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(date);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(date);
}
function wallClockTime(value: string, format: TimeFormatId = 'default') {
  if (format === '12h') return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(new Date(value));
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(value));
}
function year(value: string) { return Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'UTC' }).format(new Date(value))); }

const fontClassByOption: Record<string, string> = {
  serif: 'font-serif', script: 'font-script', sans: 'font-sans', pixel: 'font-pixel', mono: 'font-mono',
  literata: 'font-literata', yeseva: 'font-yeseva', comfort: 'font-comfort',
  badscript: 'font-badscript', marck: 'font-marck', pacifico: 'font-pacifico', neucha: 'font-neucha',
};

function zoneOf(row: PublicTimelineRow) {
  const explicit = typeof row.style?.zone === 'string' ? row.style.zone : '';
  if (explicit) return explicit;
  if (row.mood === 'night') return 'night';
  if (row.mood === 'sad') return 'burgundy';
  if (row.mood === 'romantic') return 'romantic';
  if (row.mood === 'memory') return 'sepia';
  return 'default';
}

// Corner ornament used by the `hearts` frame below — four small hearts, one
// per corner, instead of a full botanical illustration.
function HeartCorners() {
  const positions = ['-left-2 -top-2', '-right-2 -top-2 rotate-90', '-left-2 -bottom-2 -rotate-90', '-right-2 -bottom-2 rotate-180'];
  return <>{positions.map((pos, i) => (
    <span key={i} aria-hidden className={`absolute ${pos} text-lg text-burgundy/60`}>❤</span>
  ))}</>;
}

export function Frame({ frame, children }: { frame: string; children: React.ReactNode }) {
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
    // --- new frame ideas, added on top of the approved reader-prototype set ---
    case 'hearts': return <div className={`${common} max-w-[290px] rounded-[16px] border border-blush/60 bg-white p-3 shadow-lg`}><HeartCorners />{children}</div>;
    case 'garland': return <div className={`${common} max-w-[300px] rounded-[14px] border border-gold/30 bg-white p-4 pt-6 shadow-lg`}><div aria-hidden className="absolute left-2 right-2 top-1 flex justify-between text-[10px] text-gold/70">{Array.from({ length: 9 }).map((_, i) => <span key={i}>✦</span>)}</div>{children}</div>;
    case 'postcard': return <div className={`${common} max-w-[310px] bg-[#F6EFE0] p-3 shadow-lg`}><div aria-hidden className="absolute right-3 top-3 h-10 w-10 rotate-6 rounded-sm border border-burgundy/30" /><div aria-hidden className="absolute right-4 top-4 h-8 w-8 rotate-6 rounded-sm bg-burgundy/10" />{children}</div>;
    case 'wax-seal': return <div className={`${common} max-w-[290px] rounded-[10px] bg-white p-3 shadow-lg`}><div aria-hidden className="absolute -top-3 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-burgundy text-xs text-gold shadow-md">♡</div>{children}</div>;
    case 'torn': return <div className={`${common} max-w-[300px] bg-white p-3 shadow-lg`} style={{ clipPath: 'polygon(0% 2%,4% 0%,10% 3%,18% 1%,26% 3%,34% 0%,42% 2%,50% 0%,58% 2%,66% 0%,74% 3%,82% 1%,90% 3%,96% 0%,100% 2%,100% 98%,94% 100%,86% 98%,78% 100%,70% 98%,62% 100%,54% 98%,46% 100%,38% 98%,30% 100%,22% 98%,14% 100%,6% 98%,0% 100%)' }}>{children}</div>;
    // BUGFIX: Admin → Скриншоты defaulted every new screenshot's style to
    // `{ frame: 'phone' }`, but 'phone' had no case here — it silently fell
    // through to `default` (plain white card), which is why screenshot
    // frames looked like they "didn't work". This adds the real phone
    // mockup: rounded bezel + top notch, so a chat screenshot actually
    // reads like a phone screen.
    case 'phone': return <div className={`${common} max-w-[280px] rounded-[34px] border-[6px] border-[#1c1c1e] bg-[#1c1c1e] p-1.5 shadow-2xl`}><div aria-hidden className="absolute left-1/2 top-1.5 z-10 h-4 w-24 -translate-x-1/2 rounded-full bg-[#1c1c1e]" /><div className="overflow-hidden rounded-[26px]">{children}</div></div>;
    // --- more romantic frame ideas ---
    case 'locket': return <div className={`${common} max-w-[270px] rounded-full border-[3px] border-gold bg-white p-4 shadow-2xl`}><div className="overflow-hidden rounded-full">{children}</div></div>;
    case 'envelope': return <div className={`${common} max-w-[300px] bg-[#F6EFE0] p-3 pt-8 shadow-lg`}><div aria-hidden className="absolute left-0 top-0 h-8 w-full" style={{ clipPath: 'polygon(0 0,50% 60%,100% 0)', background: 'linear-gradient(180deg,#EFE0C6,#F6EFE0)' }} /><div aria-hidden className="absolute left-1/2 top-3 -translate-x-1/2 text-burgundy/50 text-sm">✉</div>{children}</div>;
    case 'moonlit': return <div className={`${common} max-w-[300px] rounded-[20px] bg-gradient-to-br from-[#3B3452] to-[#1B1730] p-3 shadow-2xl`}><div aria-hidden className="absolute right-4 top-4 h-5 w-5 rounded-full bg-[#EDE6F5]/80 shadow-[0_0_16px_4px_rgba(237,230,245,0.5)]" />{children}</div>;
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

// Forest / trees decoration for the new 'forest' zone: a soft treeline
// silhouette sitting along the bottom edge of the scene.
function Treeline() {
  return <svg aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full opacity-25" viewBox="0 0 400 100" preserveAspectRatio="none" fill="none">
    <g fill="currentColor">
      <path d="M40 100V60l-14 14 14-30-12 6 12-26 12 26-12-6 14 30-14-14v40Z" />
      <path d="M140 100V52l-18 18 18-38-15 8 15-33 15 33-15-8 18 38-18-18v48Z" />
      <path d="M250 100V58l-15 15 15-32-12 6 12-28 12 28-12-6 15 32-15-15v42Z" />
      <path d="M350 100V64l-13 13 13-28-10 5 10-24 10 24-10-5 13 28-13-13v36Z" />
    </g>
  </svg>;
}

function MotionWrap({ children, className, reduced }: { children: React.ReactNode; className?: string; reduced: boolean | null }) {
  return <motion.div className={className} initial={reduced ? undefined : { opacity: 0, y: 24 }} whileInView={reduced ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, margin: '-8% 0px' }} transition={{ duration: 0.95, ease: 'easeOut' }}>{children}</motion.div>;
}

export default function StoryElement({ row, token }: { row: PublicTimelineRow; token: string }) {
  const reducedMotion = useReducedMotion();
  const { specialMomentLabel, timeFormat, readerFont } = useReaderSettings();
  const zone = zoneOf(row);
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const parallaxY = useTransform(scrollYProgress, [0, 1], reducedMotion ? [0, 0] : [-8, 8]);

  if (row.type === 'year_break') return <MotionWrap reduced={reducedMotion}><section className="mx-auto flex min-h-[55vh] max-w-page items-center justify-center px-6 text-center"><div><div className="mx-auto mb-6 h-px w-16 bg-gold/60"/><div className="font-serif text-[68px] font-medium leading-none text-burgundy">{year(row.occurred_at)}</div><div className="mx-auto mt-5 h-px w-28 bg-gold/35"/><p className="mt-4 font-script text-2xl opacity-55">ещё одна глава</p></div></section></MotionWrap>;

  if (row.type === 'on_this_day') {
    const previous = typeof row.metadata?.previous_text === 'string' ? row.metadata.previous_text : null;
    return <MotionWrap reduced={reducedMotion}><section className="mx-auto flex min-h-[34vh] max-w-page items-center justify-center px-6"><div className="w-full border-l-2 border-gold/45 bg-white/35 px-6 py-8 shadow-sm"><div className="font-script text-2xl text-gold">в этот день</div><div className="mt-2 font-serif text-2xl text-burgundy">{wallClockDate(row.occurred_at)}</div>{previous && <p className="mt-5 whitespace-pre-wrap font-serif text-xl italic leading-relaxed text-ink/80">«{previous}»</p>}</div></section></MotionWrap>;
  }

  // BUGFIX: memory/special-moment text (`memory_body`, typed in Admin →
  // Воспоминания/Особенные) and screenshot captions were fetched from the
  // DB into every row but never actually rendered here — `text` only ever
  // looked at `display_text`/`original_text`, which are message-only
  // columns and are null for memory/screenshot rows. That's why manually
  // added "особые моменты" appeared with just the label and no text.
  const text = row.memory_id
    ? row.memory_body ?? null
    : row.screenshot_id
    ? row.screenshot_caption ?? row.screenshot_description ?? null
    : row.display_text ?? row.original_text;
  const title = row.memory_id ? row.memory_title : row.screenshot_id ? row.screenshot_title : null;
  const frame = typeof row.style?.frame === 'string' ? row.style.frame : 'minimal';
  const label = row.mood ? moodLabel[row.mood] : '';
  const media = Boolean(row.media_id || row.screenshot_id || row.memory_photo_storage_path);
  const isSpecial = row.type === 'special' || row.metadata?.kind === 'special';
  const isInteractive = row.type === 'interactive' || row.metadata?.kind === 'interactive';
  const interactionKind = typeof row.metadata?.interaction === 'string' ? row.metadata.interaction : 'spoiler';
  // Per-element override (Admin → Оформление → «Формат даты/времени именно
  // здесь») falls back to the site-wide setting when not set.
  const effectiveTimeFormat = typeof row.style?.timeFormat === 'string' && row.style.timeFormat ? (row.style.timeFormat as TimeFormatId) : timeFormat;
  const decoration = Array.isArray(row.style?.decoration) ? (row.style?.decoration as string[]) : null;
  const gifUrl = typeof row.style?.gifUrl === 'string' ? (row.style.gifUrl as string) : null;
  const selectedFont = typeof row.style?.font === 'string' && row.style.font ? row.style.font : readerFont;
  const fontOverride = fontClassByOption[selectedFont] ?? 'font-serif';
  // A message becomes a full "letter" (no truncation, generous paragraph
  // spacing) once it's long enough that a single flowing line would feel
  // cramped — matches the "ОЧЕНЬ ДЛИННЫЙ ТЕКСТ" treatment in the prototype.
  const isLongLetter = row.type === 'message' && (text?.length ?? 0) > LONG_LETTER_THRESHOLD;
  // Reaction text/emoji left on a photo/media element renders as a small
  // caption directly under the frame, the way a handwritten note under a
  // printed photo would — rather than at the bottom of the whole card.
  const photoReaction = media ? (row.reaction_emoji ?? null) : null;
  const textReaction = !media ? (row.reaction_emoji ?? null) : null;
  const shouldFrameText = !media && typeof row.style?.frame === 'string';
  const darkFrame = ['stars', 'neon', 'pixel', 'moonlit'].includes(frame);
  const textColorClass = shouldFrameText
    ? (darkFrame ? 'text-[#F4EAF0]' : 'text-ink')
    : (zone === 'night' || zone === 'burgundy' || zone === 'dusk' ? 'text-[#F4EAF0]' : 'text-ink');

  const textNode = text && (isLongLetter ? (
    <div className={`mx-auto max-w-[380px] space-y-5 ${textColorClass}`}>
      <div className="text-center text-[11px] uppercase tracking-[2px] opacity-45">без ограничения</div>
      {text.split(/\n{2,}|\n/).filter(Boolean).map((para, i) => (
        <p key={i} className={`whitespace-pre-wrap ${fontOverride ?? 'font-serif'} text-[21px] leading-[1.75]`}>{para}</p>
      ))}
    </div>
  ) : (
    <div className={isSpecial ? 'mx-auto max-w-[390px] text-center' : ''}>
      <p className={`whitespace-pre-wrap ${fontOverride ?? 'font-serif'} text-[23px] leading-[1.58] sm:text-[25px] ${textColorClass} ${isSpecial ? 'text-[27px] italic' : ''}`}>{text}</p>
      {row.display_text && row.original_text && row.display_text !== row.original_text && <details className="mt-5 text-[11px] opacity-45"><summary className="cursor-pointer">оригинал</summary><p className="mt-2 whitespace-pre-wrap font-sans">{row.original_text}</p></details>}
      {textReaction && <div className="mt-4 text-sm opacity-50">{textReaction}</div>}
      {isSpecial && <div className="mt-5 text-lg text-gold/70">♡</div>}
    </div>
  ));
  // Text-only frames used to be ignored entirely. Apply an explicitly chosen
  // frame to the text as well; unstyled imported messages keep the flowing
  // book layout instead of being forced into cards.
  const framedTextNode = textNode && shouldFrameText
    ? <Frame frame={frame}><div className="rounded-[14px] p-4">{textNode}</div></Frame>
    : textNode;

  const content = (
    <article ref={ref} style={{ background: bgByZone[zone] ?? bgByZone.default }} className="relative overflow-hidden py-8 transition-[background] duration-[1800ms]">
      {zone === 'forest' && <Treeline />}
      {zone === 'dusk' && <div className="dusk-veil" />}
      {decoration && <EffectsLayer decorations={decoration} seed={row.sort_tiebreak + row.occurred_at.length} gifUrl={gifUrl} />}
      <div className="relative mx-auto w-full max-w-page px-[22px]">
        {isSpecial && <div className="mb-8 text-center"><div className="text-[12px] uppercase tracking-[3px] text-gold">{specialMomentLabel}</div><div className="mx-auto mt-4 h-px w-12 bg-gold/55" /></div>}
        <div className={`mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[1.8px] ${zone === 'night' || zone === 'burgundy' || zone === 'dusk' ? 'text-white/60' : 'text-burgundy/55'}`}>
          <time>{wallClockDate(row.occurred_at, effectiveTimeFormat)}</time>{effectiveTimeFormat !== 'relative' && <><span>·</span><time>{wallClockTime(row.occurred_at, effectiveTimeFormat)}</time></>}{label && <><span>·</span><span>{label}</span></>}
        </div>
        {title && !isInteractive && <h3 className={`mb-4 text-center font-serif text-2xl ${zone === 'night' || zone === 'burgundy' || zone === 'dusk' ? 'text-[#F4EAF0]' : 'text-burgundy'}`}>{title}</h3>}
        {isInteractive && text ? <InteractiveMoment kind={interactionKind} title={title} text={text} row={row} token={token} dark={zone === 'night' || zone === 'burgundy' || zone === 'dusk'} fontClass={fontOverride ?? 'font-serif'} /> : <>
          {media && <motion.div style={{ y: parallaxY }} className="mb-8">
            <Frame frame={frame}><ReaderMedia row={row} token={token} /></Frame>
            {photoReaction && <div className="mt-3 text-center font-script text-lg opacity-70">{photoReaction}</div>}
          </motion.div>}
          {framedTextNode}
        </>}
      </div>
    </article>
  );
  return <motion.div initial={reducedMotion ? undefined : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, margin: '-5% 0px' }} transition={{ duration: 0.8 }}>{content}</motion.div>;
}
