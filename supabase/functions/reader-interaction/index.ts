declare const Deno: { serve: (handler: (request: Request) => Response | Promise<Response>) => void };

import { corsHeaders } from '../_shared/cors.ts';
import { HttpError, serviceClient } from '../_shared/db.ts';
import { verifyReaderToken } from '../_shared/readerToken.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!(await verifyReaderToken(request.headers.get('x-reader-access-token')))) {
      throw new HttpError(401, 'Ссылка на историю устарела. Обнови страницу.');
    }
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const visitorId = typeof body.visitorId === 'string' && UUID_RE.test(body.visitorId) ? body.visitorId : null;
    const elementId = typeof body.elementId === 'string' && UUID_RE.test(body.elementId) ? body.elementId : null;
    const answerIndex = Number(body.answerIndex);
    if (!visitorId || !elementId || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
      throw new HttpError(400, 'Некорректный ответ.');
    }

    const db = serviceClient();
    const { data: row, error: rowError } = await db
      .from('reader_timeline_data')
      .select('element_id,type,metadata')
      .eq('element_id', elementId)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row || row.type !== 'interactive') throw new HttpError(404, 'Вопрос не найден.');
    const options = Array.isArray(row.metadata?.options) ? row.metadata.options.map(String).slice(0, 4) : [];
    const answerValue = options[answerIndex]?.trim();
    if (!answerValue) throw new HttpError(400, 'Такого варианта ответа нет.');

    const now = new Date().toISOString();
    const { error } = await db.from('reader_interaction_answers').upsert({
      visitor_id: visitorId,
      element_id: elementId,
      answer_index: answerIndex,
      answer_value: answerValue.slice(0, 180),
      updated_at: now,
    }, { onConflict: 'visitor_id,element_id' });
    if (error) throw new Error(error.message);
    return json({ ok: true, answerIndex, answerValue });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, error instanceof HttpError ? error.status : 500);
  }
});
