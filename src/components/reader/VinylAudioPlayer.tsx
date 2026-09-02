import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, Mic2, Music2, Pause, Play, RotateCcw } from 'lucide-react';
import { safeRemoteUrl } from '@/lib/safeUrl';

export type AudioPlayerStyle = 'vinyl' | 'voice' | 'glass' | 'cassette' | 'minimal';

interface Props {
  src: string;
  coverUrl?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  sourceUrl?: string | null;
  isPreview?: boolean;
  variant?: AudioPlayerStyle;
}

function clock(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function PlayerButton({ playing, onClick, className = '' }: { playing: boolean; onClick: () => void; className?: string }) {
  return <button type="button" onClick={onClick} aria-label={playing ? 'Поставить на паузу' : 'Включить аудио'} className={`flex shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none ${className}`}>{playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor" className="ml-0.5"/>}</button>;
}

function Waveform({ bars, progress, active, inactive }: { bars: number[]; progress: number; active: string; inactive: string }) {
  return <div className="flex h-10 min-w-0 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>{bars.map((height, index) => <span key={index} className="min-w-[2px] flex-1 rounded-full transition-colors" style={{ height, background: index / bars.length <= progress ? active : inactive }}/>)}</div>;
}

function Progress({ current, duration, onChange, className = '' }: { current: number; duration: number; onChange: (value: number) => void; className?: string }) {
  return <><input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(current, duration || 1)} onChange={(event) => onChange(Number(event.target.value))} aria-label="Позиция аудио" className={`vinyl-progress w-full ${className}`}/><div className="mt-1 flex items-center justify-between text-[9px] tabular-nums opacity-45"><span>{clock(current)}</span><span>{clock(duration)}</span></div></>;
}

export default function VinylAudioPlayer({ src, coverUrl, title, artist, album, sourceUrl, isPreview = false, variant = 'vinyl' }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  const cover = safeRemoteUrl(coverUrl);
  const source = safeRemoteUrl(sourceUrl);
  const waveform = useMemo(() => Array.from({ length: variant === 'voice' ? 42 : 34 }, (_, index) => 7 + ((index * 17 + index * index * 5) % 26)), [variant]);
  const progress = duration > 0 ? current / duration : 0;
  const resolvedTitle = title || (variant === 'voice' ? 'Голосовое сообщение' : 'Аудиозапись');

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try { await audio.play(); } catch { setError(true); }
    } else audio.pause();
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = value;
    setCurrent(value);
  }

  function replay() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => setError(true));
  }

  const media = <audio
    ref={audioRef}
    src={src}
    preload="metadata"
    onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
    onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
    onPlay={() => { setPlaying(true); setError(false); }}
    onPause={() => setPlaying(false)}
    onEnded={() => setPlaying(false)}
    onError={() => setError(true)}
  />;

  let player: ReactNode;

  if (variant === 'voice') {
    player = <div className="overflow-hidden rounded-[24px] border border-[#b8dccd] bg-[#e7f5ee] text-[#173f31] shadow-[0_18px_45px_-30px_rgba(18,88,62,.7)]">
      {media}<div className="p-4"><div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[1.8px] text-[#25765a]/65"><Mic2 size={13}/> голосовое сообщение</div><div className="flex items-center gap-3"><PlayerButton playing={playing} onClick={() => void toggle()} className="h-12 w-12 bg-[#25765a] text-white shadow-md"/><Waveform bars={waveform} progress={progress} active="#25765a" inactive="rgba(37,118,90,.18)"/><span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-[#25765a]/60">{clock(playing ? current : duration)}</span></div><div className="mt-3 min-w-0"><div className="truncate text-sm font-medium">{resolvedTitle}</div>{artist && <div className="mt-0.5 truncate text-[11px] text-[#25765a]/55">{artist}</div>}</div></div>
    </div>;
  } else if (variant === 'glass') {
    player = <div className="relative overflow-hidden rounded-[30px] border border-white/20 bg-gradient-to-br from-[#6e3653]/85 via-[#30213a]/90 to-[#14121a]/95 p-5 text-white shadow-2xl backdrop-blur-xl">
      {media}<div aria-hidden className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-gold/15 blur-3xl"/><div className="relative flex items-center gap-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10">{cover ? <img src={cover} alt="" className="h-full w-full object-cover"/> : <Music2 size={28} className="text-gold"/>}</div><div className="min-w-0 flex-1"><div className="text-[9px] uppercase tracking-[2px] text-gold/70">атмосфера момента</div><h4 className="mt-2 truncate font-serif text-2xl">{resolvedTitle}</h4>{artist && <p className="mt-1 truncate text-xs text-white/55">{artist}</p>}</div></div><div className="relative mt-5 flex items-center gap-3"><PlayerButton playing={playing} onClick={() => void toggle()} className="h-11 w-11 bg-white text-burgundy"/><Waveform bars={waveform} progress={progress} active="var(--gold)" inactive="rgba(255,255,255,.16)"/></div><div className="relative mt-2"><Progress current={current} duration={duration} onChange={seek}/></div>
    </div>;
  } else if (variant === 'cassette') {
    player = <div className="overflow-hidden rounded-[22px] border-[5px] border-[#272229] bg-[#d6a761] p-4 text-[#211820] shadow-[0_22px_55px_-28px_rgba(0,0,0,.85)]">
      {media}<div className="rounded-xl border-2 border-[#2c242b]/35 bg-[#efe1bf] p-4 shadow-inner"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[9px] font-bold uppercase tracking-[2px] opacity-45">memory tape</div><div className="mt-1 truncate font-mono text-sm font-bold">{resolvedTitle}</div>{artist && <div className="truncate font-mono text-[10px] opacity-55">{artist}</div>}</div><span className="font-mono text-[9px] opacity-40">SIDE A</span></div><div className="mt-4 flex items-center justify-center gap-6 rounded-lg bg-[#2b242b] px-5 py-3 text-white"><span className={`h-10 w-10 rounded-full border-4 border-white/25 bg-[#171317] shadow-inner ${playing ? 'vinyl-disc-playing' : ''}`}/><div className="h-6 w-12 rounded border border-white/10 bg-black/25"/><span className={`h-10 w-10 rounded-full border-4 border-white/25 bg-[#171317] shadow-inner ${playing ? 'vinyl-disc-playing' : ''}`}/></div></div><div className="mt-4 flex items-center gap-3"><PlayerButton playing={playing} onClick={() => void toggle()} className="h-11 w-11 bg-[#2b242b] text-[#f1d59f]"/><div className="min-w-0 flex-1"><Progress current={current} duration={duration} onChange={seek}/></div></div>
    </div>;
  } else if (variant === 'minimal') {
    player = <div className="rounded-[24px] border border-white/10 bg-[#151318] p-4 text-[#F4EFE6] shadow-lg">
      {media}<div className="flex items-center gap-3"><PlayerButton playing={playing} onClick={() => void toggle()} className="h-12 w-12 border border-gold/25 bg-gold/10 text-gold"/><div className="min-w-0 flex-1"><div className="truncate font-serif text-lg">{resolvedTitle}</div><div className="mt-1 flex items-center gap-2 text-[10px] text-white/35"><span>{artist || 'аудио'}</span><span>·</span><span>{clock(duration)}</span></div><div className="mt-2"><Progress current={current} duration={duration} onChange={seek}/></div></div></div>
    </div>;
  } else {
    player = <div className="vinyl-player overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0b0f] text-[#F4EFE6] shadow-[0_24px_70px_-28px_rgba(0,0,0,.9)]">
      {media}<div className="relative overflow-hidden px-5 pb-5 pt-6"><div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_16%_16%,rgba(166,76,111,.22),transparent_34%),radial-gradient(circle_at_86%_74%,rgba(201,160,99,.12),transparent_40%)]"/><div className="relative flex flex-col items-center gap-5 sm:flex-row sm:items-start"><button type="button" onClick={() => void toggle()} aria-label={playing ? 'Поставить на паузу' : 'Включить аудио'} className="group relative h-44 w-44 shrink-0 rounded-full focus-visible:outline-none"><span aria-hidden className={`vinyl-disc absolute inset-0 rounded-full ${playing ? 'vinyl-disc-playing' : ''}`}><span className="absolute inset-[43%] rounded-full bg-[#0b090c] shadow-[0_0_0_2px_rgba(255,255,255,.08)]"/><span className="absolute inset-[22%] overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-[#8a3158] to-[#d0a45f] shadow-inner">{cover ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover"/> : <span className="flex h-full w-full items-center justify-center text-white/75"><Music2 size={30}/></span>}</span></span><span className="absolute inset-0 flex items-center justify-center"><span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/65 text-gold shadow-xl backdrop-blur transition group-hover:scale-105">{playing ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor" className="ml-0.5"/>}</span></span></button><div className="min-w-0 flex-1 self-stretch text-center sm:pt-2 sm:text-left"><div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start"><span className="text-[9px] uppercase tracking-[2.4px] text-gold/65">сейчас играет</span>{isPreview && <span className="rounded-full border border-gold/20 bg-gold/10 px-2 py-1 text-[8px] uppercase tracking-[1.2px] text-gold/75">30 сек. превью</span>}</div><h4 className="mt-3 overflow-wrap-anywhere font-serif text-[27px] leading-tight">{resolvedTitle}</h4>{artist && <p className="mt-1 truncate text-sm text-white/58">{artist}</p>}{album && <p className="mt-1 truncate text-[10px] text-white/30">{album}</p>}<div className="mt-5"><Waveform bars={waveform} progress={progress} active="var(--gold)" inactive="rgba(255,255,255,.14)"/><Progress current={current} duration={duration} onChange={seek} className="mt-2"/></div></div></div></div>
    </div>;
  }

  return <div>{player}{error && <div className="mt-2 rounded-xl border border-red-300/15 bg-red-950/25 px-4 py-3 text-center text-xs text-red-100/70">Аудио не удалось воспроизвести. Возможно, файл или ссылка больше недоступны.</div>}<div className="mt-2 flex items-center justify-between px-2 text-[10px] text-white/35"><button type="button" onClick={replay} className="flex items-center gap-1.5 hover:text-gold"><RotateCcw size={12}/> Сначала</button>{source && <a href={source} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-gold">Источник <ExternalLink size={11}/></a>}</div></div>;
}
