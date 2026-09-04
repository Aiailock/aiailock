import { useState } from 'react';
import { Mic2, Music2, Play, RotateCcw, Sparkles, WandSparkles } from 'lucide-react';
import { Frame, bgByZone } from '@/components/reader/StoryElement';
import EffectsLayer from '@/components/reader/EffectsLayer';
import DateStamp from '@/components/reader/DateStamp';
import { ALIGN_OPTIONS, ANIMATION_OPTIONS, DATE_STYLE_OPTIONS, DECORATION_OPTIONS, FONT_OPTIONS, FRAME_OPTIONS, SPACING_OPTIONS, ZONE_OPTIONS } from '@/lib/styleOptions';
import { TIME_FORMAT_OPTIONS } from '@/lib/readerSettingsContext';
import { safeRemoteUrl } from '@/lib/safeUrl';
import { recommendedStyleForText } from '@/lib/nextSceneAdvisor';

export interface StyleValue {
  frame?: string;
  zone?: string;
  decoration?: string[];
  font?: string;
  gifUrl?: string;
  // Переопределяет глобальный формат даты/времени (Admin → Настройки) только
  // для этого элемента истории. Пусто/отсутствует — берётся общий формат.
  timeFormat?: string;
  dateStyle?: string;
  dateAlign?: string;
  dateFont?: string;
  hideTime?: boolean;
  textAlign?: string;
  spacing?: string;
  animation?: string;
  backgroundImageUrl?: string;
  backgroundPosition?: string;
  backgroundOverlay?: number;
  externalMediaUrl?: string;
  externalMediaKind?: string;
  audioPlayerStyle?: string;
  [key: string]: unknown;
}

export const AUDIO_PLAYER_STYLE_OPTIONS = [
  { id: 'vinyl', label: 'Виниловая пластинка' },
  { id: 'voice', label: 'Голосовое как в WhatsApp' },
  { id: 'glass', label: 'Стеклянная карточка' },
  { id: 'cassette', label: 'Кассета воспоминаний' },
  { id: 'minimal', label: 'Минималистичный плеер' },
] as const;

const QUICK_STYLE_PRESETS: Array<{ id: string; label: string; hint: string; style: StyleValue }> = [
  { id: 'diary', label: 'Дневник', hint: 'спокойно и лично', style: { zone: 'default', frame: 'minimal', font: 'literata', dateStyle: 'handwritten', dateFont: 'badscript', spacing: 'normal', animation: 'fade-up' } },
  { id: 'tender', label: 'Нежность', hint: 'лепестки и свет', style: { zone: 'romantic', frame: 'hearts', font: 'badscript', dateStyle: 'centered', dateAlign: 'center', textAlign: 'center', decoration: ['petals'], spacing: 'cinematic', animation: 'fade' } },
  { id: 'night', label: 'Ночь', hint: 'звёзды и глубина', style: { zone: 'night', frame: 'moonlit', font: 'badscript', dateStyle: 'capsule', decoration: ['stardust'], spacing: 'cinematic', animation: 'blur' } },
  { id: 'letter', label: 'Письмо', hint: 'бумага и чернила', style: { zone: 'sepia', frame: 'envelope', font: 'marck', dateStyle: 'handwritten', decoration: [], spacing: 'cinematic', animation: 'fade-up' } },
  { id: 'cinema', label: 'Кино', hint: 'контрастный кадр', style: { zone: 'burgundy', frame: 'film', font: 'yeseva', dateStyle: 'split', spacing: 'cinematic', animation: 'zoom' } },
  { id: 'party', label: 'Праздник', hint: 'ярко и живо', style: { zone: 'gif', frame: 'garland', font: 'comfort', dateStyle: 'ribbon', dateAlign: 'center', decoration: ['confetti'], spacing: 'cinematic', animation: 'zoom' } },
  { id: 'quiet', label: 'Тишина', hint: 'воздух и свечи', style: { zone: 'dusk', frame: 'minimal', font: 'literata', dateStyle: 'line', decoration: ['candles'], spacing: 'cinematic', animation: 'fade' } },
  { id: 'chat', label: 'Переписка', hint: 'как экран телефона', style: { zone: 'default', frame: 'phone', font: 'sans', dateStyle: 'capsule', spacing: 'compact', animation: 'slide-left' } },
];

const fontClassByOption: Record<string, string> = {
  serif: 'font-serif', script: 'font-script', sans: 'font-sans', pixel: 'font-pixel', mono: 'font-mono',
  literata: 'font-literata', yeseva: 'font-yeseva', comfort: 'font-comfort',
  badscript: 'font-badscript', marck: 'font-marck', pacifico: 'font-pacifico', neucha: 'font-neucha',
};

// Понятный на русском визуальный редактор JSON-поля `style` у элемента
// хроники: рамка, эффекты, фон-зона и шрифт — с превью один в один как в
// читалке (переиспользует те же компоненты Frame/EffectsLayer).
export default function StyleEditor({
  value,
  onChange,
  hasMedia = true,
  mediaKind = null,
  previewText = '',
  previewTitle = '',
}: {
  value: StyleValue;
  onChange: (next: StyleValue) => void;
  hasMedia?: boolean;
  mediaKind?: string | null;
  previewText?: string | null;
  previewTitle?: string | null;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [rawJson, setRawJson] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [rawError, setRawError] = useState('');
  const [beforeQuickStyle, setBeforeQuickStyle] = useState<StyleValue | null>(null);

  const frame = value.frame ?? 'minimal';
  const zone = value.zone ?? 'default';
  const font = value.font ?? '';
  const decoration = value.decoration ?? [];
  const gifUrl = value.gifUrl ?? '';
  const timeFormat = typeof value.timeFormat === 'string' ? value.timeFormat : '';
  const dateStyle = typeof value.dateStyle === 'string' ? value.dateStyle : 'line';
  const dateAlign = typeof value.dateAlign === 'string' ? value.dateAlign : 'left';
  const dateFont = typeof value.dateFont === 'string' ? value.dateFont : 'sans';
  const textAlign = typeof value.textAlign === 'string' ? value.textAlign : 'left';
  const spacing = typeof value.spacing === 'string' ? value.spacing : 'normal';
  const animation = typeof value.animation === 'string' ? value.animation : 'fade-up';
  const backgroundImageUrl = typeof value.backgroundImageUrl === 'string' ? value.backgroundImageUrl : '';
  const backgroundPosition = typeof value.backgroundPosition === 'string' ? value.backgroundPosition : 'center';
  const backgroundOverlay = typeof value.backgroundOverlay === 'number' ? value.backgroundOverlay : 46;
  const audioPlayerStyle = typeof value.audioPlayerStyle === 'string' ? value.audioPlayerStyle : mediaKind === 'audio' ? 'voice' : 'vinyl';
  const actualPreviewText = previewText?.trim() || '';
  const actualPreviewTitle = previewTitle?.trim() || '';

  function patch(next: Partial<StyleValue>) {
    const merged = { ...value, ...next };
    onChange(merged);
    setRawJson(JSON.stringify(merged, null, 2));
  }
  function applyQuickStyle(next: StyleValue) {
    setBeforeQuickStyle(value);
    const merged = { ...value, ...next };
    onChange(merged);
    setRawJson(JSON.stringify(merged, null, 2));
  }
  function restoreQuickStyle() {
    if (!beforeQuickStyle) return;
    onChange(beforeQuickStyle);
    setRawJson(JSON.stringify(beforeQuickStyle, null, 2));
    setBeforeQuickStyle(null);
  }
  function toggleDecoration(id: string) {
    const set = new Set(decoration);
    if (set.has(id)) set.delete(id); else set.add(id);
    patch({ decoration: Array.from(set) });
  }
  function applyRaw() {
    try { const parsed = JSON.parse(rawJson); onChange(parsed); setRawError(''); }
    catch { setRawError('Некорректный JSON — проверь скобки и кавычки.'); }
  }

  const previewBg = bgByZone[zone] ?? bgByZone.default;
  const lightFrame = ['polaroid', 'washi', 'ticket', 'sepia', 'hearts', 'postcard', 'wax-seal', 'torn', 'phone', 'locket', 'envelope'].includes(frame);

  return (
    <div className="rounded-2xl border border-black/10 bg-[#FBF8F5] p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-burgundy"><Sparkles size={15} /> Оформление элемента</div>

      <div className="mt-3 rounded-2xl border border-burgundy/8 bg-white/70 p-3">
        <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-medium text-burgundy">Быстрый стиль в одно нажатие</div><div className="mt-0.5 text-[10px] text-ink/45">После выбора все параметры ниже остаются доступными.</div></div>{beforeQuickStyle && <button type="button" onClick={restoreQuickStyle} className="flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[10px] text-burgundy"><RotateCcw size={11}/>Вернуть</button>}</div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <button type="button" onClick={() => applyQuickStyle(recommendedStyleForText(`${actualPreviewTitle}\n${actualPreviewText}`) as StyleValue)} className="min-w-[126px] shrink-0 rounded-2xl border border-gold/30 bg-gradient-to-br from-burgundy to-[#241018] p-3 text-left text-white shadow-sm"><WandSparkles size={14} className="text-gold"/><span className="mt-2 block text-xs font-medium">Подобрать</span><span className="mt-1 block text-[9px] text-white/50">по смыслу текста</span></button>
          {QUICK_STYLE_PRESETS.map((preset) => <button type="button" key={preset.id} onClick={() => applyQuickStyle(preset.style)} className="min-w-[126px] shrink-0 rounded-2xl border border-black/8 bg-[#FBF8F5] p-3 text-left transition hover:border-burgundy/25"><span className="block text-xs font-medium text-burgundy">{preset.label}</span><span className="mt-1 block text-[9px] text-ink/45">{preset.hint}</span></button>)}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="opacity-60">Рамка</span>
          <select value={frame} onChange={(e) => patch({ frame: e.target.value })} className="mt-1 w-full rounded-lg border p-2 text-sm">
            {FRAME_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        {mediaKind === 'audio' && <label className="block text-xs sm:col-span-2">
          <span className="opacity-60">Дизайн аудиоплеера</span>
          <select value={audioPlayerStyle} onChange={(e) => patch({ audioPlayerStyle: e.target.value })} className="mt-1 w-full rounded-lg border p-2 text-sm">
            {AUDIO_PLAYER_STYLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>}
        <label className="block text-xs">
          <span className="opacity-60">Дизайн даты</span>
          <select value={dateStyle} onChange={(e) => patch({ dateStyle: e.target.value })} className="mt-1 w-full rounded-lg border p-2 text-sm">
            {DATE_STYLE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}{o.hint ? ` — ${o.hint}` : ''}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="opacity-60">Дата находится</span>
          <select value={dateAlign} onChange={(e) => patch({ dateAlign: e.target.value })} className="mt-1 w-full rounded-lg border p-2 text-sm">
            {ALIGN_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="opacity-60">Шрифт даты</span>
          <select value={dateFont} onChange={(e) => patch({ dateFont: e.target.value })} className="mt-1 w-full rounded-lg border p-2 text-sm">
            {FONT_OPTIONS.filter((o) => ['sans','serif','script','literata','badscript','marck','neucha','comfort'].includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="opacity-60">Выравнивание текста</span>
          <select value={textAlign} onChange={(e) => patch({ textAlign: e.target.value })} className="mt-1 w-full rounded-lg border p-2 text-sm">
            {ALIGN_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="opacity-60">Ритм / воздух сцены</span>
          <select value={spacing} onChange={(e) => patch({ spacing: e.target.value })} className="mt-1 w-full rounded-lg border p-2 text-sm">
            {SPACING_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end rounded-xl border border-black/5 bg-white/55 p-3 text-xs">
          <input type="checkbox" checked={value.hideTime === true} onChange={(e) => patch({ hideTime: e.target.checked })} />
          Скрыть время у этого элемента
        </label>
        <label className="block text-xs">
          <span className="opacity-60">Фон / настроение сцены</span>
          <select value={zone} onChange={(e) => patch({ zone: e.target.value })} className="mt-1 w-full rounded-lg border p-2 text-sm">
            {ZONE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="opacity-60">Анимация появления</span>
          <select value={animation} onChange={(e) => patch({ animation: e.target.value })} className="mt-1 w-full rounded-lg border p-2 text-sm">
            {ANIMATION_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}{o.hint ? ` — ${o.hint}` : ''}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="opacity-60">Шрифт текста</span>
          <select value={font} onChange={(e) => patch({ font: e.target.value || undefined })} className="mt-1 w-full rounded-lg border p-2 text-sm">
            {FONT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="opacity-60">Формат даты/времени именно здесь</span>
          <select value={timeFormat} onChange={(e) => patch({ timeFormat: e.target.value || undefined })} className="mt-1 w-full rounded-lg border p-2 text-sm">
            <option value="">Как в общих настройках</option>
            {TIME_FORMAT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label} — {o.hint}</option>)}
          </select>
        </label>
        <div className="text-xs">
          <span className="opacity-60">Эффекты (можно несколько)</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {DECORATION_OPTIONS.map((o) => (
              <button type="button" key={o.id} onClick={() => toggleDecoration(o.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition ${decoration.includes(o.id) ? 'border-burgundy bg-burgundy text-white' : 'border-black/15 bg-white hover:bg-black/5'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {decoration.includes('custom-gif') && (
          <label className="block text-xs sm:col-span-2">
            <span className="opacity-60">Ссылка на свою гифку (URL)</span>
            <input value={gifUrl} onChange={(e) => patch({ gifUrl: e.target.value || undefined })} placeholder="https://…/moment.gif" className="mt-1 w-full rounded-lg border p-2 text-sm" />
            <span className="mt-1 block opacity-45">Загрузи GIF в любое бесплатное хранилище картинок (или как фото в «Медиа») и вставь сюда прямую ссылку — она будет плавно летать по сцене.</span>
          </label>
        )}
        <div className="rounded-xl border border-black/5 bg-white/55 p-3 sm:col-span-2">
          <div className="text-xs font-medium text-burgundy">Своя фоновая картинка из интернета</div>
          <input value={backgroundImageUrl} onChange={(e) => patch({ backgroundImageUrl: e.target.value || undefined })} placeholder="https://…/background.jpg" inputMode="url" className="mt-2 w-full rounded-lg border p-2 text-sm" />
          {backgroundImageUrl && !safeRemoteUrl(backgroundImageUrl) && <div className="mt-1 text-[11px] text-red-700">Нужна полная ссылка, начинающаяся с https:// или http://</div>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs"><span className="opacity-60">Главная точка картинки</span><select value={backgroundPosition} onChange={(e) => patch({ backgroundPosition: e.target.value })} className="mt-1 w-full rounded-lg border p-2 text-sm"><option value="center">По центру</option><option value="top">Сверху</option><option value="bottom">Снизу</option><option value="left">Слева</option><option value="right">Справа</option></select></label>
            <label className="text-xs"><span className="opacity-60">Затемнение: {backgroundOverlay}%</span><input type="range" min="0" max="90" value={backgroundOverlay} onChange={(e) => patch({ backgroundOverlay: Number(e.target.value) })} className="mt-2 w-full" /></label>
          </div>
        </div>
      </div>

      {/* Живое превью — тот же Frame/EffectsLayer, что и в самой книге. */}
      <div className="relative mt-5 overflow-hidden rounded-2xl" style={{ background: previewBg, ...(safeRemoteUrl(backgroundImageUrl) ? { backgroundImage: `url(${JSON.stringify(safeRemoteUrl(backgroundImageUrl))})`, backgroundSize: 'cover', backgroundPosition } : {}) }}>
        {safeRemoteUrl(backgroundImageUrl) && <div className="absolute inset-0 bg-[#25151d]" style={{ opacity: backgroundOverlay / 100 }} />}
        <div className="relative flex min-h-[200px] items-center justify-center p-6">
          <EffectsLayer decorations={decoration} seed={7} gifUrl={gifUrl || undefined} />
          <div className="w-full">
          <DateStamp date="3 марта 2024" time={value.hideTime ? null : '21:40'} variant={dateStyle as 'line' | 'centered' | 'ribbon' | 'handwritten' | 'capsule' | 'split'} align={dateAlign as 'left' | 'center' | 'right'} font={dateFont} dark />
          {hasMedia ? (
            <Frame frame={frame}><div className="space-y-3">
              {mediaKind === 'audio' ? <AudioStylePreview styleId={audioPlayerStyle} title={actualPreviewTitle || 'Аудиозапись'} /> : <div className="flex aspect-[4/5] w-full items-center justify-center bg-gradient-to-br from-blush to-peach p-4 text-center font-serif text-sm italic text-white">{mediaKind === 'video' ? 'видео' : mediaKind === 'gif' ? 'выбранная GIF' : 'фото / медиа'}</div>}
              {actualPreviewText && <p className={`relative z-10 whitespace-pre-wrap rounded-xl p-4 text-lg leading-relaxed ${textAlign === 'center' ? 'text-center' : textAlign === 'right' ? 'text-right' : 'text-left'} ${fontClassByOption[font] ?? 'font-serif'} ${lightFrame ? 'text-ink' : 'text-[#F4EFE6]'}`}>{actualPreviewText}</p>}
            </div></Frame>
          ) : (
            <Frame frame={frame}><div className={`relative z-10 max-w-[280px] rounded-xl p-4 ${textAlign === 'center' ? 'text-center' : textAlign === 'right' ? 'text-right' : 'text-left'} ${lightFrame ? 'text-ink' : 'text-[#F4EFE6]'}`}>{actualPreviewTitle && <div className="mb-2 font-serif text-2xl">{actualPreviewTitle}</div>}<p className={`${fontClassByOption[font] ?? 'font-serif'} whitespace-pre-wrap text-lg leading-relaxed`}>{actualPreviewText || 'Начни вводить текст — он сразу появится здесь.'}</p></div></Frame>
          )}
          </div>
        </div>
      </div>

      <button type="button" onClick={() => setAdvancedOpen((v) => !v)} className="mt-3 text-[11px] underline opacity-50 hover:opacity-80">
        {advancedOpen ? 'Скрыть JSON' : 'Расширенные настройки (JSON)'}
      </button>
      {advancedOpen && (
        <div className="mt-2">
          <textarea value={rawJson} onChange={(e) => setRawJson(e.target.value)} className="h-28 w-full rounded-xl border p-3 font-mono text-xs" />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={applyRaw} className="rounded-lg border px-3 py-1.5 text-xs">Применить JSON</button>
            {rawError && <span className="text-xs text-red-700">{rawError}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function AudioStylePreview({ styleId, title }: { styleId: string; title: string }) {
  if (styleId === 'voice') return <div className="rounded-2xl border border-[#b8dccd] bg-[#e7f5ee] p-4 text-[#173f31]"><div className="mb-3 flex items-center gap-2 text-[9px] uppercase tracking-[1.6px] text-[#25765a]/65"><Mic2 size={12}/> голосовое сообщение</div><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25765a] text-white"><Play size={15} fill="currentColor"/></span><div className="flex h-8 flex-1 items-center gap-1">{Array.from({ length: 22 }, (_, index) => <span key={index} className="flex-1 rounded-full bg-[#25765a]/25" style={{ height: 5 + ((index * 11) % 20) }}/>)}</div><span className="text-[9px] opacity-50">0:24</span></div><div className="mt-2 truncate text-xs font-medium">{title}</div></div>;
  if (styleId === 'cassette') return <div className="rounded-2xl border-4 border-[#272229] bg-[#d6a761] p-3 text-[#211820]"><div className="rounded-lg bg-[#efe1bf] p-3"><div className="truncate font-mono text-xs font-bold">{title}</div><div className="mt-3 flex justify-center gap-8 rounded bg-[#2b242b] p-3"><span className="h-8 w-8 rounded-full border-4 border-white/25"/><span className="h-8 w-8 rounded-full border-4 border-white/25"/></div></div></div>;
  if (styleId === 'minimal') return <div className="flex items-center gap-3 rounded-2xl bg-[#151318] p-4 text-white"><span className="flex h-11 w-11 items-center justify-center rounded-full border border-gold/25 text-gold"><Play size={15} fill="currentColor"/></span><div className="min-w-0 flex-1"><div className="truncate font-serif">{title}</div><div className="mt-2 h-1 rounded-full bg-white/10"><div className="h-full w-1/3 rounded-full bg-gold"/></div></div></div>;
  if (styleId === 'glass') return <div className="rounded-2xl bg-gradient-to-br from-[#6e3653] to-[#17131d] p-4 text-white shadow-xl"><div className="flex items-center gap-3"><span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 text-gold"><Music2 size={22}/></span><div className="min-w-0"><div className="text-[8px] uppercase tracking-[1.6px] text-gold/65">атмосфера момента</div><div className="mt-1 truncate font-serif text-lg">{title}</div></div></div></div>;
  return <div className="flex items-center gap-4 rounded-2xl bg-[#0d0b0f] p-4 text-white"><span className="vinyl-disc flex h-20 w-20 shrink-0 items-center justify-center rounded-full"><Music2 size={18} className="text-gold"/></span><div className="min-w-0"><div className="text-[8px] uppercase tracking-[1.8px] text-gold/60">сейчас играет</div><div className="mt-2 truncate font-serif text-xl">{title}</div></div></div>;
}
