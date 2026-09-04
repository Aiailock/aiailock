import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Image as ImageIcon, Loader2, Search, Video } from 'lucide-react';
import { curatedGifMatches, gifSearchTerms } from '@/lib/gifSearch';

export type CommonsMediaKind = 'image' | 'gif' | 'video';

export interface CommonsAsset {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  sourceUrl: string;
  mime: string;
  provider?: string;
}

interface CommonsQueryPage {
  pageid?: number;
  title?: string;
  imageinfo?: Array<{
    url?: string;
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
  }>;
}

function fits(kind: CommonsMediaKind, mime: string) {
  if (kind === 'gif') return mime === 'image/gif';
  if (kind === 'video') return mime.startsWith('video/') || mime === 'application/ogg';
  return mime.startsWith('image/') && mime !== 'image/gif';
}

const GIF_PRESETS = [
  ['Объятия', 'объятия'],
  ['Сердечки', 'сердечки'],
  ['Доброй ночи', 'доброй ночи'],
  ['Скучаю', 'скучаю'],
  ['Котики', 'милый котик'],
  ['Смешное', 'смешной котик'],
  ['Поддержка', 'поддержка'],
] as const;

async function searchCommonsPage(query: string, kind: CommonsMediaKind, strictMime = true): Promise<CommonsAsset[]> {
  const searchQuery = kind === 'gif' && strictMime ? `${query} filemime:image/gif` : query;
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: searchQuery,
    gsrnamespace: '6',
    gsrlimit: kind === 'gif' ? '50' : '30',
    gsrwhat: 'text',
    prop: 'imageinfo',
    iiprop: 'url|mime',
    iiurlwidth: '640',
    format: 'json',
    formatversion: '2',
    uselang: 'ru',
    origin: '*',
  });
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 9000);
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, { signal: controller.signal })
    .finally(() => window.clearTimeout(timer));
  if (!response.ok) throw new Error('Wikimedia Commons сейчас не отвечает.');
  const payload = await response.json() as { query?: { pages?: CommonsQueryPage[] | Record<string, CommonsQueryPage> } };
  const pages = Array.isArray(payload.query?.pages) ? payload.query?.pages : Object.values(payload.query?.pages ?? {});
  return pages
    .flatMap((page) => {
      const info = page.imageinfo?.[0];
      const url = info?.url ?? '';
      const mime = info?.mime ?? '';
      if (!url || !fits(kind, mime)) return [];
      return [{
        id: String(page.pageid ?? url),
        title: (page.title ?? 'Wikimedia Commons').replace(/^File:/i, ''),
        url,
        previewUrl: kind === 'gif' ? url : info?.thumburl || url,
        sourceUrl: info?.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title ?? '')}`,
        mime,
        provider: 'Wikimedia Commons',
      } satisfies CommonsAsset];
    })
    .slice(0, 18);
}

async function searchCommons(query: string, kind: CommonsMediaKind): Promise<CommonsAsset[]> {
  if (kind !== 'gif') return searchCommonsPage(query, kind);
  const curated = curatedGifMatches(query, 8).map((asset) => ({
    ...asset,
    previewUrl: asset.url,
    mime: 'image/gif',
  }));
  const attempts = await Promise.allSettled(gifSearchTerms(query).map((term) => searchCommonsPage(term, kind)));
  const remote = attempts.flatMap((attempt) => attempt.status === 'fulfilled' ? attempt.value : []);
  return Array.from(new Map([...curated, ...remote].map((asset) => [asset.url.split('?')[0], asset])).values()).slice(0, 24);
}

export default function CommonsMediaSearch({
  kind,
  initialQuery = '',
  value,
  onChange,
}: {
  kind: CommonsMediaKind;
  initialQuery?: string;
  value: CommonsAsset | null;
  onChange: (asset: CommonsAsset) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CommonsAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    if (!query && initialQuery) setQuery(initialQuery);
  }, [initialQuery, query]);

  const label = useMemo(() => kind === 'gif' ? 'GIF' : kind === 'video' ? 'видео' : 'картинку', [kind]);

  async function runSearch(nextQuery = query) {
    const normalized = nextQuery.trim();
    if (!normalized) return;
    if (nextQuery !== query) setQuery(nextQuery);
    const currentRequest = ++requestId.current;
    setBusy(true);
    if (kind === 'gif') {
      const instant = curatedGifMatches(normalized, 8).map((asset) => ({ ...asset, previewUrl: asset.url, mime: 'image/gif' }));
      setResults(instant);
      setMessage(`Готовая коллекция: ${instant.length}. Ищу дополнительные варианты…`);
    } else {
      setMessage('');
    }
    try {
      const data = await searchCommons(normalized, kind);
      if (currentRequest !== requestId.current) return;
      setResults(data);
      setMessage(data.length === 0
        ? `Подходящие ${label} не найдены. Нажми одну из готовых эмоций ниже или попробуй более общий запрос.`
        : `Нашлось: ${data.length}. Нажми на вариант, чтобы выбрать его.`);
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setMessage(kind === 'gif'
        ? 'Интернет-поиск сейчас недоступен, но готовая коллекция выше продолжает работать.'
        : error instanceof Error ? error.message : 'Поиск не удался.');
    } finally {
      if (currentRequest === requestId.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (kind !== 'gif' || results.length > 0) return;
    const starter = curatedGifMatches(initialQuery || 'любовь', 8).map((asset) => ({ ...asset, previewUrl: asset.url, mime: 'image/gif' }));
    setResults(starter);
    setMessage('Готовая коллекция уже здесь. Можно выбрать GIF сразу или уточнить поиск.');
  }, [initialQuery, kind, results.length]);

  return <div className="rounded-2xl border border-burgundy/10 bg-[#FBF8F5] p-3">
    <div className="flex items-center gap-2 text-xs font-medium text-burgundy">{kind === 'video' ? <Video size={14}/> : <ImageIcon size={14}/>} {kind === 'gif' ? 'Библиотека милых GIF' : 'Бесплатный поиск Wikimedia Commons'}</div>
    <div className="mt-2 flex gap-2">
      <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void runSearch(); } }} placeholder={`Найти ${label}…`} className="min-w-0 flex-1 rounded-xl border bg-white p-2.5 text-xs"/>
      <button type="button" disabled={busy || !query.trim()} onClick={() => void runSearch()} className="rounded-xl bg-burgundy px-3 text-white disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>}</button>
    </div>
    {kind === 'gif' && <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
      {GIF_PRESETS.map(([presetLabel, presetQuery]) => <button key={presetLabel} type="button" disabled={busy} onClick={() => void runSearch(presetQuery)} className="shrink-0 rounded-full border border-burgundy/10 bg-white px-2.5 py-1.5 text-[10px] text-burgundy disabled:opacity-40">{presetLabel}</button>)}
    </div>}
    {message && <p className="mt-2 text-[10px] opacity-55">{message}</p>}
    {results.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {results.map((asset) => <button key={asset.id} type="button" onClick={() => onChange(asset)} className={`overflow-hidden rounded-xl border bg-white text-left ${value?.id === asset.id ? 'border-burgundy ring-2 ring-burgundy/15' : 'border-black/10'}`}>
        <div className="aspect-[4/3] overflow-hidden bg-black/5">{kind === 'video' ? <video src={asset.url} muted playsInline preload="metadata" className="h-full w-full object-cover"/> : <img src={asset.previewUrl} alt="" loading="lazy" className="h-full w-full object-cover"/>}</div>
        <div className="p-2"><div className="line-clamp-2 text-[10px] leading-snug">{asset.title}</div></div>
      </button>)}
    </div>}
    {value && <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white p-2 text-[10px]"><span className="min-w-0 truncate">Выбрано: {value.title}</span><a href={value.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 text-burgundy"><ExternalLink size={12}/></a></div>}
    <p className="mt-2 text-[9px] leading-relaxed opacity-40">GIF-библиотека работает без ключей: сначала показывает готовую коллекцию GIPHY/Wikimedia, затем добавляет результаты поиска Commons. Перед публикацией можно открыть источник и проверить правила использования.</p>
  </div>;
}
