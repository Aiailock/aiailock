import { corsHeaders } from '../_shared/cors.ts';
import { serviceClient, HttpError } from '../_shared/db.ts';
import { verifyReaderToken } from '../_shared/readerToken.ts';

declare const Deno: { serve: (h: (r: Request) => Response | Promise<Response>) => void };

const SIGNED_URL_TTL_SECONDS = 300;
const BUCKET_BY_KIND: Record<string, string> = {
  photo: 'photos',
  video: 'videos',
  audio: 'audio',
  sticker: 'stickers',
  document: 'documents',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function checkReaderAccess(req: Request, db: ReturnType<typeof serviceClient>): Promise<void> {
  const { data: settings, error } = await db.from('history_settings').select('reader_requires_password').eq('id', true).maybeSingle();
  if (error) throw new Error(error.message);
  if (settings?.reader_requires_password && !(await verifyReaderToken(req.headers.get('x-reader-access-token')))) {
    throw new HttpError(401, 'Требуется доступ к истории.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const db = serviceClient();
    await checkReaderAccess(req, db);
    const body = await req.json().catch(() => ({}));
    const mediaId = typeof body.mediaId === 'string' ? body.mediaId : null;
    const screenshotId = typeof body.screenshotId === 'string' ? body.screenshotId : null;
    const memoryId = typeof body.memoryId === 'string' ? body.memoryId : null;
    if (!mediaId && !screenshotId && !memoryId) throw new HttpError(400, 'Не передан идентификатор медиа.');

    if (memoryId) {
      const { data: memory, error: memoryError } = await db
        .from('memories')
        .select('id,photo_storage_path')
        .eq('id', memoryId)
        .maybeSingle();
      if (memoryError) throw new Error(memoryError.message);
      if (!memory?.photo_storage_path) throw new HttpError(404, 'Фотография воспоминания не найдена.');
      const { data: published, error: publishedError } = await db
        .from('timeline_elements')
        .select('id')
        .eq('memory_id', memoryId)
        .eq('is_published', true)
        .maybeSingle();
      if (publishedError) throw new Error(publishedError.message);
      if (!published) throw new HttpError(403, 'Доступ к этому файлу пока не открыт.');
      const { data: signed, error: signError } = await db.storage.from('screenshots').createSignedUrl(memory.photo_storage_path, SIGNED_URL_TTL_SECONDS);
      if (signError || !signed) throw new Error(signError?.message ?? 'Не удалось создать ссылку.');
      return json({ url: signed.signedUrl, thumbnailUrl: null, expiresIn: SIGNED_URL_TTL_SECONDS });
    }

    if (screenshotId) {
      const { data: screenshot, error } = await db
        .from('screenshots')
        .select('id,storage_path')
        .eq('id', screenshotId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!screenshot?.storage_path) throw new HttpError(404, 'Скриншот не найден.');
      const { data: published, error: publishedError } = await db
        .from('timeline_elements')
        .select('id')
        .eq('screenshot_id', screenshotId)
        .eq('is_published', true)
        .maybeSingle();
      if (publishedError) throw new Error(publishedError.message);
      if (!published) throw new HttpError(403, 'Доступ к этому файлу пока не открыт.');
      const { data: signed, error: signError } = await db.storage.from('screenshots').createSignedUrl(screenshot.storage_path, SIGNED_URL_TTL_SECONDS);
      if (signError || !signed) throw new Error(signError?.message ?? 'Не удалось создать ссылку.');
      return json({ url: signed.signedUrl, thumbnailUrl: null, expiresIn: SIGNED_URL_TTL_SECONDS });
    }

    const { data: media, error: mediaError } = await db
      .from('media')
      .select('id,kind,status,storage_path,thumbnail_path')
      .eq('id', mediaId)
      .maybeSingle();
    if (mediaError) throw new Error(mediaError.message);
    if (!media || media.status !== 'stored' || !media.storage_path) throw new HttpError(404, 'Медиафайл не найден или ещё не сохранён.');

    const { data: published, error: publishedError } = await db
      .from('timeline_elements')
      .select('id')
      .eq('media_id', media.id)
      .eq('is_published', true)
      .maybeSingle();
    if (publishedError) throw new Error(publishedError.message);
    if (!published) throw new HttpError(403, 'Доступ к этому файлу пока не открыт.');

    const bucket = BUCKET_BY_KIND[media.kind];
    if (!bucket) throw new Error(`Неизвестный тип медиа: ${media.kind}`);
    const { data: signed, error: signError } = await db.storage.from(bucket).createSignedUrl(media.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed) throw new Error(signError?.message ?? 'Не удалось создать ссылку.');

    let thumbnailUrl: string | null = null;
    if (media.thumbnail_path) {
      const { data: thumb } = await db.storage.from('thumbnails').createSignedUrl(media.thumbnail_path, SIGNED_URL_TTL_SECONDS);
      thumbnailUrl = thumb?.signedUrl ?? null;
    }

    return json({ url: signed.signedUrl, thumbnailUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, error instanceof HttpError ? error.status : 500);
  }
});
