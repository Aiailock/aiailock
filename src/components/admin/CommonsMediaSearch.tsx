import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Image as ImageIcon, Loader2, Search, Video } from 'lucide-react';

export type CommonsMediaKind = 'image' | 'gif' | 'video';

export interface CommonsAsset {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  sourceUrl: string;
  mime: string;
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

async function searchCommons(query: string, kind: CommonsMediaKind): Promise<CommonsAsset[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '24',
    prop: 'imageinfo',
    iiprop: 'url|mime',
    iiurlwidth: '640',
    format: 'json',
    origin: '*',
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  if (!response.ok) throw new Error('Wikimedia Commons сейчас не отвечает.');
  const payload = await response.json() as { query?: { pages?: Record<string, CommonsQueryPage> } };
  return Object.values(payload.query?.pages ?? {})
    .flatMap((page) => {
      const info = page.imageinfo?.[0];
      const url = info?.url ?? '';
      const mime = info?.mime ?? '';
      if (!url || !fits(kind, mime)) return [];
      return [{
        id: String(page.pageid ?? url),
        title: (page.title ?? 'Wikimedia Commons').replace(/^File:/i, ''),
        url,
        previewUrl: info?.thumburl || url,
        sourceUrl: info?.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title ?? '')}`,
        mime,
      } satisfies CommonsAsset];
    })
    .slice(0, 12);
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

  useEffect(() => {
    if (!query && initialQuery) setQuery(initialQuery);
  }, [initialQuery, query]);

  const label = useMemo(() => kind === 'gif' ? 'GIF' : kind === 'video' ? 'видео' : 'картинку', [kind]);

  async function runSearch() {
    const normalized = query.trim();
    if (!normalized) return;
    setBusy(true);
    setMessage('');
    try {
      const data = await searchCommons(normalized, kind);
      setResults(data);
      if (data.length === 0) setMessage(`Подходящие ${label} не найдены. Попробуй более общий запрос.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Поиск не удался.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="rounded-2xl border border-burgundy/10 bg-[#FBF8F5] p-3">
    <div className="flex items-center gap-2 text-xs font-medium text-burgundy">{kind === 'video' ? <Video size={14}/> : <ImageIcon size={14}/>} Бесплатный поиск Wikimedia Commons</div>
    <div className="mt-2 flex gap-2">
      <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void runSearch(); } }} placeholder={`Найти ${label}…`} className="min-w-0 flex-1 rounded-xl border bg-white p-2.5 text-xs"/>
      <button type="button" disabled={busy || !query.trim()} onClick={() => void runSearch()} className="rounded-xl bg-burgundy px-3 text-white disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>}</button>
    </div>
    {message && <p className="mt-2 text-[10px] opacity-55">{message}</p>}
    {results.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {results.map((asset) => <button key={asset.id} type="button" onClick={() => onChange(asset)} className={`overflow-hidden rounded-xl border bg-white text-left ${value?.id === asset.id ? 'border-burgundy ring-2 ring-burgundy/15' : 'border-black/10'}`}>
        <div className="aspect-[4/3] overflow-hidden bg-black/5">{kind === 'video' ? <video src={asset.url} muted playsInline preload="metadata" className="h-full w-full object-cover"/> : <img src={asset.previewUrl} alt="" loading="lazy" className="h-full w-full object-cover"/>}</div>
        <div className="p-2"><div className="line-clamp-2 text-[10px] leading-snug">{asset.title}</div></div>
      </button>)}
    </div>}
    {value && <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white p-2 text-[10px]"><span className="min-w-0 truncate">Выбрано: {value.title}</span><a href={value.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 text-burgundy"><ExternalLink size={12}/></a></div>}
    <p className="mt-2 text-[9px] leading-relaxed opacity-40">Файлы берутся из Wikimedia Commons. Перед публикацией можно открыть источник и проверить авторство/лицензию конкретного файла.</p>
  </div>;
}
