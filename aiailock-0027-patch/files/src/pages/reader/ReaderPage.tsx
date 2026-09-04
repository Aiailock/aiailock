import { useEffect, useState } from 'react';
import { ArrowDown, Heart, LockKeyhole, Sparkles } from 'lucide-react';
import TimelineStory from '@/components/reader/TimelineStory';
import { fetchReaderSettings, requestReaderAccess } from '@/lib/readerApi';
import { ReaderSettingsContext, prefersLiteReaderMotion, readDisplaySettingsFromTheme, type ReaderDisplaySettings } from '@/lib/readerSettingsContext';
import { safeRemoteUrl } from '@/lib/safeUrl';
import BackgroundMusic from '@/components/reader/BackgroundMusic';

const TOKEN_KEY = 'for-you-reader-token';
const DISPLAY_SETTINGS_KEY = 'for-you-display-settings-v1';

function cachedDisplaySettings(): ReaderDisplaySettings {
  try {
    return readDisplaySettingsFromTheme(JSON.parse(localStorage.getItem(DISPLAY_SETTINGS_KEY) ?? 'null') as Record<string, unknown> | null);
  } catch {
    return readDisplaySettingsFromTheme(null);
  }
}

function PageLoader({ settings }: { settings: ReaderDisplaySettings }) {
  return <div className="flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#09090B] px-7 text-center text-[#F4EFE6]">
    <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(173,91,126,.2),transparent_34%)]"/>
    <div className="relative w-full max-w-sm">
      {settings.loaderStyle === 'hearts' ? <div className="story-heart-loader mx-auto" aria-hidden="true"><Heart/><Heart/><Heart/></div>
        : settings.loaderStyle === 'minimal' ? <div className="story-loader-ring mx-auto" aria-hidden="true" />
        : <div className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-full border border-gold/25 text-gold" aria-hidden="true"><Sparkles size={22}/></div>}
      <div className="mt-7 font-serif text-[34px] leading-tight">{settings.loaderTitle}</div>
      <div className="mx-auto mt-3 max-w-[280px] text-sm leading-relaxed text-white/45">{settings.loaderSubtitle}</div>
    </div>
  </div>;
}

function tokenLooksFresh(token: string): boolean {
  try {
    const encoded = token.split('.')[0];
    if (!encoded) return false;
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000) + 30;
  } catch {
    return false;
  }
}

export default function ReaderPage() {
  const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';
  const [title, setTitle] = useState('Для тебя');
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checkingPassword, setCheckingPassword] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<ReaderDisplaySettings>(cachedDisplaySettings);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const settings = await fetchReaderSettings();
        if (cancelled) return;
        setTitle(settings.reader_title || 'Для тебя');
        setRequiresPassword(settings.reader_requires_password);
        if (settings.theme) {
          const root = document.documentElement;
          const themeMap: Record<string, string> = { cream: '--cream', blush: '--blush', peach: '--peach', lavender: '--lavender', burgundy: '--burgundy', gold: '--gold', ink: '--ink', paper: '--paper' };
          for (const [key, variable] of Object.entries(themeMap)) {
            const value = settings.theme[key];
            if (typeof value === 'string') root.style.setProperty(variable, value);
          }
        }
        localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settings.theme ?? {}));
        setDisplaySettings(readDisplaySettingsFromTheme(settings.theme ?? null));
        const saved = localStorage.getItem(TOKEN_KEY);
        if (saved && tokenLooksFresh(saved)) {
          if (!cancelled) setToken(saved);
        } else if (isPreview) {
          const accessToken = await requestReaderAccess('', true);
          if (!cancelled) { localStorage.setItem(TOKEN_KEY, accessToken); setToken(accessToken); }
        } else if (!settings.reader_requires_password) {
          const accessToken = await requestReaderAccess('');
          if (!cancelled) { localStorage.setItem(TOKEN_KEY, accessToken); setToken(accessToken); }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось открыть страницу.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => { cancelled = true; };
  }, [isPreview]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.readerMotion = prefersLiteReaderMotion(displaySettings.motionMode) ? 'lite' : 'full';
    return () => { delete root.dataset.readerMotion; };
  }, [displaySettings.motionMode]);

  async function unlock() {
    setCheckingPassword(true);
    setError(null);
    try {
      const accessToken = await requestReaderAccess(password);
      localStorage.setItem(TOKEN_KEY, accessToken);
      setToken(accessToken);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неверный пароль.');
    } finally {
      setCheckingPassword(false);
    }
  }

  if (loading) return <PageLoader settings={displaySettings} />;

  if (requiresPassword && !token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0B0D] px-6 text-[#F4EFE6]">
        <form onSubmit={(e) => { e.preventDefault(); void unlock(); }} className="w-full max-w-sm border-y border-gold/20 px-2 py-12 text-center">
          <LockKeyhole className="mx-auto text-gold/70" size={22} />
          <h1 className="mt-5 font-serif text-4xl text-[#F4EFE6]">{title}</h1>
          <p className="mt-3 text-sm text-[#F4EFE6]/50">Эта история открывается по паролю.</p>
          <input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-7 w-full rounded-xl border border-white/10 bg-white/[.06] px-4 py-3 text-[#F4EFE6] outline-none placeholder:text-white/25 focus:border-gold/50" placeholder="Пароль" />
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
          <button disabled={checkingPassword || !password} className="mt-4 w-full rounded-xl bg-gold px-4 py-3 text-sm font-medium text-[#17110A] disabled:opacity-40">{checkingPassword ? 'Открываю…' : 'Открыть'}</button>
        </form>
      </main>
    );
  }

  if (!token) return <div className="flex min-h-screen items-center justify-center bg-[#0B0B0D] px-6 text-center text-sm text-[#F4EFE6]/60">{error ?? 'История пока недоступна.'}</div>;

  const empty = token === 'empty';
  const coverBackground = safeRemoteUrl(displaySettings.coverBackgroundUrl);
  const petals = Array.from({ length: 4 }, (_, index) => ({ left: `${14 + index * 23}%`, delay: `${index * 2.4}s`, duration: `${18 + (index % 2) * 5}s`, size: `${6 + (index % 2) * 2}px` }));
  return (
    <main className="reader-shell relative min-h-screen overflow-hidden bg-[#0B0B0D] text-[#F4EFE6]">
      <BackgroundMusic token={token} settings={displaySettings} />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
        {petals.map((petal, index) => <svg key={index} className="petal absolute top-[-5vh] text-gold opacity-20" style={{ left: petal.left, animationDelay: petal.delay, animationDuration: petal.duration, width: petal.size, height: petal.size }} viewBox="0 0 20 20"><path d="M10 1C15 4 18 8 10 18C2 8 5 4 10 1Z" fill="currentColor"/></svg>)}
      </div>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_5%,rgba(201,160,99,.10),transparent_34%),radial-gradient(circle_at_50%_95%,rgba(92,35,53,.12),transparent_40%)]" />
      <section className="relative flex min-h-[96vh] flex-col items-center justify-center overflow-hidden bg-[#0B0B0D] px-6 text-center text-[#F4EFE6]" style={coverBackground ? { backgroundImage: `url(${JSON.stringify(coverBackground)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        <div className={`absolute inset-0 ${coverBackground ? 'bg-gradient-to-b from-black/55 via-black/48 to-[#0B0B0D]' : 'bg-[radial-gradient(circle_at_50%_42%,rgba(201,160,99,.08),transparent_38%)]'}`} />
        <div aria-hidden className="cinema-vignette absolute inset-0" />
        <Heart size={21} strokeWidth={1.2} className="relative mb-7 text-gold/75" />
        <h1 className="relative max-w-[390px] overflow-wrap-anywhere font-serif text-[50px] font-medium leading-[1.04] tracking-wide text-[#F4EFE6] drop-shadow-lg sm:text-6xl">{title}</h1>
        <p className="relative mt-6 max-w-xs font-script text-2xl leading-relaxed text-[#F4EFE6]/62">{displaySettings.coverSubtitle}</p>
        <button type="button" onClick={() => document.getElementById('story-start')?.scrollIntoView({ behavior: 'smooth' })} className="relative mt-14 flex flex-col items-center gap-3 text-[9px] uppercase tracking-[3px] text-gold/55"><span>начать путешествие</span><span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/20"><ArrowDown size={15}/></span></button>
      </section>
      {empty ? (
        <section className="mx-auto flex min-h-[45vh] max-w-page items-center justify-center px-6 pb-32 text-center">
          <div className="border-y border-gold/20 px-7 py-12">
            <div className="font-script text-2xl text-gold/70">первые страницы скоро появятся</div>
            <p className="mt-4 font-serif text-2xl leading-relaxed text-[#F4EFE6]">Эта история ещё не наполнена.
              <br />Но место для неё уже есть.</p>
          </div>
        </section>
      ) : <div id="story-start"><ReaderSettingsContext.Provider value={displaySettings}><TimelineStory token={token} track={!isPreview} preview={isPreview} /></ReaderSettingsContext.Provider></div>}
      <div className="px-6 pb-20 pt-8 text-center">
        <div className="mx-auto h-px w-16 bg-gold/45" />
        <p className="mt-4 font-script text-2xl text-[#F4EFE6]/55">{displaySettings.closingMessage}</p>
      </div>
    </main>
  );
}
