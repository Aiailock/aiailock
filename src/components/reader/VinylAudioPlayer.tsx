import { useMemo, useRef, useState } from 'react';
import { ExternalLink, Music2, Pause, Play, RotateCcw } from 'lucide-react';
import { safeRemoteUrl } from '@/lib/safeUrl';

interface Props {
  src: string;
  coverUrl?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  sourceUrl?: string | null;
  isPreview?: boolean;
}

function clock(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function VinylAudioPlayer({ src, coverUrl, title, artist, album, sourceUrl, isPreview = false }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  const cover = safeRemoteUrl(coverUrl);
  const source = safeRemoteUrl(sourceUrl);
  const waveform = useMemo(() => Array.from({ length: 34 }, (_, index) => 8 + ((index * 17 + index * index * 5) % 27)), []);
  const progress = duration > 0 ? current / duration : 0;

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try { await audio.play(); } catch { setError(true); }
    } else {
      audio.pause();
    }
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

  return <div className="vinyl-player overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0b0f] text-[#F4EFE6] shadow-[0_24px_70px_-28px_rgba(0,0,0,.9)]">
    <audio
      ref={audioRef}
      src={src}
      preload="metadata"
      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
      onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
      onPlay={() => { setPlaying(true); setError(false); }}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
      onError={() => setError(true)}
    />
    <div className="relative overflow-hidden px-5 pb-5 pt-6">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_16%_16%,rgba(166,76,111,.22),transparent_34%),radial-gradient(circle_at_86%_74%,rgba(201,160,99,.12),transparent_40%)]" />
      <div className="relative flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <button type="button" onClick={() => void toggle()} aria-label={playing ? 'Поставить на паузу' : 'Включить аудио'} className="group relative h-44 w-44 shrink-0 rounded-full focus-visible:outline-none">
          <span aria-hidden className={`vinyl-disc absolute inset-0 rounded-full ${playing ? 'vinyl-disc-playing' : ''}`}>
            <span className="absolute inset-[43%] rounded-full bg-[#0b090c] shadow-[0_0_0_2px_rgba(255,255,255,.08)]" />
            <span className="absolute inset-[22%] overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-[#8a3158] to-[#d0a45f] shadow-inner">
              {cover ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-white/75"><Music2 size={30} /></span>}
            </span>
          </span>
          <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/65 text-gold shadow-xl backdrop-blur transition group-hover:scale-105">{playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}</span></span>
        </button>

        <div className="min-w-0 flex-1 self-stretch text-center sm:pt-2 sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="text-[9px] uppercase tracking-[2.4px] text-gold/65">сейчас играет</span>
            {isPreview && <span className="rounded-full border border-gold/20 bg-gold/10 px-2 py-1 text-[8px] uppercase tracking-[1.2px] text-gold/75">30 сек. превью</span>}
          </div>
          <h4 className="mt-3 overflow-wrap-anywhere font-serif text-[27px] leading-tight">{title || 'Аудиозапись'}</h4>
          {artist && <p className="mt-1 truncate text-sm text-white/58">{artist}</p>}
          {album && <p className="mt-1 truncate text-[10px] text-white/30">{album}</p>}
          <div className="mt-5 flex h-10 items-center justify-center gap-[3px] sm:justify-start" aria-hidden>
            {waveform.map((height, index) => <span key={index} className="w-[3px] rounded-full transition-colors" style={{ height, background: index / waveform.length <= progress ? 'var(--gold)' : 'rgba(255,255,255,.14)' }} />)}
          </div>
          <input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(current, duration || 1)} onChange={(event) => seek(Number(event.target.value))} aria-label="Позиция аудио" className="vinyl-progress mt-2 w-full" />
          <div className="mt-1 flex items-center justify-between text-[9px] tabular-nums text-white/35"><span>{clock(current)}</span><span>{clock(duration)}</span></div>
        </div>
      </div>
    </div>
    {error && <div className="border-t border-white/10 bg-red-950/20 px-4 py-3 text-center text-xs text-red-100/65">Аудио не удалось воспроизвести. Возможно, ссылка больше недоступна.</div>}
    <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-[10px] text-white/35">
      <button type="button" onClick={replay} className="flex items-center gap-1.5 hover:text-gold"><RotateCcw size={12} /> Сначала</button>
      {source && <a href={source} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-gold">Открыть песню <ExternalLink size={11} /></a>}
    </div>
  </div>;
}
