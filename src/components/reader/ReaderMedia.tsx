import { useEffect, useRef, useState } from 'react';
import { AudioLines, FileText, Image as ImageIcon, Play, Volume2 } from 'lucide-react';
import { fetchMediaUrl } from '@/lib/readerApi';
import type { PublicTimelineRow } from '@/lib/readerApi';

interface Props { row: PublicTimelineRow; token: string; }

export default function ReaderMedia({ row, token }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
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
    const id = row.media_id;
    const screenshotId = row.screenshot_id;
    const memoryId = row.memory_id;
    if (!nearViewport || (!id && !screenshotId && !memoryId) || url) return;
    const input = id ? { mediaId: id } : screenshotId ? { screenshotId: screenshotId } : { memoryId: memoryId as string };
    fetchMediaUrl(input, token)
      .then((result) => {
        if (!cancelled) { setUrl(result.url); setThumb(result.thumbnailUrl); }
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [nearViewport, row.media_id, row.screenshot_id, row.memory_id, token, url]);

  const kind = row.media_kind ?? ((row.screenshot_id || row.memory_photo_storage_path) ? 'photo' : 'document');
  return (
    <div ref={rootRef}>
      {error && <div className="rounded-2xl bg-black/5 p-8 text-center text-sm opacity-60">Медиа пока недоступно</div>}
      {!error && !url && <div className="flex min-h-48 items-center justify-center rounded-2xl bg-black/5 text-sm opacity-35">Загружается…</div>}
      {url && (kind === 'photo' || row.screenshot_id) && (
        <img src={url} alt={row.screenshot_title ?? row.screenshot_description ?? row.screenshot_caption ?? row.media_filename ?? 'Фотография'} loading="lazy" decoding="async" className="mx-auto max-h-[78vh] w-auto max-w-full rounded-xl object-contain" />
      )}
      {url && kind === 'video' && (
        <div className="overflow-hidden rounded-2xl bg-black shadow-lg">
          {thumb && <img src={thumb} alt="" loading="lazy" className="hidden" />}
          <video controls preload="metadata" poster={thumb ?? undefined} className="block w-full" src={url} />
          <div className="flex items-center gap-2 px-4 py-3 text-xs text-white/70"><Play size={13} /> {row.media_filename ?? 'Видео'}</div>
        </div>
      )}
      {url && kind === 'audio' && (
        <div className="flex items-center gap-3 rounded-2xl border border-burgundy/10 bg-white/60 p-4"><Volume2 size={18} className="text-burgundy" /><audio controls preload="none" src={url} className="min-w-0 flex-1" /><span className="sr-only">Аудиозапись</span></div>
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
