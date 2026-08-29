declare const Deno: { serve: (h: (r: Request) => Response | Promise<Response>) => void; env: { get: (k: string) => string | undefined } };
import { corsHeaders } from '../_shared/cors.ts';
import { serviceClient, assertAdmin, HttpError } from '../_shared/db.ts';
import { fallback } from '../../../server/ai/fallback.ts';
import { systemPrompt } from '../../../server/ai/prompt.ts';
import { PROMPT_VERSION, type AiResult, type Mood, type SuggestedStyle } from '../../../server/ai/types.ts';

async function hash(v: string) {
  const b = new TextEncoder().encode(v);
  const d = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const moods = new Set<Mood>([
  'normal', 'romantic', 'sad', 'funny', 'deep', 'night', 'memory', 'important', 'hopeful', 'neutral',
]);
const zones = new Set(['default', 'night', 'burgundy', 'pixel', 'gif', 'travel', 'winter', 'sepia', 'rain', 'romantic']);

function validStyle(value: unknown): value is SuggestedStyle {
  if (!value || typeof value !== 'object') return false;
  const x = value as Record<string, unknown>;
  return typeof x.frame === 'string'
    && typeof x.background === 'string'
    && Array.isArray(x.decoration)
    && x.decoration.every((v) => typeof v === 'string')
    && typeof x.animation === 'string'
    && typeof x.zone === 'string'
    && zones.has(x.zone);
}

function conservativeDisplayText(original: string, candidate: string): string {
  const normalize = (value: string) => value.toLowerCase().replace(/[\s\p{P}]+/gu, '');
  const source = normalize(original);
  const proposed = normalize(candidate);
  // A polish may add/remove punctuation or whitespace, but it must not replace
  // the lexical content. If the model changed the underlying characters, keep
  // the exact original instead of trusting the model.
  return source === proposed ? candidate.trim() : original;
}

function validAiResult(value: unknown, model: string): AiResult | null {
  if (!value || typeof value !== 'object') return null;
  const x = value as Record<string, unknown>;
  if (typeof x.display_text !== 'string' || !x.display_text.trim()) return null;
  if (typeof x.mood !== 'string' || !moods.has(x.mood as Mood)) return null;
  if (!validStyle(x.suggested_style)) return null;
  const importance = Number(x.importance ?? 0);
  if (!Number.isInteger(importance) || importance < 0 || importance > 5) return null;
  return {
    displayText: x.display_text,
    mood: x.mood as Mood,
    importance,
    suggestedStyle: x.suggested_style,
    model,
    promptVersion: PROMPT_VERSION,
  };
}

async function callAi(text: string, originalModel: string): Promise<AiResult> {
  const apiKey = Deno.env.get('AI_API_KEY');
  const endpoint = Deno.env.get('AI_API_URL');
  const model = Deno.env.get('AI_MODEL') ?? originalModel;
  if (!apiKey || !endpoint) return fallback(text);

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) return fallback(text);
  const payload: any = await resp.json();
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? '{}');
  } catch {
    return fallback(text);
  }
  const result = validAiResult(parsed, model);
  if (!result) return fallback(text);
  result.displayText = conservativeDisplayText(text, result.displayText);
  return result;
}

async function main(req: Request) {
  await assertAdmin(req);
  const db = serviceClient();
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === 'string' ? body.action : 'process';

  if (action === 'apply_style' || action === 'apply_suggestion' || action === 'clear_applied') {
    const messageId = typeof body.messageId === 'string' ? body.messageId : '';
    if (!messageId) throw new HttpError(400, 'messageId обязателен.');

    const { data: meta, error: metaError } = await db
      .from('ai_metadata')
      .select('id,suggested_style,applied_style')
      .eq('message_id', messageId)
      .single();
    if (metaError || !meta) throw new HttpError(404, 'AI-результат для сообщения не найден.');

    let applied: unknown = null;
    if (action === 'apply_suggestion') applied = meta.suggested_style ?? {};
    if (action === 'apply_style') {
      if (!validStyle(body.style)) throw new HttpError(400, 'Некорректный стиль.');
      applied = body.style;
    }

    const { error } = await db.from('ai_metadata').update({ applied_style: applied }).eq('id', meta.id);
    if (error) throw new Error(error.message);
    return json({ ok: true, appliedStyle: applied });
  }

  const ids: string[] = Array.isArray(body.messageIds)
    ? body.messageIds.filter((x: unknown): x is string => typeof x === 'string').slice(0, 500)
    : [];
  const force = Boolean(body.force);
  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500);

  let q = db
    .from('messages')
    .select('id,original_text')
    .eq('is_system_message', false)
    .not('original_text', 'is', null)
    .order('sent_at', { ascending: true })
    .limit(limit);
  if (ids.length) q = q.in('id', ids);

  const { data: msgs, error: messageError } = await q;
  if (messageError) throw new Error(messageError.message);

  let processed = 0;
  let cached = 0;
  let failed = 0;
  let fallbackCount = 0;
  const configuredModel = Deno.env.get('AI_MODEL') ?? 'gpt-4.1-mini';

  for (const m of msgs ?? []) {
    try {
      const original = m.original_text ?? '';
      const sourceHash = await hash(original);
      const { data: old } = await db
        .from('ai_metadata')
        .select('id,source_hash,model,prompt_version')
        .eq('message_id', m.id)
        .maybeSingle();

      if (!force && old?.source_hash === sourceHash && old.prompt_version === PROMPT_VERSION) {
        cached++;
        continue;
      }

      const result = await callAi(original, configuredModel);
      if (result.model === 'local-fallback') fallbackCount++;

      const { error: messageUpdateError } = await db
        .from('messages')
        .update({ display_text: result.displayText })
        .eq('id', m.id);
      if (messageUpdateError) throw new Error(messageUpdateError.message);

      const { error: aiError } = await db.from('ai_metadata').upsert({
        message_id: m.id,
        mood: result.mood,
        importance: result.importance,
        suggested_style: result.suggestedStyle,
        model: result.model,
        prompt_version: PROMPT_VERSION,
        source_hash: sourceHash,
        status: 'completed',
        error_message: null,
        processed_at: new Date().toISOString(),
      }, { onConflict: 'message_id' });
      if (aiError) throw new Error(aiError.message);
      processed++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      await db.from('ai_metadata').upsert({
        message_id: m.id,
        status: 'failed',
        error_message: message,
        prompt_version: PROMPT_VERSION,
        model: configuredModel,
        processed_at: new Date().toISOString(),
      }, { onConflict: 'message_id' });
    }
  }

  return json({ processed, cached, failed, fallbackCount, promptVersion: PROMPT_VERSION });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    return await main(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, error instanceof HttpError ? error.status : 500);
  }
});
