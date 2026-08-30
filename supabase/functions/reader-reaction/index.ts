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
const ALLOWED = new Set(['❤', '🥹', '😊', '✨', '😂', '💔']);

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
function uuid(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!(await verifyReaderToken(req.headers.get('x-reader-access-token')))) {
      throw new HttpError(401, 'Ссылка на историю устарела. Обнови страницу.');
    }
    const body = await req.json().catch(() => ({}));
    const visitorId = uuid(body.visitorId);
    const elementId = uuid(body.elementId);
    const emoji = typeof body.emoji === 'string' ? body.emoji : '';
    if (!visitorId || !elementId) throw new HttpError(400, 'Некорректная реакция.');
    if (!ALLOWED.has(emoji)) throw new HttpError(400, 'Эта реакция не поддерживается.');

    const db = serviceClient();
    const { data: published, error: publishedError } = await db.from('reader_timeline_data').select('element_id').eq('element_id', elementId).maybeSingle();
    if (publishedError) throw new Error(publishedError.message);
    if (!published) throw new HttpError(404, 'Элемент истории не найден.');

    const { error } = await db.from('reader_reactions').upsert({ visitor_id: visitorId, element_id: elementId, emoji, updated_at: new Date().toISOString() }, { onConflict: 'visitor_id,element_id' });
    if (error) throw new Error(error.message);
    const { count, error: countError } = await db.from('reader_reactions').select('*', { count: 'exact', head: true }).eq('element_id', elementId).eq('emoji', emoji);
    if (countError) throw new Error(countError.message);
    return json({ ok: true, emoji, count: count ?? 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, error instanceof HttpError ? error.status : 500);
  }
});
