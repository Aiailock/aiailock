import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Frame, bgByZone } from '@/components/reader/StoryElement';
import EffectsLayer from '@/components/reader/EffectsLayer';
import { DECORATION_OPTIONS, FONT_OPTIONS, FRAME_OPTIONS, ZONE_OPTIONS } from '@/lib/styleOptions';
import { TIME_FORMAT_OPTIONS } from '@/lib/readerSettingsContext';

export interface StyleValue {
  frame?: string;
  zone?: string;
  decoration?: string[];
  font?: string;
  gifUrl?: string;
  // Переопределяет глобальный формат даты/времени (Admin → Настройки) только
  // для этого элемента истории. Пусто/отсутствует — берётся общий формат.
  timeFormat?: string;
  [key: string]: unknown;
}

const fontClassByOption: Record<string, string> = {
  serif: 'font-serif', script: 'font-script', sans: 'font-sans', pixel: 'font-pixel', mono: 'font-mono',
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
  const isDark = zone === 'night' || zone === 'burgundy' || zone === 'pixel' || zone === 'dusk';

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
      </div>

      {/* Живое превью — тот же Frame/EffectsLayer, что и в самой книге. */}
      <div className="relative mt-5 overflow-hidden rounded-2xl" style={{ background: previewBg }}>
        <div className="relative flex min-h-[200px] items-center justify-center p-6">
          <EffectsLayer decorations={decoration} seed={7} gifUrl={gifUrl || undefined} />
          {hasMedia ? (
            <Frame frame={frame}>
              <div className="flex aspect-[4/5] w-full items-center justify-center bg-gradient-to-br from-blush to-peach p-4 text-center font-serif text-sm italic text-white">
                фото / видео
              </div>
            </Frame>
          ) : (
            <p className={`relative z-10 max-w-[280px] text-center text-lg leading-relaxed ${fontClassByOption[font] ?? 'font-serif'} ${isDark ? 'text-[#F4EAF0]' : 'text-ink'}`}>
              Пример текста сообщения для превью оформления.
            </p>
          )}
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
