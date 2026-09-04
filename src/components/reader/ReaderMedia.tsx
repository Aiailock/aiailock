import { useEffect, useRef, useState } from 'react';
import { AudioLines, FileText, Image as ImageIcon, Play } from 'lucide-react';
import { fetchMediaUrl, peekMediaUrl, readerMediaInput } from '@/lib/readerApi';
import type { PublicTimelineRow } from '@/lib/readerApi';
import { safeRemoteUrl } from '@/lib/safeUrl';
import VinylAudioPlayer, { type AudioPlayerStyle } from './VinylAudioPlayer';

interface Props { row: PublicTimelineRow; token: string; }

export default function ReaderMedia({ row, token }: Props) {
  const externalUrl = safeRemoteUrl(row.style?.externalMediaUrl);
  const input = readerMediaInput(row);
  const warmed = peekMediaUrl(input);
  const [url, setUrl] = useState<string | null>(externalUrl ?? warmed?.url ?? null);
  const [thumb, setThumb] = useState<string | null>(warmed?.thumbnailUrl ?? null);
  const [error, setError] = useState(false);
  const [nearViewport, setNearViewport] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '700px' });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!nearViewport || externalUrl || !input || url) return;
    fetchMediaUrl(input, token)
      .then((result) => {
        if (!cancelled) { setUrl(result.url); setThumb(result.thumbnailUrl); }
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [nearViewport, input, token, url, externalUrl]);

  const externalKind = typeof row.style?.externalMediaKind === 'string'
    ? row.style.externalMediaKind
    : null;
  const kind = externalKind
    ?? (row.type === 'gif' ? 'gif' : null)
    ?? row.media_kind
    ?? ((row.screenshot_id || row.memory_photo_storage_path) ? 'photo' : 'document');
  const requestedAudioStyle = typeof row.style?.audioPlayerStyle === 'string' ? row.style.audioPlayerStyle : '';
  const allowedAudioStyles: AudioPlayerStyle[] = ['vinyl', 'voice', 'glass', 'cassette', 'minimal'];
  const audioVariant = allowedAudioStyles.includes(requestedAudioStyle as AudioPlayerStyle)
    ? requestedAudioStyle as AudioPlayerStyle
    : row.metadata?.audioPurpose === 'voice' || !row.metadata?.musicSource
      ? 'voice'
      : 'vinyl';
  return (
    <div ref={rootRef} className="story-media min-w-0 max-w-full">
      {error && <div className="rounded-2xl border border-white/10 bg-black/10 p-8 text-center text-sm opacity-70">{kind === 'gif' ? 'Эта GIF пока недоступна — её можно заменить в админке' : 'Медиа пока недоступно'}</div>}
      {!error && !url && <div className="flex min-h-48 items-center justify-center rounded-2xl bg-black/5 text-sm opacity-35">Загружается…</div>}
      {url && !error && (kind === 'photo' || kind === 'image' || kind === 'gif' || (row.screenshot_id && !externalKind)) && (
        <img src={url} onError={() => setError(true)} alt={row.screenshot_title ?? row.screenshot_description ?? row.screenshot_caption ?? row.media_filename ?? 'Фотография'} loading="lazy" decoding="async" className="mx-auto max-h-[78vh] w-auto max-w-full rounded-xl object-contain" />
      )}
      {url && kind === 'video' && (
        <div className="overflow-hidden rounded-2xl bg-black shadow-lg">
          {thumb && <img src={thumb} alt="" loading="lazy" className="hidden" />}
          <video controls preload="metadata" poster={thumb ?? undefined} className="block w-full" src={url} />
          <div className="flex items-center gap-2 px-4 py-3 text-xs text-white/70"><Play size={13} /> {row.media_filename ?? 'Видео'}</div>
        </div>
      )}
      {url && kind === 'audio' && (
        <VinylAudioPlayer
          src={url}
          coverUrl={thumb ?? safeRemoteUrl(row.metadata?.coverUrl)}
          title={typeof row.metadata?.title === 'string' ? row.metadata.title : row.media_filename}
          artist={typeof row.metadata?.artist === 'string' ? row.metadata.artist : null}
          album={typeof row.metadata?.album === 'string' ? row.metadata.album : null}
          sourceUrl={typeof row.metadata?.sourceUrl === 'string' ? row.metadata.sourceUrl : null}
          isPreview={row.metadata?.musicSource === 'search'}
          variant={audioVariant}
        />
      )}
      {url && kind === 'sticker' && <div className="flex justify-center rounded-2xl bg-white/40 p-6"><img src={url} alt="Стикер" loading="lazy" decoding="async" className="max-h-56 max-w-[70%] object-contain" /></div>}
      {url && kind === 'document' && <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white/60 p-5 text-sm"><FileText size={20} /> Открыть {row.media_filename ?? 'файл'}</a>}
    </div>
  );
}

export function MediaIcon({ kind }: { kind: string | null }) {
  if (kind === 'audio') return <AudioLines size={16} />;
  if (kind === 'photo') return <ImageIcon size={16} />;
  return <FileText size={16} />;
}
