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

function normalizedLetters(value: string): string {
  return value.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, '');
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function conservativeDisplayText(original: string, candidate: string): string {
  const trimmed = candidate.trim();
  if (!trimmed) return original;
  const source = normalizedLetters(original);
  const proposed = normalizedLetters(trimmed);
  if (source === proposed) return trimmed;

  // Allow small spelling fixes, but reject rewrites. The old equality-only
  // check contradicted the prompt: even one corrected typo caused the whole AI
  // result to be silently replaced with the original text.
  const longest = Math.max(source.length, proposed.length, 1);
  const lengthDelta = Math.abs(source.length - proposed.length) / longest;
  const distanceRatio = editDistance(source, proposed) / longest;
  const sourceWords = original.trim().split(/\s+/).filter(Boolean).length;
  const proposedWords = trimmed.split(/\s+/).filter(Boolean).length;
  const wordDelta = Math.abs(sourceWords - proposedWords);
  const allowedWordDelta = Math.max(1, Math.ceil(sourceWords * 0.08));
  return lengthDelta <= 0.08 && distanceRatio <= 0.12 && wordDelta <= allowedWordDelta
    ? trimmed
    : original;
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((part) => {
    if (!part || typeof part !== 'object') return '';
    const block = part as Record<string, unknown>;
    return typeof block.text === 'string' ? block.text : typeof block.content === 'string' ? block.content : '';
  }).join('');
}

function parseJsonObject(raw: string): unknown {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

function validAiResult(value: unknown, model: string, original: string): AiResult | null {
  if (!value || typeof value !== 'object') return null;
  const x = value as Record<string, unknown>;
  const base = fallback(original);
  const candidate = typeof x.display_text === 'string' && x.display_text.trim()
    ? x.display_text
    : original;
  const importanceValue = Number(x.importance);
  const importance = Number.isInteger(importanceValue) && importanceValue >= 0 && importanceValue <= 5
    ? importanceValue
    : base.importance;
  return {
    displayText: conservativeDisplayText(original, candidate),
    mood: typeof x.mood === 'string' && moods.has(x.mood as Mood) ? x.mood as Mood : base.mood,
    importance,
    suggestedStyle: validStyle(x.suggested_style) ? x.suggested_style : base.suggestedStyle,
    model,
    promptVersion: PROMPT_VERSION,
  };
}

async function callAi(text: string, originalModel: string, temporaryApiKey = ''): Promise<AiResult> {
  const configuredKey = Deno.env.get('AI_API_KEY') ?? '';
  const configuredEndpoint = Deno.env.get('AI_API_URL') ?? '';
  const useTemporaryKey = temporaryApiKey.length >= 20;
  const apiKey = useTemporaryKey ? temporaryApiKey : configuredKey;
  const endpoint = useTemporaryKey ? 'https://openrouter.ai/api/v1/chat/completions' : configuredEndpoint;
  const model = useTemporaryKey ? 'openrouter/free' : (Deno.env.get('AI_MODEL') ?? originalModel);
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
      // Some OpenRouter free models reject response_format even though they can
      // follow a strict JSON instruction. The parser below safely extracts the
      // first object from plain text or fenced JSON.
      ...(useTemporaryKey ? {} : { response_format: { type: 'json_object' } }),
    }),
  });
  if (!resp.ok) return fallback(text);
  const payload = await resp.json().catch(() => ({})) as Record<string, unknown>;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {};
  const message = first.message && typeof first.message === 'object' ? first.message as Record<string, unknown> : {};
  const parsed = parseJsonObject(contentText(message.content));
  const result = validAiResult(parsed, model, text);
  if (!result) return fallback(text);
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
  const temporaryApiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (temporaryApiKey && (temporaryApiKey.length < 20 || temporaryApiKey.length > 300)) {
    throw new HttpError(400, 'Вставь корректный ключ OpenRouter или оставь поле пустым.');
  }

  type MessageCandidate = {
    id: string;
    original_text: string | null;
    ai_metadata?: { source_hash?: string | null; prompt_version?: string | null } | Array<{ source_hash?: string | null; prompt_version?: string | null }> | null;
  };
  const msgs: MessageCandidate[] = [];
  if (ids.length) {
    const { data, error } = await db.from('messages')
      .select('id,original_text,ai_metadata(source_hash,prompt_version)')
      .in('id', ids)
      .limit(limit);
    if (error) throw new Error(error.message);
    msgs.push(...((data ?? []) as MessageCandidate[]));
  } else {
    // Scan in pages until we have `limit` genuinely new/changed rows. The old
    // query limited first and checked cache afterwards, so after the oldest 100
    // were cached every later click processed zero forever.
    for (let from = 0; msgs.length < limit; from += 500) {
      const { data, error } = await db.from('messages')
        .select('id,original_text,ai_metadata(source_hash,prompt_version)')
        .eq('is_system_message', false)
        .not('original_text', 'is', null)
        .order('sent_at', { ascending: true })
        .range(from, from + 499);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as MessageCandidate[];
      for (const message of page) {
        const original = message.original_text ?? '';
        const sourceHash = await hash(original);
        const relation = Array.isArray(message.ai_metadata) ? message.ai_metadata[0] : message.ai_metadata;
        if (force || relation?.source_hash !== sourceHash || relation?.prompt_version !== PROMPT_VERSION) msgs.push(message);
        if (msgs.length >= limit) break;
      }
      if (page.length < 500) break;
    }
  }

  let processed = 0;
  let cached = 0;
  let failed = 0;
  let fallbackCount = 0;
  let changed = 0;
  let unchanged = 0;
  const configuredModel = Deno.env.get('AI_MODEL') ?? 'gpt-4.1-mini';

  for (const m of msgs ?? []) {
    try {
      const original = m.original_text ?? '';
      const sourceHash = await hash(original);
      const relation = Array.isArray(m.ai_metadata) ? m.ai_metadata[0] : m.ai_metadata;
      if (!force && relation?.source_hash === sourceHash && relation?.prompt_version === PROMPT_VERSION) {
        cached++;
        continue;
      }

      const result = await callAi(original, configuredModel, temporaryApiKey);
      if (result.model === 'local-fallback') fallbackCount++;
      if (result.displayText.trim() === original.trim()) unchanged++; else changed++;

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

  return json({ processed, changed, unchanged, cached, failed, fallbackCount, promptVersion: PROMPT_VERSION });
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
