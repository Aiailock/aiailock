import type { DateStyleId } from '@/lib/readerSettingsContext';

const fontClass: Record<string, string> = {
  sans: 'font-sans', serif: 'font-serif', script: 'font-script', literata: 'font-literata',
  badscript: 'font-badscript', marck: 'font-marck', neucha: 'font-neucha', comfort: 'font-comfort',
};

interface Props {
  date: string;
  time: string | null;
  label?: string;
  variant: DateStyleId;
  align: 'left' | 'center' | 'right';
  font: string;
  dark: boolean;
}

export default function DateStamp({ date, time, label, variant, align, font, dark }: Props) {
  const alignment = align === 'center' ? 'justify-center text-center' : align === 'right' ? 'justify-end text-right' : 'justify-start text-left';
  const color = dark ? 'text-white/65' : 'text-burgundy/60';
  const typography = fontClass[font] ?? 'font-sans';
  const pieces = <><time>{date}</time>{time && <><span aria-hidden>·</span><time>{time}</time></>}{label && <><span aria-hidden>·</span><span>{label}</span></>}</>;

  if (variant === 'centered') return (
    <div className={`mb-6 flex items-center gap-3 ${color}`}>
      <span className="h-px min-w-0 flex-1 bg-current opacity-25" />
      <div className={`${typography} max-w-[75%] text-center text-[11px] uppercase tracking-[1.7px]`}>{pieces}</div>
      <span className="h-px min-w-0 flex-1 bg-current opacity-25" />
    </div>
  );

  if (variant === 'ribbon') return (
    <div className={`mb-5 flex ${alignment}`}>
      <div className={`${typography} story-date-ribbon inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-sm px-4 py-2 text-[11px] uppercase tracking-[1.5px] ${dark ? 'bg-white/10 text-white/75' : 'bg-blush/55 text-burgundy/75'}`}>{pieces}</div>
    </div>
  );

  if (variant === 'handwritten') return (
    <div className={`mb-5 flex ${alignment}`}>
      <div className={`${font === 'sans' ? 'font-script' : typography} max-w-full border-b border-current/20 px-1 pb-1 text-[20px] normal-case tracking-normal ${color}`}>{pieces}</div>
    </div>
  );

  if (variant === 'capsule') return (
    <div className={`mb-5 flex ${alignment}`}>
      <div className={`${typography} inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[1.4px] ${dark ? 'border-white/15 bg-black/10 text-white/65' : 'border-burgundy/10 bg-white/45 text-burgundy/60'}`}>{pieces}</div>
    </div>
  );

  if (variant === 'split') return (
    <div className={`${typography} mb-5 flex min-w-0 items-center justify-between gap-3 border-b pb-2 text-[10px] uppercase tracking-[1.5px] ${dark ? 'border-white/10 text-white/60' : 'border-burgundy/10 text-burgundy/55'}`}>
      <time className="min-w-0 overflow-wrap-anywhere">{date}</time>
      <span className="shrink-0">{label ? `${label}${time ? ` · ${time}` : ''}` : time}</span>
    </div>
  );

  return <div className={`${typography} mb-4 flex min-w-0 flex-wrap items-center gap-2 text-[10px] uppercase tracking-[1.6px] ${alignment} ${color}`}>{pieces}</div>;
}

