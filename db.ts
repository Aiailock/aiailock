import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Frame, bgByZone } from '@/components/reader/StoryElement';
import EffectsLayer from '@/components/reader/EffectsLayer';
import DateStamp from '@/components/reader/DateStamp';
import { ALIGN_OPTIONS, DATE_STYLE_OPTIONS, DECORATION_OPTIONS, FONT_OPTIONS, FRAME_OPTIONS, SPACING_OPTIONS, ZONE_OPTIONS } from '@/lib/styleOptions';
import { TIME_FORMAT_OPTIONS } from '@/lib/readerSettingsContext';
import { safeRemoteUrl } from '@/lib/safeUrl';

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
  backgroundImageUrl?: string;
  backgroundPosition?: string;
  backgroundOverlay?: number;
  externalMediaUrl?: string;
  externalMediaKind?: string;
  [key: string]: unknown;
}

const fontClassByOption: Record<string, string> = {
  serif: 'font-serif', script: 'font-script', sans: 'font-sans', pixel: 'font-pixel', mono: 'font-mono',
  literata: 'font-literata', yeseva: 'font-yeseva', comfort: 'font-comfort',
  badscript: 'font-badscript', marck: 'font-marck', pacifico: 'font-pacifico', neucha: 'font-neucha',
};

// Понятный на русском визуальный редактор JSON-поля `style` у элемента
// хроники: рамка, эффекты, фон-зона и шрифт — с превью один в один как в
// читалке (переиспользует те же компоненты Frame/EffectsLayer).
export default function StyleEditor({ value, onChange, hasMedia = true }: { value: StyleValue; onChange: (next: StyleValue) => void; hasMedia?: boolean }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [rawJson, setRawJson] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [rawError, setRawError] = useState('');

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
  const backgroundImageUrl = typeof value.backgroundImageUrl === 'string' ? value.backgroundImageUrl : '';
  const backgroundPosition = typeof value.backgroundPosition === 'string' ? value.backgroundPosition : 'center';
  const backgroundOverlay = typeof value.backgroundOverlay === 'number' ? value.backgroundOverlay : 46;

  function patch(next: Partial<StyleValue>) {
    const merged = { ...value, ...next };
    onChange(merged);
    setRawJson(JSON.stringify(merged, null, 2));
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
  const darkFrame = ['stars', 'neon', 'pixel', 'moonlit'].includes(frame);

  return (
    <div className="rounded-2xl border border-black/10 bg-[#FBF8F5] p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-burgundy"><Sparkles size={15} /> Оформление элемента</div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="opacity-60">Рамка</span>
          <select value={frame} onChange={(e) => patch({ frame: e.target.value })} className="mt-1 w-full rounded-lg border p-2 text-sm">
            {FRAME_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
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
          <DateStamp date="3 марта 2024" time={value.hideTime ? null : '21:40'} variant={dateStyle as 'line' | 'centered' | 'ribbon' | 'handwritten' | 'capsule' | 'split'} align={dateAlign as 'left' | 'center' | 'right'} font={dateFont} dark={Boolean(safeRemoteUrl(backgroundImageUrl)) || ['night','burgundy','dusk'].includes(zone)} />
          {hasMedia ? (
            <Frame frame={frame}>
              <div className="flex aspect-[4/5] w-full items-center justify-center bg-gradient-to-br from-blush to-peach p-4 text-center font-serif text-sm italic text-white">
                фото / видео
              </div>
            </Frame>
          ) : (
            <Frame frame={frame}><p className={`relative z-10 max-w-[280px] rounded-xl p-4 text-lg leading-relaxed ${textAlign === 'center' ? 'text-center' : textAlign === 'right' ? 'text-right' : 'text-left'} ${fontClassByOption[font] ?? 'font-serif'} ${darkFrame || safeRemoteUrl(backgroundImageUrl) ? 'text-[#F4EAF0]' : 'text-ink'}`}>Пример текста сообщения для превью оформления.</p></Frame>
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
