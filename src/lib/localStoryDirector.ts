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
  variant?: 'tender' | 'visual' | 'memory' | 'cinematic';
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

function excerptForGap(gap: CandidateGap): string {
  const candidates = [...gap.before, ...gap.after]
    .map((row) => clean(row.content_text, 150))
    .filter((text) => text.length >= 18 && text.length <= 150)
    .sort((a, b) => b.length - a.length);
  return candidates[0] ?? '';
}

function moodSearchForGap(gap: CandidateGap): string {
  const mood = `${gap.left.mood ?? ''} ${gap.right.mood ?? ''}`.toLowerCase();
  const text = `${gap.left.content_text ?? ''} ${gap.right.content_text ?? ''}`.toLowerCase();
  if (/смеш|funny|хаха|ахах|😂|прикол/.test(`${mood} ${text}`)) return 'cute funny love reaction animated gif';
  if (/груст|sad|слез|скуч|обид|прости|боле/.test(`${mood} ${text}`)) return 'cute warm hug comfort heart animated gif';
  if (/ноч|night|сон|спи|доброй ночи|луна/.test(`${mood} ${text}`)) return 'cute good night love stars animated gif';
  if (/подар|birthday|день рождения|сюрприз|gift/.test(`${mood} ${text}`)) return 'cute love gift celebration animated gif';
  if (/important|deep|важн|сердц|люб/.test(`${mood} ${text}`)) return 'cute love heart couple animated gif';
  return 'cute romantic couple heart animated gif';
}

function tenderBody(gap: CandidateGap): string {
  if (gap.gapHours >= 24 * 14) return 'Здесь начинается ещё одна маленькая глава нашей истории.';
  if ((gap.left.importance ?? 0) >= 4 || (gap.right.importance ?? 0) >= 4) return 'Вот здесь хочется ненадолго остановиться и просто сохранить этот момент.';
  if (gap.textRun >= 6) return 'А между этими словами — ещё один маленький кусочек нас.';
  return 'Иногда самые тёплые вещи прячутся именно между обычными строками.';
}

function fallbackVariants(gap: CandidateGap, mode: DirectorMode, index: number): GeneratedSuggestion[] {
  const isLongGap = gap.gapHours >= 24 * 14;
  const excerpt = excerptForGap(gap);
  const reason = gap.signals.join(' · ') || 'Место подходит для мягкого эмоционального перехода.';
  const variants: GeneratedSuggestion[] = [
    {
      gapId: gap.id,
      type: isLongGap ? 'chapter' : 'pause',
      title: isLongGap ? 'Ещё одна глава о нас' : '',
      body: tenderBody(gap),
      reason: `${reason} Тихий романтичный переход.`,
      confidence: isLongGap ? .72 : .66,
      variant: 'tender',
    },
    {
      gapId: gap.id,
      type: 'gif',
      title: 'Маленькая живая эмоция',
      body: '',
      assetQuery: moodSearchForGap(gap),
      reason: `${reason} GIF даст улыбку и не потребует ещё одного длинного текста.`,
      confidence: gap.nearbyMedia === 0 ? .7 : .56,
      variant: 'visual',
    },
  ];

  if (excerpt) {
    variants.push({
      gapId: gap.id,
      type: 'quote',
      title: 'Та самая фраза',
      body: excerpt,
      reason: `${reason} Можно бережно выделить настоящую фразу из истории.`,
      confidence: .62,
      variant: 'memory',
    });
  } else if (mode === 'cinematic') {
    variants.push({
      gapId: gap.id,
      type: index % 2 === 0 ? 'image' : 'music',
      title: index % 2 === 0 ? 'Тёплый визуальный кадр' : 'Музыкальная пауза',
      body: '',
      assetQuery: index % 2 === 0 ? 'romantic warm lights couple' : 'tender romantic instrumental',
      reason: `${reason} Более кинематографичный вариант без выдумывания нового события.`,
      confidence: .54,
      variant: 'cinematic',
    });
  }

  return variants.slice(0, mode === 'careful' ? 2 : 3);
}

export function buildDirectorPrompt(gaps: CandidateGap[], mode: DirectorMode): string {
  const density = mode === 'careful'
    ? 'Очень бережно: предложи два разных варианта на точку, но не перегружай историю.'
    : mode === 'balanced'
      ? 'Умеренно: предложи три разных варианта на точку — текстовый, визуальный и основанный на реальной фразе.'
      : 'Кинематографично: предложи три заметно разных варианта, сохраняя правду исходной истории.';

  const payload = gaps.map((gap) => ({
    gapId: gap.id,
    signals: gap.signals,
    before: gap.before.map(rowForPrompt),
    after: gap.after.map(rowForPrompt),
  }));

  return `Ты — очень бережный режиссёр уже ГОТОВОЙ личной истории отношений. Её будет читать один дорогой автору человек. История уже содержит музыку, GIF, фото, видео, главы и другие сцены.\n
Твоя задача: сделать чтение нежным, искренним, местами трогательным до слёз — но только за счёт ритма, настоящих фраз и тёплого оформления. Ничего из существующего не переписывай, не удаляй и не выдумывай события, признания или чувства, которых нет в контексте.\n
${density}\n
Разрешённые типы: pause, chapter, quote, gif, image, video, music, link, none.\n
Правила:\n
- Для каждого gapId дай ${mode === 'careful' ? '2' : '3'} РАЗНЫХ варианта. Не повторяй один тип внутри одного gapId.\n
- Первый вариант tender: короткий тёплый переход. Второй visual: GIF/изображение/видео. Третий memory или cinematic: настоящая цитата, глава или музыка.\n
- Если рядом уже есть много медиа, visual может быть none. Если вставка навредит ритму, допустим none, но не заменяй им все варианты.\n
- pause: 1 короткая нежная фраза, уместная именно рядом с этим контекстом. Не используй пустую body.\n
- chapter: только если реально начинается новый период/тема; title 2–6 слов.\n
- quote: копируй или очень бережно сокращай реальную фразу из контекста; не придумывай признания.\n
- gif/image/video/music: не придумывай URL. В assetQuery дай короткую поисковую фразу НА АНГЛИЙСКОМ, подходящую по атмосфере. Для GIF добавь слова cute и animated gif.\n
- music: assetQuery = исполнитель/трек, если уверенно подходит, иначе настроение для поиска.\n
- none: когда вставка не нужна.\n
- body максимум 180 символов.\n
- reason коротко объясняет пользу.\n
- variant всегда tender, visual, memory или cinematic.\n
Верни ТОЛЬКО JSON-массив без markdown:\n
[{"gapId":"...","type":"none|pause|chapter|quote|gif|image|video|music|link","variant":"tender|visual|memory|cinematic","title":"","body":"","assetQuery":"","reason":"","confidence":0.0}]\n
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
      variant: ['tender','visual','memory','cinematic'].includes(String(item?.variant))
        ? String(item.variant) as GeneratedSuggestion['variant']
        : undefined,
    })).filter((item) => item.gapId && ['none','pause','chapter','quote','gif','image','video','music','link'].includes(item.type));
  } catch {
    return [];
  }
}

export function fallbackSuggestions(gaps: CandidateGap[], mode: DirectorMode = 'balanced'): GeneratedSuggestion[] {
  return gaps.flatMap((gap, index) => fallbackVariants(gap, mode, index));
}

export function completeSuggestionSet(
  gaps: CandidateGap[],
  generated: GeneratedSuggestion[],
  mode: DirectorMode,
): GeneratedSuggestion[] {
  const allowed = new Set(gaps.map((gap) => gap.id));
  const targetCount = mode === 'careful' ? 2 : 3;
  return gaps.flatMap((gap, gapIndex) => {
    const seenTypes = new Set<string>();
    const received = generated
      .filter((item) => item.gapId === gap.id && item.type !== 'none' && allowed.has(item.gapId))
      .filter((item) => {
        if (seenTypes.has(item.type)) return false;
        seenTypes.add(item.type);
        return true;
      })
      .slice(0, targetCount);
    if (received.length >= targetCount) return received;
    const fillers = fallbackVariants(gap, mode, gapIndex).filter((item) => !seenTypes.has(item.type));
    return [...received, ...fillers].slice(0, targetCount);
  });
}

export function occurredAtForGap(gap: CandidateGap): string {
  // Keep a real date: use the left neighbour's timestamp. display_order decides placement.
  return gap.left.occurred_at;
}
