import { corsHeaders } from '../_shared/cors.ts';
import { serviceClient, assertAdmin, HttpError } from '../_shared/db.ts';
import { issueReaderToken } from '../_shared/readerToken.ts';

declare const Deno: { serve: (handler: (req: Request) => Response | Promise<Response>) => void };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const db = serviceClient();
    const body = await req.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    const preview = body.preview === true;
    if (preview) await assertAdmin(req);

    const { data: settings, error } = await db
      .from('history_settings')
      .select('reader_requires_password')
      .eq('id', true)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (!settings) return json({ token: await issueReaderToken(), expiresIn: 60 * 60 * 24 * 30 });

    if (settings.reader_requires_password) {
      const { data: valid, error: verifyError } = await db.rpc('verify_reader_password', { p_password: password });
      if (verifyError) throw new Error(verifyError.message);
      if (valid !== true) throw new HttpError(401, 'Неверный пароль.');
    }

    return json({ token: await issueReaderToken(), expiresIn: 60 * 60 * 24 * 30 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, error instanceof HttpError ? error.status : 500);
  }
});
