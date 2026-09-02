export type DirectorMode = 'careful' | 'balanced' | 'cinematic';
export type DirectorSuggestionType = 'pause' | 'chapter' | 'quote' | 'gif' | 'image' | 'video' | 'music' | 'link';

export interface StoryContextRow {
  element_id: string;
  type: string;
  occurred_at: string;
  display_order: number;
  mood: string | null;
  importance: number;
  style: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  content_text: string | null;
  content_title: string | null;
  media_kind: string | null;
}

export interface CandidateGap {
  id: string;
  left: StoryContextRow;
  right: StoryContextRow;
  before: StoryContextRow[];
  after: StoryContextRow[];
  score: number;
  gapHours: number;
  textRun: number;
  nearbyMedia: number;
  signals: string[];
}

export interface GeneratedSuggestion {
  gapId: string;
  type: DirectorSuggestionType | 'none';
  title?: string;
  body?: string;
  assetQuery?: string;
  reason?: string;
  confidence?: number;
}

const MEDIA_TYPES = new Set(['photo', 'video', 'audio', 'gif', 'sticker', 'screenshot']);
const FLOW_BREAKS = new Set(['chapter', 'quote', 'pause', 'year_break', 'on_this_day', 'milestone', 'link']);
const TEXT_TYPES = new Set(['message', 'memory', 'special', 'interactive']);

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function textLen(row: StoryContextRow) { return (row.content_text ?? '').trim().length; }
function hasMedia(row: StoryContextRow) { return MEDIA_TYPES.has(row.type) || Boolean(row.media_kind); }
function hoursBetween(a: string, b: string) { return Math.max(0, (Date.parse(b) - Date.parse(a)) / 3_600_000); }

export function selectCandidateGaps(rows: StoryContextRow[], mode: DirectorMode): CandidateGap[] {
  const threshold = mode === 'careful' ? 4 : mode === 'balanced' ? 3 : 2;
  const maxCount = mode === 'careful' ? 24 : mode === 'balanced' ? 40 : 60;
  const candidates: CandidateGap[] = [];

  for (let i = 0; i < rows.length - 1; i += 1) {
    const left = rows[i];
    const right = rows[i + 1];
    const before = rows.slice(Math.max(0, i - 4), i + 1);
    const after = rows.slice(i + 1, Math.min(rows.length, i + 6));
    const local = rows.slice(Math.max(0, i - 3), Math.min(rows.length, i + 5));
    const gapHours = hoursBetween(left.occurred_at, right.occurred_at);
    const nearbyMedia = local.filter(hasMedia).length;
    const textRun = local.filter((row) => TEXT_TYPES.has(row.type) && textLen(row) > 0).length;
    const signals: string[] = [];
    let score = 0;

    if (gapHours >= 24 * 14) { score += 4; signals.push(`временной разрыв ${Math.round(gapHours / 24)} дн.`); }
    else if (gapHours >= 24 * 4) { score += 2; signals.push(`пауза ${Math.round(gapHours / 24)} дн.`); }
    else if (gapHours >= 18) { score += 1; signals.push('смена дня'); }

    if (textRun >= 6 && nearbyMedia === 0) { score += 4; signals.push('много текста без визуальной паузы'); }
    else if (textRun >= 5 && nearbyMedia <= 1) { score += 2; signals.push('длинная текстовая серия'); }

    if (textLen(left) > 420 || textLen(right) > 420) { score += 2; signals.push('рядом длинный текст'); }
    if (left.mood && right.mood && left.mood !== right.mood) { score += 1; signals.push(`смена настроения ${left.mood} → ${right.mood}`); }
    if ((left.importance ?? 0) >= 4 || (right.importance ?? 0) >= 4) { score += 1; signals.push('рядом важный момент'); }

    if (FLOW_BREAKS.has(left.type) || FLOW_BREAKS.has(right.type)) score -= 5;
    if (hasMedia(left) || hasMedia(right)) score -= 2;
    if (nearbyMedia >= 3) score -= 4;
    if (left.type === right.type && MEDIA_TYPES.has(left.type)) score -= 3;

    if (score >= threshold) {
      candidates.push({
        id: `${left.element_id}:${right.element_id}`,
        left, right, before, after, score, gapHours, textRun, nearbyMedia, signals,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.left.display_order - b.left.display_order);
  const chosen: CandidateGap[] = [];
  for (const candidate of candidates) {
    const nearExisting = chosen.some((item) => Math.abs(item.left.display_order - candidate.left.display_order) < (mode === 'careful' ? 3 : 1));
    if (!nearExisting || mode === 'cinematic') chosen.push(candidate);
    if (chosen.length >= maxCount) break;
  }
  return chosen.sort((a, b) => a.left.display_order - b.left.display_order);
}

function clean(value: string | null | undefined, max = 520) {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function rowForPrompt(row: StoryContextRow) {
  return {
    id: row.element_id,
    type: row.type,
    at: row.occurred_at,
    mood: row.mood,
    importance: row.importance,
    title: clean(row.content_title, 120),
    text: clean(row.content_text),
    media: row.media_kind,
  };
}

export function buildDirectorPrompt(gaps: CandidateGap[], mode: DirectorMode): string {
  const density = mode === 'careful'
    ? 'Очень сдержанно: лучше NONE, чем лишняя вставка. Не перегружай историю.'
    : mode === 'balanced'
      ? 'Умеренно: предлагай только заметно улучшающие ритм вставки.'
      : 'Кинематографично, но без спама и повторов.';

  const payload = gaps.map((gap) => ({
    gapId: gap.id,
    signals: gap.signals,
    before: gap.before.map(rowForPrompt),
    after: gap.after.map(rowForPrompt),
  }));

  return `Ты — редактор уже ГОТОВОЙ личной истории отношений. История уже содержит музыку, GIF, фото, видео, главы и другие сцены.\n
Твоя задача: только аккуратно ДОПОЛНИТЬ слабые переходы. Ничего из существующего не переписывай, не удаляй и не выдумывай факты или чувства.\n
${density}\n
Разрешённые типы: pause, chapter, quote, gif, image, video, music, link, none.\n
Правила:\n
- Если рядом уже есть музыка/GIF/фото/глава — чаще выбирай none.\n
- pause: короткая тихая фраза или пустая пауза.\n
- chapter: только если реально начинается новый период/тема; title 2–6 слов.\n
- quote: только если фраза прямо следует из контекста; не придумывай признания.\n
- gif/image/video/music: не придумывай URL. В assetQuery дай поисковую фразу, подходящую по атмосфере.\n
- music: assetQuery = исполнитель/трек, если уверенно подходит, иначе настроение для поиска.\n
- none: когда вставка не нужна.\n
- body максимум 180 символов.\n
- reason коротко объясняет пользу.\n
Верни ТОЛЬКО JSON-массив без markdown. Для каждого gapId ровно один объект:\n
[{"gapId":"...","type":"none|pause|chapter|quote|gif|image|video|music|link","title":"","body":"","assetQuery":"","reason":"","confidence":0.0}]\n
Контекст:\n${JSON.stringify(payload)}`;
}

export function parseDirectorResponse(raw: string): GeneratedSuggestion[] {
  const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const start = withoutThinking.indexOf('[');
  const end = withoutThinking.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(withoutThinking.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      gapId: String(item?.gapId ?? ''),
      type: String(item?.type ?? 'none') as GeneratedSuggestion['type'],
      title: clean(String(item?.title ?? ''), 160),
      body: clean(String(item?.body ?? ''), 240),
      assetQuery: clean(String(item?.assetQuery ?? ''), 180),
      reason: clean(String(item?.reason ?? ''), 240),
      confidence: clamp(Number(item?.confidence ?? .5), 0, 1),
    })).filter((item) => item.gapId && ['none','pause','chapter','quote','gif','image','video','music','link'].includes(item.type));
  } catch {
    return [];
  }
}

export function fallbackSuggestions(gaps: CandidateGap[]): GeneratedSuggestion[] {
  return gaps.map((gap) => {
    if (gap.gapHours >= 24 * 14) {
      return { gapId: gap.id, type: 'chapter', title: 'Новая глава', body: '', reason: 'Большой временной переход — можно отделить следующий период.', confidence: .55 };
    }
    return { gapId: gap.id, type: 'pause', title: '', body: '', reason: gap.signals.join(' · '), confidence: .45 };
  });
}

export function occurredAtForGap(gap: CandidateGap): string {
  // Keep a real date: use the left neighbour's timestamp. display_order decides placement.
  return gap.left.occurred_at;
}
