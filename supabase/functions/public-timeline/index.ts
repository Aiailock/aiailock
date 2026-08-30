import { corsHeaders } from '../_shared/cors.ts';
import { serviceClient, HttpError } from '../_shared/db.ts';
import { verifyReaderToken } from '../_shared/readerToken.ts';

declare const Deno: { serve: (handler: (req: Request) => Response | Promise<Response>) => void };

const PAGE_SIZE = 45;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function requireReaderAccess(req: Request, db: ReturnType<typeof serviceClient>): Promise<void> {
  const { data: settings, error } = await db
    .from('history_settings')
    .select('reader_requires_password')
    .eq('id', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!settings) return;
  if (!settings.reader_requires_password) return;
  const token = req.headers.get('x-reader-access-token');
  if (!(await verifyReaderToken(token))) throw new HttpError(401, 'Требуется доступ к истории.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const db = serviceClient();
    await requireReaderAccess(req, db);

    const body = await req.json().catch(() => ({}));
    const resumeElementId = typeof body.resumeElementId === 'string' && /^[0-9a-f-]{36}$/i.test(body.resumeElementId)
      ? body.resumeElementId
      : null;
    const cursor = body.cursor && typeof body.cursor === 'object' ? body.cursor as {
      displayOrder?: number;
      id?: string;
    } : undefined;

    let query = db
      .from('reader_timeline_data')
      .select('*')
      .order('display_order', { ascending: true })
      .order('element_id', { ascending: true })
      .limit(PAGE_SIZE + 1);

    if (resumeElementId) {
      const { data: target, error: targetError } = await db
        .from('reader_timeline_data')
        .select('display_order,element_id')
        .eq('element_id', resumeElementId)
        .maybeSingle();
      if (targetError) throw new Error(targetError.message);
      if (!target) throw new HttpError(404, 'Сохранённое место больше недоступно. Начни чтение с текущей версии истории.');
      if (typeof target?.display_order === 'number') query = query.or(
        `display_order.gt.${target.display_order},and(display_order.eq.${target.display_order},element_id.gte.${target.element_id})`,
      );
    } else if (typeof cursor?.displayOrder === 'number' && cursor.id) {
      query = query.or(
        `display_order.gt.${cursor.displayOrder},and(display_order.eq.${cursor.displayOrder},element_id.gt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    const last = page[page.length - 1];

    return json({
      elements: page,
      hasMore,
      nextCursor: last ? {
        displayOrder: last.display_order,
        occurredAt: last.occurred_at,
        sortTiebreak: last.sort_tiebreak,
        id: last.element_id,
      } : null,
      resumedFrom: resumeElementId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, error instanceof HttpError ? error.status : 500);
  }
});
