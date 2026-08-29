import { useEffect, useState } from 'react';
import { Heart, LockKeyhole } from 'lucide-react';
import TimelineStory from '@/components/reader/TimelineStory';
import { fetchReaderSettings, requestReaderAccess } from '@/lib/readerApi';
import { ReaderSettingsContext, readDisplaySettingsFromTheme, type ReaderDisplaySettings } from '@/lib/readerSettingsContext';

const TOKEN_KEY = 'for-you-reader-token';

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
  const [displaySettings, setDisplaySettings] = useState<ReaderDisplaySettings>(() => readDisplaySettingsFromTheme(null));

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

  if (loading) return <div className="min-h-screen bg-cream" />;

  if (requiresPassword && !token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream px-6">
        <form onSubmit={(e) => { e.preventDefault(); void unlock(); }} className="w-full max-w-sm rounded-[30px] border border-burgundy/10 bg-white/55 p-8 text-center shadow-sm">
          <LockKeyhole className="mx-auto text-burgundy/70" size={22} />
          <h1 className="mt-5 font-serif text-3xl text-burgundy">{title}</h1>
          <p className="mt-3 text-sm opacity-55">Эта история открывается по паролю.</p>
          <input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-6 w-full rounded-xl border border-black/10 bg-white px-4 py-3 outline-none focus:border-burgundy/40" placeholder="Пароль" />
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
          <button disabled={checkingPassword || !password} className="mt-4 w-full rounded-xl bg-burgundy px-4 py-3 text-sm text-white disabled:opacity-40">{checkingPassword ? 'Открываю…' : 'Открыть'}</button>
        </form>
      </main>
    );
  }

  if (!token) return <div className="flex min-h-screen items-center justify-center bg-cream px-6 text-center text-sm opacity-60">{error ?? 'История пока недоступна.'}</div>;

  const empty = token === 'empty';
  const petals = Array.from({ length: 7 }, (_, index) => ({ left: `${10 + index * 13}%`, delay: `${index * 1.7}s`, duration: `${14 + (index % 3) * 4}s`, size: `${6 + (index % 3) * 2}px` }));
  return (
    <main className="reader-shell relative min-h-screen overflow-hidden bg-cream text-ink">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
        {petals.map((petal, index) => <svg key={index} className="petal absolute top-[-5vh] opacity-40" style={{ left: petal.left, animationDelay: petal.delay, animationDuration: petal.duration, width: petal.size, height: petal.size }} viewBox="0 0 20 20"><path d="M10 1C15 4 18 8 10 18C2 8 5 4 10 1Z" fill="currentColor"/></svg>)}
      </div>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(242,201,194,.55),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(200,191,231,.45),transparent_38%)]" />
      <section className="flex min-h-[94vh] flex-col items-center justify-center px-6 text-center">
        <Heart size={21} strokeWidth={1.3} className="mb-5 text-burgundy/70" />
        <h1 className="font-serif text-[46px] font-medium tracking-wide text-burgundy sm:text-6xl">{title}</h1>
        <p className="mt-5 font-script text-2xl opacity-55">история впереди</p>
        <div className="mt-16 h-14 w-px bg-gradient-to-b from-transparent via-burgundy/25 to-transparent" />
      </section>
      {empty ? (
        <section className="mx-auto flex min-h-[45vh] max-w-page items-center justify-center px-6 pb-32 text-center">
          <div className="rounded-[36px] border border-burgundy/10 bg-white/45 px-7 py-10 shadow-sm backdrop-blur-sm">
            <div className="font-script text-2xl text-burgundy/70">первые страницы скоро появятся</div>
            <p className="mt-4 font-serif text-2xl leading-relaxed text-burgundy">Эта история ещё не наполнена.
              <br />Но место для неё уже есть.</p>
          </div>
        </section>
      ) : <ReaderSettingsContext.Provider value={displaySettings}><TimelineStory token={token} track={!isPreview} /></ReaderSettingsContext.Provider>}
      <div className="px-6 pb-20 pt-8 text-center">
        <div className="mx-auto h-px w-16 bg-gold/45" />
        <p className="mt-4 font-script text-2xl text-burgundy/55">история продолжается</p>
      </div>
    </main>
  );
}
