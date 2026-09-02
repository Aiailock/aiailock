import { useCallback, useEffect, useRef, useState } from 'react';
import { Music2, Volume2, VolumeX } from 'lucide-react';
import { fetchBackgroundMusicUrl } from '@/lib/readerApi';
import type { ReaderDisplaySettings } from '@/lib/readerSettingsContext';

const ENABLED_KEY = 'for-you-background-music-enabled-v1';

export default function BackgroundMusic({ token, settings }: { token: string; settings: ReaderDisplaySettings }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef(0);
  const [url, setUrl] = useState<string | null>(settings.backgroundMusicMode === 'built_in' ? '/audio/ambient-glow.mp3' : null);
  const [enabled, setEnabled] = useState(() => localStorage.getItem(ENABLED_KEY) !== 'false');
  const [playing, setPlaying] = useState(false);
  const [ducked, setDucked] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    if (settings.backgroundMusicMode === 'off') { setUrl(null); return; }
    if (settings.backgroundMusicMode === 'built_in') { setUrl('/audio/ambient-glow.mp3'); return; }
    if (!settings.backgroundMusicPath) { setUrl(null); setError(true); return; }
    void fetchBackgroundMusicUrl(token)
      .then((next) => { if (!cancelled) setUrl(next); })
      .catch(() => { if (!cancelled) { setUrl(null); setError(true); } });
    return () => { cancelled = true; };
  }, [settings.backgroundMusicMode, settings.backgroundMusicPath, token]);

  const fadeTo = useCallback((target: number, duration = 380) => {
    const audio = audioRef.current;
    if (!audio) return;
    window.cancelAnimationFrame(animationRef.current);
    const from = audio.volume;
    const started = performance.now();
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - started) / duration);
      audio.volume = Math.max(0, Math.min(1, from + (target - from) * ratio));
      if (ratio < 1) animationRef.current = window.requestAnimationFrame(tick);
    };
    animationRef.current = window.requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !enabled || !url) return;
    try {
      audio.volume = 0;
      await audio.play();
      fadeTo(settings.backgroundMusicVolume);
    } catch {
      // Browsers legitimately block sound until the next user gesture.
    }
  }, [enabled, fadeTo, settings.backgroundMusicVolume, url]);

  useEffect(() => {
    if (!enabled || !url) return;
    const unlock = () => { void start(); };
    document.addEventListener('pointerdown', unlock, { once: true, capture: true });
    document.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }, [enabled, start, url]);

  useEffect(() => {
    const foregroundIsPlaying = () => Array.from(document.querySelectorAll<HTMLMediaElement>('audio:not([data-background-music]), video')).some((media) => !media.paused && !media.ended);
    const onPlay = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLMediaElement) || target.dataset.backgroundMusic === 'true') return;
      setDucked(true);
      fadeTo(settings.backgroundMusicVolume * 0.08, 220);
    };
    const onPause = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLMediaElement) || target.dataset.backgroundMusic === 'true') return;
      window.setTimeout(() => {
        if (!foregroundIsPlaying()) { setDucked(false); if (enabled) fadeTo(settings.backgroundMusicVolume, 420); }
      }, 30);
    };
    document.addEventListener('play', onPlay, true);
    document.addEventListener('pause', onPause, true);
    document.addEventListener('ended', onPause, true);
    return () => {
      document.removeEventListener('play', onPlay, true);
      document.removeEventListener('pause', onPause, true);
      document.removeEventListener('ended', onPause, true);
    };
  }, [enabled, fadeTo, settings.backgroundMusicVolume]);

  useEffect(() => () => window.cancelAnimationFrame(animationRef.current), []);

  async function toggle() {
    const audio = audioRef.current;
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(ENABLED_KEY, String(next));
    if (!audio) return;
    if (!next) {
      fadeTo(0, 180);
      window.setTimeout(() => audio.pause(), 190);
    } else {
      try { audio.volume = 0; await audio.play(); fadeTo(settings.backgroundMusicVolume); } catch { setError(true); }
    }
  }

  if (settings.backgroundMusicMode === 'off' || !url) return error ? <div className="fixed right-3 top-3 z-50 rounded-full border border-white/10 bg-black/65 px-3 py-2 text-[10px] text-white/45">Музыка недоступна</div> : null;

  return <>
    <audio
      ref={audioRef}
      data-background-music="true"
      src={url}
      loop
      preload="auto"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onError={() => setError(true)}
    />
    <button type="button" onClick={() => void toggle()} aria-label={enabled ? 'Выключить фоновую музыку' : 'Включить фоновую музыку'} className="fixed right-3 top-3 z-50 flex max-w-[54vw] items-center gap-2 rounded-full border border-white/10 bg-[#131116]/88 px-3 py-2 text-[#F4EFE6] shadow-xl backdrop-blur-xl">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${enabled && playing ? 'bg-gold text-black' : 'bg-white/5 text-white/55'}`}>{enabled ? <Volume2 size={14}/> : <VolumeX size={14}/>}</span>
      <span className="min-w-0 text-left"><span className="block truncate text-[10px]">{settings.backgroundMusicTitle}</span><span className="block text-[8px] uppercase tracking-[1.2px] text-white/35">{!enabled ? 'выключена' : ducked ? 'звук приглушён' : playing ? 'играет фоном' : 'нажми в любом месте'}</span></span>
      <Music2 size={12} className="shrink-0 text-gold/55"/>
    </button>
  </>;
}
