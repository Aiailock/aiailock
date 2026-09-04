import { corsHeaders } from '../_shared/cors.ts';
import { serviceClient, assertAdmin, HttpError } from '../_shared/db.ts';
import { verifyReaderToken } from '../_shared/readerToken.ts';

declare const Deno: { serve: (handler: (req: Request) => Response | Promise<Response>) => void };

const PAGE_SIZE = 45;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const resumeElementId = typeof body.resumeElementId === 'string' && UUID_RE.test(body.resumeElementId)
      ? body.resumeElementId
      : null;
    const previewBatchId = typeof body.previewBatchId === 'string' && UUID_RE.test(body.previewBatchId)
      ? body.previewBatchId
      : null;
    const adminPreview = body.adminPreview === true;
    if (previewBatchId || adminPreview) await assertAdmin(req);

    const cursor = body.cursor && typeof body.cursor === 'object' ? body.cursor as {
      displayOrder?: number;
      id?: string;
    } : undefined;

    const table = previewBatchId || adminPreview ? 'reader_timeline_preview_data' : 'reader_timeline_data';
    let query = db
      .from(table)
      .select('*')
      .order('display_order', { ascending: true })
      .order('element_id', { ascending: true })
      .limit(PAGE_SIZE + 1);

    if (previewBatchId) {
      // Publicly visible rows + hidden rows staged by exactly this AI batch.
      query = query.or(`is_reader_visible.eq.true,ai_batch_id.eq.${previewBatchId}`);
    }

    if (resumeElementId) {
      let targetQuery = db
        .from(table)
        .select('display_order,element_id')
        .eq('element_id', resumeElementId);
      if (previewBatchId) targetQuery = targetQuery.or(`is_reader_visible.eq.true,ai_batch_id.eq.${previewBatchId}`);
      const { data: target, error: targetError } = await targetQuery.maybeSingle();
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

    // The story itself is paginated, but the journey map must know every
    // chapter immediately. Fetch only tiny chapter summaries plus the exact
    // total, instead of forcing the reader to download the whole book first.
    const chapterQuery = db
      .from('reader_journey_chapters')
      .select('element_id,display_order,story_position,title')
      .order('story_position', { ascending: true });
    let totalQuery = db.from(table).select('element_id', { count: 'exact', head: true });
    if (previewBatchId) {
      totalQuery = totalQuery.or(`is_reader_visible.eq.true,ai_batch_id.eq.${previewBatchId}`);
    }
    const [chapterResult, totalResult] = await Promise.all([chapterQuery, totalQuery]);
    if (chapterResult.error) throw new Error(chapterResult.error.message);
    if (totalResult.error) throw new Error(totalResult.error.message);
    const chapters = (chapterResult.data ?? []).map((chapter: Record<string, unknown>) => ({
      elementId: chapter.element_id,
      displayOrder: chapter.display_order,
      storyPosition: chapter.story_position,
      title: typeof chapter.title === 'string' && chapter.title ? chapter.title : 'Новая глава',
    }));

    // The preview view has two helper columns that are not part of PublicTimelineRow.
    const rows = (data ?? []).map((row: Record<string, unknown>) => {
      if (!previewBatchId && !adminPreview) return row;
      const { ai_batch_id: _batch, is_reader_visible: _visible, ...publicRow } = row;
      return publicRow;
    });
    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE);
    const last = page[page.length - 1] as Record<string, unknown> | undefined;
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
      previewBatchId,
      adminPreview,
      chapters,
      total: totalResult.count ?? rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, error instanceof HttpError ? error.status : 500);
  }
});
