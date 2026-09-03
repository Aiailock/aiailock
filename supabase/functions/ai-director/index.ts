declare const Deno: { serve: (handler: (request: Request) => Response | Promise<Response>) => void };

import { corsHeaders } from '../_shared/cors.ts';
import { assertAdmin, HttpError } from '../_shared/db.ts';

const DEFAULT_MODEL = 'openrouter/free';
const ALLOWED_MODELS = new Set([DEFAULT_MODEL]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Используй POST.');
    await assertAdmin(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const model = typeof body.model === 'string' ? body.model : DEFAULT_MODEL;
    if (apiKey.length < 20 || apiKey.length > 300) throw new HttpError(400, 'Вставь корректный ключ OpenRouter.');
    if (!prompt || prompt.length > 140_000) throw new HttpError(400, 'Контекст пустой или слишком большой.');
    if (!ALLOWED_MODELS.has(model)) throw new HttpError(400, 'Разрешён только бесплатный маршрутизатор OpenRouter.');

    const origin = request.headers.get('origin');
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(origin?.startsWith('https://') ? { 'HTTP-Referer': origin } : {}),
        'X-OpenRouter-Title': 'AIAILock Story Director',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Ты бережный редактор личной истории. Отвечай только валидным JSON-массивом без markdown.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.35,
        top_p: 0.85,
        max_tokens: 2600,
      }),
    });

    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const nested = payload.error && typeof payload.error === 'object' ? payload.error as Record<string, unknown> : {};
      const remoteMessage = typeof nested.message === 'string' ? nested.message : '';
      const hint = response.status === 429
        ? 'Бесплатный лимит временно исчерпан. Подожди немного и запусти снова.'
        : response.status === 401 || response.status === 403
          ? 'OpenRouter отклонил ключ. Создай новый бесплатный ключ и вставь его снова.'
          : remoteMessage || 'OpenRouter не смог обработать запрос.';
      throw new HttpError(response.status >= 400 && response.status < 500 ? response.status : 502, hint);
    }
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {};
    const message = first.message && typeof first.message === 'object' ? first.message as Record<string, unknown> : {};
    const content = contentText(message.content) || contentText(message.reasoning);
    if (!content.trim()) throw new HttpError(502, 'Бесплатная модель вернула пустой ответ. Запусти ещё раз: бесплатный маршрутизатор выберет другую модель.');
    return json({ content, model: typeof payload.model === 'string' ? payload.model : model });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, error instanceof HttpError ? error.status : 500);
  }
});
