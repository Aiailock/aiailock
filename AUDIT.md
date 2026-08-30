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
      const { data: existing } = await db.from('reader_visitors').select('visit_count').eq('visitor_id', visitorId).maybeSingle();
      const { error: visitorError } = await db.from('reader_visitors').upsert({
        visitor_id: visitorId,
        last_seen_at: now,
        visit_count: Number(existing?.visit_count ?? 0) + 1,
        user_agent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 320) : null,
        viewport_width: boundedInt(body.viewportWidth, 0, 10000),
      }, { onConflict: 'visitor_id' });
      if (visitorError) throw new Error(visitorError.message);
      const { error: visitError } = await db.from('reader_visits').upsert({ id: visitId, visitor_id: visitorId, opened_at: now, last_seen_at: now }, { onConflict: 'id' });
      if (visitError) throw new Error(visitError.message);
      const { count, error: countError } = await db.from('timeline_elements').select('id', { count: 'exact', head: true }).eq('is_published', true);
      if (countError) throw new Error(countError.message);
      return json({ ok: true, total: count ?? 0 });
    }

    if (action !== 'progress' && action !== 'complete') throw new HttpError(400, 'Неизвестное событие.');
    const elementId = uuid(body.elementId);
    if (!elementId) throw new HttpError(400, 'Некорректный элемент истории.');
    const position = boundedInt(body.position, 1, 10000000);
    const progress = action === 'complete' ? 100 : boundedInt(body.progress, 0, 100);
    const { data: element, error: elementError } = await db.from('timeline_elements').select('occurred_at,type').eq('id', elementId).maybeSingle();
    if (elementError) throw new Error(elementError.message);
    if (!element) throw new HttpError(404, 'Элемент истории не найден.');

    const completion = action === 'complete' ? now : null;
    const { data: visit } = await db.from('reader_visits').select('max_position,max_progress').eq('id', visitId).eq('visitor_id', visitorId).maybeSingle();
    const visitFurthest = position >= Number(visit?.max_position ?? 0);
    const { error: visitError } = await db.from('reader_visits').upsert({
      id: visitId,
      visitor_id: visitorId,
      last_seen_at: now,
      max_position: Math.max(position, Number(visit?.max_position ?? 0)),
      max_progress: Math.max(progress, Number(visit?.max_progress ?? 0)),
      ...(visitFurthest ? { last_element_id: elementId, last_element_at: element.occurred_at, last_element_type: element.type } : {}),
      ...(completion ? { completed_at: completion } : {}),
    }, { onConflict: 'id' });
    if (visitError) throw new Error(visitError.message);

    const { data: visitor } = await db.from('reader_visitors').select('max_position,max_progress,visit_count').eq('visitor_id', visitorId).maybeSingle();
    const visitorFurthest = position >= Number(visitor?.max_position ?? 0);
    const { error: visitorError } = await db.from('reader_visitors').upsert({
      visitor_id: visitorId,
      last_seen_at: now,
      visit_count: Math.max(1, Number(visitor?.visit_count ?? 1)),
      max_position: Math.max(position, Number(visitor?.max_position ?? 0)),
      max_progress: Math.max(progress, Number(visitor?.max_progress ?? 0)),
      ...(visitorFurthest ? { last_element_id: elementId, last_element_at: element.occurred_at, last_element_type: element.type } : {}),
      ...(completion ? { completed_at: completion } : {}),
    }, { onConflict: 'visitor_id' });
    if (visitorError) throw new Error(visitorError.message);
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, error instanceof HttpError ? error.status : 500);
  }
});
