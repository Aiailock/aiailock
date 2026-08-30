import { createClient } from 'npm:@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-reader-access-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase environment is not configured.');
  return createClient(url, key, { auth: { persistSession: false } });
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeText(value: string) { return new TextEncoder().encode(value); }

async function sign(payload: string): Promise<string> {
  const secret = Deno.env.get('READER_ACCESS_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('READER_ACCESS_SECRET is not configured.');
  const key = await crypto.subtle.importKey('raw', encodeText(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encodeText(payload))));
}

async function verifyReaderToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  const [encoded, provided] = token.split('.');
  if (!encoded || !provided) return false;
  const expected = await sign(encoded);
  if (expected.length !== provided.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  if (mismatch !== 0) return false;
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)))) as { v?: number; exp?: number };
    return payload.v === 1 && typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function boundedInt(value: unknown, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : min;
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : null;
}

function shortText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : null;
}

function deviceInfo(value: unknown): Record<string, unknown> {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const textFields = ['deviceType', 'browser', 'os', 'model', 'platform', 'language', 'timezone',
    'connectionType', 'effectiveConnectionType', 'colorScheme', 'displayMode', 'referrer'];
  const result: Record<string, unknown> = {};
  for (const key of textFields) {
    const clean = shortText(input[key], key === 'referrer' ? 500 : 120);
    if (clean) result[key] = clean;
  }
  if (Array.isArray(input.languages)) {
    result.languages = input.languages.slice(0, 8).map((item) => shortText(item, 40)).filter(Boolean);
  }
  for (const key of ['screenWidth', 'screenHeight', 'viewportWidth', 'viewportHeight', 'touchPoints',
    'hardwareConcurrency', 'timezoneOffset']) {
    const number = boundedNumber(input[key], key === 'timezoneOffset' ? -1440 : 0, key === 'timezoneOffset' ? 1440 : 100000);
    if (number !== null) result[key] = Math.round(number);
  }
  for (const key of ['pixelRatio', 'deviceMemory', 'downlinkMbps']) {
    const number = boundedNumber(input[key], 0, 10000);
    if (number !== null) result[key] = Math.round(number * 100) / 100;
  }
  if (typeof input.saveData === 'boolean') result.saveData = input.saveData;
  return result;
}

function countryCode(req: Request): string | null {
  const value = req.headers.get('cf-ipcountry') ?? req.headers.get('x-country-code') ?? '';
  return /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : null;
}

interface StoryPointRow {
  type?: string | null;
  occurred_at?: string | null;
  metadata?: Record<string, unknown> | null;
  display_text?: string | null;
  original_text?: string | null;
  memory_title?: string | null;
  memory_body?: string | null;
  screenshot_title?: string | null;
  screenshot_description?: string | null;
  screenshot_caption?: string | null;
  media_filename?: string | null;
}

function storyPoint(row: StoryPointRow): { label: string; preview: string | null } {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const metadataTitle = shortText(metadata.title, 140);
  const year = shortText(metadata.year, 12);
  const labels: Record<string, string> = {
    message: 'Сообщение', photo: 'Фотография', video: 'Видео', audio: 'Аудиосообщение', sticker: 'Стикер',
    memory: shortText(row.memory_title, 140) ?? 'Воспоминание',
    special: shortText(row.memory_title, 140) ?? metadataTitle ?? 'Особый момент',
    interactive: shortText(row.memory_title, 140) ?? metadataTitle ?? 'Интерактивный момент',
    screenshot: shortText(row.screenshot_title, 140) ?? 'Скриншот',
    chapter: metadataTitle ?? 'Глава', quote: metadataTitle ?? 'Цитата', pause: metadataTitle ?? 'Пауза',
    year_break: `${year ?? new Date(row.occurred_at ?? Date.now()).getUTCFullYear()} год`,
    on_this_day: 'В этот день', milestone: metadataTitle ?? 'Важная точка',
  };
  const preview = [row.display_text, row.original_text, row.memory_body, row.screenshot_description,
    row.screenshot_caption, metadata.text, metadata.body, metadata.subtitle, row.media_filename]
    .map((item) => shortText(item, 280)).find(Boolean) ?? null;
  return { label: labels[String(row.type ?? '')] ?? 'Элемент истории', preview };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    if (!(await verifyReaderToken(req.headers.get('x-reader-access-token')))) {
      throw new HttpError(401, 'Требуется доступ к истории.');
    }
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';
    const visitorId = uuid(body.visitorId);
    const visitId = uuid(body.visitId);
    if (!visitorId || !visitId) throw new HttpError(400, 'Некорректный идентификатор сессии.');

    const db = serviceClient();
    const now = new Date().toISOString();

    if (action === 'open') {
      const details = deviceInfo(body.deviceInfo);
      const userAgent = shortText(body.userAgent, 500);
      const viewportWidth = boundedInt(body.viewportWidth ?? details.viewportWidth, 0, 10000);
      const country = countryCode(req);
      const { data: existing } = await db.from('reader_visitors').select('visit_count').eq('visitor_id', visitorId).maybeSingle();
      const { error: visitorError } = await db.from('reader_visitors').upsert({
        visitor_id: visitorId,
        last_seen_at: now,
        visit_count: Number(existing?.visit_count ?? 0) + 1,
        user_agent: userAgent,
        viewport_width: viewportWidth,
        device_info: details,
        country_code: country,
      }, { onConflict: 'visitor_id' });
      if (visitorError) throw new Error(visitorError.message);
      const { error: visitError } = await db.from('reader_visits').upsert({
        id: visitId,
        visitor_id: visitorId,
        opened_at: now,
        last_seen_at: now,
        user_agent: userAgent,
        viewport_width: viewportWidth,
        device_info: details,
        country_code: country,
      }, { onConflict: 'id' });
      if (visitError) throw new Error(visitError.message);
      const { count, error: countError } = await db.from('reader_timeline_data').select('element_id', { count: 'exact', head: true });
      if (countError) throw new Error(countError.message);
      return json({ ok: true, total: count ?? 0 });
    }

    if (action !== 'progress' && action !== 'complete') throw new HttpError(400, 'Неизвестное событие.');
    const elementId = uuid(body.elementId);
    if (!elementId) throw new HttpError(400, 'Некорректный элемент истории.');
    const position = boundedInt(body.position, 1, 10000000);
    const progress = action === 'complete' ? 100 : boundedInt(body.progress, 0, 100);
    const { data: element, error: elementError } = await db.from('reader_timeline_data')
      .select('occurred_at,type,metadata,display_text,original_text,memory_title,memory_body,screenshot_title,screenshot_description,screenshot_caption,media_filename')
      .eq('element_id', elementId).maybeSingle();
    if (elementError) throw new Error(elementError.message);
    if (!element) throw new HttpError(404, 'Элемент истории не найден.');
    const point = storyPoint(element as StoryPointRow);
    const chapter = shortText(body.chapter, 180);

    const completion = action === 'complete' ? now : null;
    const [visitResult, visitorResult] = await Promise.all([
      db.from('reader_visits').select('max_position,max_progress').eq('id', visitId).eq('visitor_id', visitorId).maybeSingle(),
      db.from('reader_visitors').select('max_position,max_progress,visit_count').eq('visitor_id', visitorId).maybeSingle(),
    ]);
    if (visitResult.error) throw new Error(visitResult.error.message);
    if (visitorResult.error) throw new Error(visitorResult.error.message);
    const visit = visitResult.data;
    const visitor = visitorResult.data;

    // Restore the visitor first if the owner cleared analytics while this
    // reading tab was still open. The visit row has a foreign key to it.
    const visitorFurthest = position >= Number(visitor?.max_position ?? 0);
    const { error: visitorError } = await db.from('reader_visitors').upsert({
      visitor_id: visitorId,
      last_seen_at: now,
      visit_count: Math.max(1, Number(visitor?.visit_count ?? 1)),
      max_position: Math.max(position, Number(visitor?.max_position ?? 0)),
      max_progress: Math.max(progress, Number(visitor?.max_progress ?? 0)),
      ...(visitorFurthest ? {
        last_element_id: elementId,
        last_element_at: element.occurred_at,
        last_element_type: element.type,
        last_element_label: point.label,
        last_element_preview: point.preview,
        last_chapter: chapter,
      } : {}),
      ...(completion ? { completed_at: completion } : {}),
    }, { onConflict: 'visitor_id' });
    if (visitorError) throw new Error(visitorError.message);

    const visitFurthest = position >= Number(visit?.max_position ?? 0);
    const { error: visitError } = await db.from('reader_visits').upsert({
      id: visitId,
      visitor_id: visitorId,
      last_seen_at: now,
      max_position: Math.max(position, Number(visit?.max_position ?? 0)),
      max_progress: Math.max(progress, Number(visit?.max_progress ?? 0)),
      ...(visitFurthest ? {
        last_element_id: elementId,
        last_element_at: element.occurred_at,
        last_element_type: element.type,
        last_element_label: point.label,
        last_element_preview: point.preview,
        last_chapter: chapter,
      } : {}),
      ...(completion ? { completed_at: completion } : {}),
    }, { onConflict: 'id' });
    if (visitError) throw new Error(visitError.message);
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, error instanceof HttpError ? error.status : 500);
  }
});
