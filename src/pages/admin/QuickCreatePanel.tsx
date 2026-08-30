import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookHeart, Check, ImagePlus, Layers3, Save, Sparkles, WandSparkles } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import StyleEditor, { type StyleValue } from './StyleEditor';

type CreateKind = 'note' | 'memory' | 'special' | 'chapter' | 'quote' | 'pause' | 'album' | 'gif' | 'interactive';

const KINDS: Array<{ id: CreateKind; label: string; hint: string }> = [
  { id: 'note', label: 'Запись', hint: 'Текст как новая страница дневника' },
  { id: 'memory', label: 'Воспоминание', hint: 'Текст и необязательное фото' },
  { id: 'special', label: 'Особый момент', hint: 'Большая эмоциональная сцена' },
  { id: 'chapter', label: 'Глава', hint: 'Красивый переход между периодами' },
  { id: 'quote', label: 'Цитата', hint: 'Большая фраза как кадр из фильма' },
  { id: 'pause', label: 'Пауза', hint: 'Воздух и тишина между сценами' },
  { id: 'album', label: 'Альбом', hint: 'Несколько скриншотов в одной сцене' },
  { id: 'gif', label: 'GIF', hint: 'Файл или ссылка между страницами' },
  { id: 'interactive', label: 'Сюрприз', hint: 'Подарок, письмо или секрет' },
];

const PRESETS: Array<{ id: string; label: string; style: StyleValue }> = [
  { id: 'diary', label: 'Личный дневник', style: { zone: 'default', font: 'literata', dateStyle: 'handwritten', dateFont: 'badscript', spacing: 'normal' } },
  { id: 'romance', label: 'Нежность', style: { zone: 'romantic', font: 'serif', dateStyle: 'centered', dateAlign: 'center', textAlign: 'center', decoration: ['petals'], spacing: 'cinematic' } },
  { id: 'night', label: 'Ночной разговор', style: { zone: 'night', frame: 'moonlit', font: 'badscript', dateStyle: 'capsule', decoration: ['stardust'], spacing: 'cinematic' } },
  { id: 'letter', label: 'Письмо', style: { zone: 'sepia', frame: 'envelope', font: 'badscript', dateStyle: 'handwritten', spacing: 'cinematic' } },
  { id: 'celebration', label: 'Праздник', style: { zone: 'gif', frame: 'garland', font: 'yeseva', dateStyle: 'ribbon', dateAlign: 'center', decoration: ['confetti'], spacing: 'cinematic' } },
  { id: 'quiet', label: 'Тихий момент', style: { zone: 'dusk', font: 'literata', dateStyle: 'line', decoration: ['candles'], spacing: 'cinematic' } },
];

interface Draft {
  kind: CreateKind;
  title: string;
  body: string;
  occurredAt: string;
  style: StyleValue;
  published: boolean;
  visibleFrom: string;
  interaction: string;
  gifUrl: string;
  albumLayout: string;
  reactionEmoji: string;
  reactionText: string;
}

const DRAFT_KEY = 'for-you-mobile-studio-draft-v1';
const nowForInput = () => new Date().toISOString().slice(0, 16);
const emptyDraft = (): Draft => ({ kind: 'note', title: '', body: '', occurredAt: nowForInput(), style: { dateStyle: 'line', spacing: 'normal' }, published: true, visibleFrom: '', interaction: 'gift', gifUrl: '', albumLayout: 'carousel', reactionEmoji: '❤', reactionText: '' });

function readDraft(): Draft {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '') as Partial<Draft>;
    return { ...emptyDraft(), ...parsed, style: parsed.style ?? emptyDraft().style, occurredAt: parsed.occurredAt || nowForInput() };
  } catch {
    return emptyDraft();
  }
}

async function upload(file: File, folder: string) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `manual/${folder}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from('screenshots').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) throw error;
  return path;
}

export default function QuickCreatePanel({ onCreated, onOpenTimeline }: { onCreated: () => void; onOpenTimeline: () => void }) {
  const [draft, setDraft] = useState<Draft>(readDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selectedKind = useMemo(() => KINDS.find((kind) => kind.id === draft.kind) ?? KINDS[0], [draft.kind]);

  useEffect(() => {
    const timer = window.setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)), 250);
    return () => window.clearTimeout(timer);
  }, [draft]);

  function patch(next: Partial<Draft>) { setDraft((current) => ({ ...current, ...next })); setMessage(''); }
  function reset() { const next = emptyDraft(); setDraft(next); setFiles([]); localStorage.removeItem(DRAFT_KEY); setMessage('Новый чистый черновик готов.'); }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (!draft.occurredAt) throw new Error('Укажи дату страницы.');
      const occurredAt = `${draft.occurredAt}Z`;
      const visibleFrom = draft.visibleFrom ? new Date(draft.visibleFrom).toISOString() : null;
      const visibility = { is_published: visibleFrom ? true : draft.published, visible_from: visibleFrom };
      const style: StyleValue = { ...draft.style };
      if (draft.kind === 'gif' && draft.gifUrl.trim()) {
        style.externalMediaUrl = draft.gifUrl.trim();
        style.externalMediaKind = 'gif';
      }

      if (draft.kind === 'chapter') {
        if (!draft.title.trim()) throw new Error('Напиши название главы.');
        const { count } = await supabase.from('timeline_elements').select('*', { count: 'exact', head: true }).eq('type', 'chapter');
        const { error } = await supabase.from('timeline_elements').insert({
          type: 'chapter', occurred_at: occurredAt, sort_tiebreak: -20,
          style, ...visibility,
          metadata: { title: draft.title.trim(), subtitle: draft.body.trim() || null, number: Number(count ?? 0) + 1 },
        });
        if (error) throw error;
      } else if (draft.kind === 'quote' || draft.kind === 'pause') {
        if (draft.kind === 'quote' && !draft.body.trim()) throw new Error('Напиши текст цитаты.');
        const { error } = await supabase.from('timeline_elements').insert({
          type: draft.kind, occurred_at: occurredAt, sort_tiebreak: draft.kind === 'quote' ? -10 : 20,
          style: { zone: 'default', spacing: 'cinematic', ...style }, ...visibility,
          metadata: draft.kind === 'quote'
            ? { quote: draft.body.trim(), author: draft.title.trim() || null }
            : { text: draft.body.trim() || null },
        });
        if (error) throw error;
      } else if (draft.kind === 'note') {
        if (!draft.body.trim()) throw new Error('Напиши текст записи.');
        const id = crypto.randomUUID();
        const { error } = await supabase.from('messages').insert({
          id, fingerprint: `manual-${id}`, sender_name: draft.title.trim() || 'Запись',
          sent_at: occurredAt, is_system_message: false, is_multiline: draft.body.includes('\n'),
          original_text: draft.body.trim(), display_text: draft.body.trim(), has_media: false,
        });
        if (error) throw error;
        const { error: timelineError } = await supabase.from('timeline_elements').update({ style, ...visibility }).eq('message_id', id);
        if (timelineError) throw timelineError;
      } else if (draft.kind === 'album') {
        if (files.length === 0) throw new Error('Выбери один или несколько скриншотов.');
        if (files.length > 12) throw new Error('В одном альбоме можно максимум 12 изображений.');
        const collectionId = files.length > 1 ? crypto.randomUUID() : null;
        for (let index = 0; index < files.length; index += 1) {
          const id = crypto.randomUUID();
          const storagePath = await upload(files[index], `albums/${collectionId ?? id}`);
          const { error } = await supabase.from('screenshots').insert({
            id, storage_path: storagePath,
            title: index === 0 ? draft.title.trim() || null : null,
            description: null,
            caption: index === 0 ? draft.body.trim() || null : null,
            occurred_at: occurredAt,
            position: 'custom', animation: 'fade', style,
            collection_id: collectionId,
            collection_order: index,
            collection_layout: draft.albumLayout,
            reaction_emoji: index === 0 ? draft.reactionEmoji || null : null,
            reaction_text: index === 0 ? draft.reactionText.trim() || null : null,
          });
          if (error) throw error;
          const { error: visibilityError } = await supabase.from('timeline_elements').update(visibility).eq('screenshot_id', id);
          if (visibilityError) throw visibilityError;
        }
      } else {
        const isGif = draft.kind === 'gif';
        if (!isGif && !draft.body.trim()) throw new Error('Напиши текст момента.');
        if (isGif && files.length === 0 && !draft.gifUrl.trim()) throw new Error('Выбери GIF-файл или вставь прямую ссылку.');
        const id = crypto.randomUUID();
        const photoPath = files[0] ? await upload(files[0], `${draft.kind}/${id}`) : null;
        const metadata = draft.kind === 'special'
          ? { kind: 'special' }
          : draft.kind === 'interactive'
            ? { kind: 'interactive', interaction: draft.interaction }
            : draft.kind === 'gif' ? { kind: 'gif' } : {};
        if (isGif && !draft.body.trim()) style.hideText = true;
        const { error } = await supabase.from('memories').insert({
          id, title: draft.title.trim() || null,
          body: draft.body.trim() || 'GIF', occurred_at: occurredAt, importance: draft.kind === 'special' ? 5 : 3,
          photo_storage_path: photoPath, style, metadata,
        });
        if (error) throw error;
        const { error: visibilityError } = await supabase.from('timeline_elements').update(visibility).eq('memory_id', id);
        if (visibilityError) throw visibilityError;
      }

      localStorage.removeItem(DRAFT_KEY);
      setMessage('Готово — страница уже добавлена в историю. Можно сразу открыть Preview или продолжить редактирование.');
      setFiles([]);
      onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось добавить страницу.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid min-w-0 gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <form onSubmit={(event) => void save(event)} className="min-w-0 rounded-[28px] border border-black/5 bg-white/90 p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><div className="rounded-2xl bg-burgundy p-3 text-white"><BookHeart size={20} /></div><div><div className="text-[10px] uppercase tracking-[2px] text-burgundy/45">mobile story studio</div><h1 className="font-serif text-3xl text-burgundy">Добавить страницу</h1><p className="mt-1 text-xs opacity-50">Дата уже стоит текущая. Черновик сохраняется в этом телефоне автоматически.</p></div></div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KINDS.map((kind) => <button type="button" key={kind.id} onClick={() => patch({ kind: kind.id })} className={`min-w-0 rounded-2xl border p-3 text-left transition ${draft.kind === kind.id ? 'border-burgundy bg-burgundy text-white shadow-md' : 'border-black/10 bg-[#FBF8F5]'}`}><div className="text-sm font-medium">{kind.label}</div><div className="mt-1 text-[10px] leading-snug opacity-55">{kind.hint}</div></button>)}
        </div>

        <div className="mt-5 rounded-2xl bg-[#F6EFE0] p-3"><div className="flex items-center gap-2 text-xs font-medium text-burgundy"><WandSparkles size={14} /> Готовый стиль — без ручной настройки</div><div className="mt-2 flex flex-wrap gap-2">{PRESETS.map((preset) => <button type="button" key={preset.id} onClick={() => patch({ style: { ...draft.style, ...preset.style } })} className="rounded-full border border-burgundy/10 bg-white/70 px-3 py-1.5 text-[11px] text-burgundy">{preset.label}</button>)}</div></div>

        <input value={draft.title} onChange={(event) => patch({ title: event.target.value })} placeholder={draft.kind === 'chapter' ? 'Название главы' : draft.kind === 'quote' ? 'Автор или подпись (необязательно)' : 'Название (необязательно)'} className="mt-4 w-full rounded-xl border p-3" />
        <textarea value={draft.body} onChange={(event) => patch({ body: event.target.value })} placeholder={draft.kind === 'chapter' ? 'Короткая фраза под названием' : draft.kind === 'quote' ? 'Та самая фраза…' : draft.kind === 'pause' ? 'Несколько тихих слов — или оставь пустым' : draft.kind === 'interactive' ? 'Что откроется после нажатия?' : draft.kind === 'album' ? 'Общая подпись к альбому' : 'Текст страницы'} className="mt-3 min-h-36 w-full rounded-xl border p-3" />
        <input type="datetime-local" value={draft.occurredAt} onChange={(event) => patch({ occurredAt: event.target.value })} className="mt-3 w-full rounded-xl border p-3" />

        {(draft.kind === 'memory' || draft.kind === 'special' || draft.kind === 'gif' || draft.kind === 'interactive' || draft.kind === 'album') && <label className="mt-3 block rounded-xl border border-dashed border-burgundy/15 bg-[#FBF8F5] p-3 text-sm"><span className="flex items-center gap-2"><ImagePlus size={16} />{draft.kind === 'album' ? 'Скриншоты (можно выбрать сразу несколько)' : draft.kind === 'gif' ? 'GIF-файл' : 'Фото или GIF (необязательно)'}</span><input type="file" multiple={draft.kind === 'album'} accept={draft.kind === 'gif' ? 'image/gif,.gif' : 'image/*,.gif'} onChange={(event) => setFiles(Array.from(event.target.files ?? []))} className="mt-2 block w-full text-xs" />{files.length > 0 && <span className="mt-2 block text-[11px] text-burgundy/60">Выбрано: {files.length}</span>}</label>}

        {draft.kind === 'gif' && <label className="mt-3 block text-sm">Или прямая ссылка на GIF<input value={draft.gifUrl} inputMode="url" onChange={(event) => patch({ gifUrl: event.target.value })} placeholder="https://…/animation.gif" className="mt-2 w-full rounded-xl border p-3" /></label>}
        {draft.kind === 'interactive' && <label className="mt-3 block text-sm">Как открывается<select value={draft.interaction} onChange={(event) => patch({ interaction: event.target.value })} className="mt-2 w-full rounded-xl border p-3"><option value="gift">Подарок</option><option value="letter">Письмо</option><option value="spoiler">Секрет</option><option value="flip">Перевёртыш</option><option value="photo-reveal">Проявить фото</option><option value="promise">Обещание</option></select></label>}
        {draft.kind === 'album' && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">Оформление альбома<select value={draft.albumLayout} onChange={(event) => patch({ albumLayout: event.target.value })} className="mt-2 w-full rounded-xl border p-3"><option value="carousel">Карусель — листать пальцем</option><option value="stack">Стопка снимков</option><option value="collage">Коллаж</option></select></label><label className="text-sm">Твоя реакция<div className="mt-2 flex gap-2"><select value={draft.reactionEmoji} onChange={(event) => patch({ reactionEmoji: event.target.value })} className="w-20 rounded-xl border p-3"><option>❤</option><option>🥹</option><option>😂</option><option>✨</option><option>💔</option></select><input value={draft.reactionText} onChange={(event) => patch({ reactionText: event.target.value })} placeholder="например: до сих пор улыбаюсь" className="min-w-0 flex-1 rounded-xl border p-3" /></div></label></div>}

        <div className="mt-4 rounded-2xl bg-black/[.025] p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.published} onChange={(event) => patch({ published: event.target.checked })} disabled={Boolean(draft.visibleFrom)} /> Сразу показать ей в reader</label><label className="mt-3 block text-xs text-burgundy/65">Или открыть автоматически позже<input type="datetime-local" value={draft.visibleFrom} onChange={(event) => patch({ visibleFrom: event.target.value })} className="mt-2 w-full rounded-xl border p-3 text-sm" /><span className="mt-1 block text-[10px] opacity-60">Если дата указана, сцена останется скрытой до этого момента.</span></label></div>
        <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} className="rounded-xl bg-burgundy px-5 py-3 text-sm text-white shadow disabled:opacity-45"><Save size={15} className="mr-1 inline" />{busy ? 'Добавляю…' : `Добавить: ${selectedKind.label}`}</button><button type="button" onClick={reset} className="rounded-xl border px-4 py-3 text-sm">Очистить</button></div>
        {message && <div className={`mt-4 rounded-xl p-3 text-sm ${message.startsWith('Готово') ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{message}{message.startsWith('Готово') && <button type="button" onClick={onOpenTimeline} className="mt-3 block rounded-lg border border-emerald-700/20 bg-white/60 px-3 py-2 text-xs">Открыть и редактировать в Истории</button>}</div>}
      </form>

      <div className="min-w-0 space-y-4">
        <div className="rounded-[28px] bg-gradient-to-br from-[#351523] to-[#1f1118] p-5 text-white shadow-xl"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[2px] text-white/45"><Sparkles size={13} /> визуальная мастерская</div><h2 className="mt-2 font-serif text-3xl">Настрой и сразу увидь результат</h2><div className="mt-4 grid gap-2 text-xs text-white/65 sm:grid-cols-3"><div className="rounded-xl bg-white/5 p-3"><Check size={13} className="mb-1" />Дата слева, справа или по центру</div><div className="rounded-xl bg-white/5 p-3"><Layers3 size={13} className="mb-1" />Фоны по ссылке и эффекты</div><div className="rounded-xl bg-white/5 p-3"><ImagePlus size={13} className="mb-1" />Альбомы до 12 кадров</div></div></div>
        <StyleEditor value={draft.style} onChange={(style) => patch({ style })} hasMedia={draft.kind === 'album' || draft.kind === 'gif' || files.length > 0} />
      </div>
    </section>
  );
}
