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
    const cursor = body.cursor && typeof body.cursor === 'object' ? body.cursor as {
      occurredAt?: string;
      sortTiebreak?: number;
      id?: string;
    } : undefined;

    let query = db
      .from('reader_timeline_data')
      .select('*')
      .order('occurred_at', { ascending: true })
      .order('sort_tiebreak', { ascending: true })
      .order('element_id', { ascending: true })
      .limit(PAGE_SIZE + 1);

    if (cursor?.occurredAt && typeof cursor.sortTiebreak === 'number' && cursor.id) {
      query = query.or(
        `occurred_at.gt.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},sort_tiebreak.gt.${cursor.sortTiebreak}),and(occurred_at.eq.${cursor.occurredAt},sort_tiebreak.eq.${cursor.sortTiebreak},element_id.gt.${cursor.id})`,
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
        occurredAt: last.occurred_at,
        sortTiebreak: last.sort_tiebreak,
        id: last.element_id,
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, error instanceof HttpError ? error.status : 500);
  }
});
