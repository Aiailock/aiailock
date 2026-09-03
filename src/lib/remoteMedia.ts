import { safeRemoteUrl } from './safeUrl';

export const MAX_GIF_BYTES = 20 * 1024 * 1024;

function safeGifName(title: string): string {
  const base = title.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'animation';
  return `${base}.gif`;
}

/**
 * Copies a remote GIF into a File so Admin can upload it to private Supabase
 * Storage. Reader no longer depends on a temporary/hotlink-protected URL.
 */
export async function downloadRemoteGif(value: unknown, title = 'animation'): Promise<File> {
  const url = safeRemoteUrl(value);
  if (!url) throw new Error('Вставь полную прямую ссылку на GIF.');

  let response: Response;
  try {
    response = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new Error('Этот сайт запрещает копирование GIF. Скачай гифку на телефон и выбери «Загрузить GIF-файл».');
  }
  if (!response.ok) throw new Error(`GIF не загрузился (код ${response.status}). Выбери другой результат или загрузи файл с телефона.`);

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_GIF_BYTES) throw new Error('GIF больше 20 МБ. Выбери файл поменьше.');
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('По ссылке пришёл пустой файл. Выбери другой GIF.');
  if (blob.size > MAX_GIF_BYTES) throw new Error('GIF больше 20 МБ. Выбери файл поменьше.');

  const mime = (blob.type || response.headers.get('content-type') || '').toLowerCase();
  const looksGif = mime.includes('image/gif') || /\.gif(?:$|[?#])/i.test(url);
  if (!looksGif) throw new Error('По ссылке открывается не GIF-файл, а страница или картинка. Выбери прямой GIF или загрузи файл.');
  return new File([blob], safeGifName(title), { type: 'image/gif', lastModified: Date.now() });
}
