import { ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, Loader2, LockKeyhole, Paintbrush, RotateCcw, Save, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicTimelineRow } from '@/lib/readerApi';
import { supabase } from '@/lib/supabaseClient';
import StyleEditor, { type StyleValue } from './StyleEditor';
import CommonsMediaSearch, { type CommonsAsset } from '@/components/admin/CommonsMediaSearch';
import { downloadRemoteGif, MAX_GIF_BYTES } from '@/lib/remoteMedia';

interface EditForm {
  title: string;
  body: string;
  extra: string;
  url: string;
  artist: string;
  occurredAt: string;
  visibleFrom: string;
  published: boolean;
  mood: string;
  style: StyleValue;
}

const MOODS = [
  ['normal', 'Обычное'], ['romantic', 'Романтика'], ['funny', 'Смешное'], ['sad', 'Грустное'],
  ['deep', 'Глубокое'], ['night', 'Ночное'], ['memory', 'Воспоминание'], ['important', 'Важное'],
  ['hopeful', 'Надежда'], ['neutral', 'Нейтральное'],
] as const;

function cleanDate(value: string | null | undefined) {
  return value ? value.slice(0, 16) : '';
}

function textFields(row: PublicTimelineRow): Pick<EditForm, 'title' | 'body' | 'extra' | 'url' | 'artist'> {
  const metadata = row.metadata ?? {};
  if (row.type === 'chapter') return { title: String(metadata.title ?? ''), body: String(metadata.subtitle ?? ''), extra: String(metadata.number ?? ''), url: '', artist: '' };
  if (row.type === 'quote') return { title: String(metadata.author ?? ''), body: String(metadata.quote ?? ''), extra: '', url: '', artist: '' };
  if (row.type === 'pause') return { title: '', body: String(metadata.text ?? ''), extra: '', url: '', artist: '' };
  if (row.type === 'link') return { title: String(metadata.title ?? ''), body: String(metadata.description ?? ''), extra: '', url: String(metadata.url ?? ''), artist: '' };
  if (row.memory_id) return { title: row.memory_title ?? '', body: row.memory_body ?? '', extra: '', url: '', artist: '' };
  if (row.screenshot_id) return { title: row.screenshot_title ?? '', body: row.screenshot_caption ?? '', extra: row.screenshot_description ?? '', url: '', artist: '' };
  return {
    title: String(metadata.title ?? row.sender_name ?? ''),
    body: row.display_text ?? row.original_text ?? String(metadata.body ?? ''),
    extra: String(metadata.album ?? ''),
    url: String(row.style?.externalMediaUrl ?? ''),
    artist: String(metadata.artist ?? ''),
  };
}

function formFor(row: PublicTimelineRow): EditForm {
  return {
    ...textFields(row),
    occurredAt: cleanDate(row.occurred_at),
    visibleFrom: cleanDate(row.visible_from),
    published: row.is_published,
    mood: row.mood ?? 'normal',
    style: (row.style ?? {}) as StyleValue,
  };
}

function metadataFor(row: PublicTimelineRow, form: EditForm) {
  const metadata = { ...(row.metadata ?? {}) };
  if (row.type === 'chapter') return { ...metadata, title: form.title.trim() || 'Новая глава', subtitle: form.body.trim() || null, number: form.extra.trim() || null };
  if (row.type === 'quote') return { ...metadata, quote: form.body.trim(), author: form.title.trim() || null };
  if (row.type === 'pause') return { ...metadata, text: form.body.trim() || null };
  if (row.type === 'link') return { ...metadata, title: form.title.trim() || 'Открыть следующую страницу', description: form.body.trim() || null, url: form.url.trim() };
  return { ...metadata, title: form.title.trim() || null, body: form.body.trim() || null, artist: form.artist.trim() || null, album: form.extra.trim() || null };
}

function previewRow(row: PublicTimelineRow, form: EditForm): PublicTimelineRow {
  const next: PublicTimelineRow = {
    ...row,
    occurred_at: form.occurredAt ? `${form.occurredAt}:00Z`.replace(':00:00Z', ':00Z') : row.occurred_at,
    visible_from: form.visibleFrom ? `${form.visibleFrom}:00Z`.replace(':00:00Z', ':00Z') : null,
    is_published: form.published,
    mood: form.mood,
    style: form.style,
    metadata: metadataFor(row, form),
  };
  if (row.message_id) {
    next.sender_name = form.title;
    next.display_text = form.body;
  }
  if (row.memory_id) {
    next.memory_title = form.title;
    next.memory_body = form.body;
    next.memory_style = form.style;
  }
  if (row.screenshot_id) {
    next.screenshot_title = form.title;
    next.screenshot_caption = form.body;
    next.screenshot_description = form.extra;
    next.screenshot_style = form.style;
  }
  return next;
}

function typeLabel(row: PublicTimelineRow) {
  if (row.metadata?.kind === 'gif') return 'GIF-сцена';
  if (row.metadata?.kind === 'interactive') return 'Интерактив';
  return ({ message: 'Сообщение', memory: 'Воспоминание', special: 'Особый момент', screenshot: 'Скриншот', chapter: 'Глава', quote: 'Цитата', pause: 'Пауза', audio: 'Аудио', video: 'Видео', link: 'Ссылка' } as Record<string, string>)[row.type] ?? row.type;
}

export default function ReaderPreviewEditor({
  row,
  position,
  total,
  canGoPrevious,
  canGoNext,
  onPreview,
  onClose,
  onSaved,
  onNavigate,
}: {
  row: PublicTimelineRow;
  position: number;
  total: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPreview: (next: PublicTimelineRow) => void;
  onClose: (original: PublicTimelineRow) => void;
  onSaved: (elementId: string) => void | Promise<void>;
  onNavigate: (direction: -1 | 1) => void;
}) {
  const original = useRef(row);
  const initial = useRef(formFor(row));
  const [form, setForm] = useState<EditForm>(initial.current);
  const [advancedStyle, setAdvancedStyle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [gifSelection, setGifSelection] = useState<CommonsAsset | null>(null);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial.current) || Boolean(replacementFile || gifSelection), [form, gifSelection, replacementFile]);
  const isExternal = row.type === 'link' || typeof row.style?.externalMediaUrl === 'string';

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => { if (active) setAuthorized(Boolean(data.user)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    onPreview(previewRow(original.current, form));
  }, [form, onPreview]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(original.current);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-preview-save]')?.click();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onClose]);

  function patch(next: Partial<EditForm>) {
    setForm((current) => ({ ...current, ...next }));
    setMessage('');
  }

  function reset() {
    setForm(initial.current);
    setReplacementFile(null);
    setGifSelection(null);
    onPreview(original.current);
    setMessage('Несохранённые изменения отменены.');
  }

  function navigate(direction: -1 | 1) {
    if (dirty && !window.confirm('Перейти к другой сцене без сохранения изменений?')) return;
    if (dirty) onPreview(original.current);
    onNavigate(direction);
  }

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('preview', '1');
    url.searchParams.set('element', row.element_id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setMessage('Ссылка на эту сцену скопирована.');
    } catch {
      setMessage(`Не удалось скопировать автоматически: ${url.toString()}`);
    }
  }

  async function save() {
    if (!authorized || busy) return;
    if (!form.occurredAt) { setMessage('Укажи дату и время сцены.'); return; }
    if (row.type === 'quote' && !form.body.trim()) { setMessage('У цитаты должен быть текст.'); return; }
    if (row.type === 'link' && !/^https?:\/\//i.test(form.url.trim())) { setMessage('Для ссылки нужен полный адрес с http:// или https://.'); return; }
    setBusy(true);
    setMessage('');
    let uploadedPath: string | null = null;
    let uploadedPathAttached = false;
    try {
      // Story dates are deliberately stored as wall-clock UTC, matching the
      // existing Admin editors and WhatsApp import semantics.
      const occurredAt = `${form.occurredAt}Z`;
      const visibleFrom = form.visibleFrom ? new Date(form.visibleFrom).toISOString() : null;
      const published = visibleFrom ? true : form.published;
      let selectedFile = replacementFile;
      if (!selectedFile && gifSelection) selectedFile = await downloadRemoteGif(gifSelection.url, gifSelection.title || 'animation');
      if (selectedFile) {
        if (!selectedFile.type.startsWith('image/')) throw new Error('Для этой сцены выбери изображение или GIF.');
        if (selectedFile.size > MAX_GIF_BYTES) throw new Error('Изображение должно быть не больше 20 МБ.');
        const sourceId = row.memory_id ?? row.screenshot_id;
        if (!sourceId) throw new Error('У этой сцены медиа заменяется через основную админку.');
        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image.jpg';
        uploadedPath = `preview-edits/${sourceId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('screenshots').upload(uploadedPath, selectedFile, { contentType: selectedFile.type || 'image/jpeg', cacheControl: '3600' });
        if (uploadError) throw uploadError;
      }
      const sourceUpdates: Array<PromiseLike<{ error: { message: string } | null }>> = [];
      if (row.message_id) {
        sourceUpdates.push(supabase.from('messages').update({ sender_name: form.title.trim() || row.sender_name || 'Запись', display_text: form.body.trim() || null }).eq('id', row.message_id));
      } else if (row.memory_id) {
        sourceUpdates.push(supabase.from('memories').update({
          title: form.title.trim() || null,
          body: form.body.trim() || (row.metadata?.kind === 'gif' ? 'GIF' : ' '),
          occurred_at: occurredAt,
          style: form.style,
          ...(uploadedPath ? { photo_storage_path: uploadedPath } : {}),
          ...(gifSelection ? { metadata: { ...(row.memory_metadata ?? row.metadata ?? {}), kind: 'gif', sourceUrl: gifSelection.sourceUrl, sourceTitle: gifSelection.title, sourceProvider: gifSelection.provider ?? null } } : {}),
        }).eq('id', row.memory_id));
      } else if (row.screenshot_id) {
        sourceUpdates.push(supabase.from('screenshots').update({ title: form.title.trim() || null, caption: form.body.trim() || null, description: form.extra.trim() || null, occurred_at: occurredAt, style: form.style, position: 'custom', ...(uploadedPath ? { storage_path: uploadedPath } : {}) }).eq('id', row.screenshot_id));
      }
      const timelinePayload: Record<string, unknown> = {
        occurred_at: occurredAt,
        is_published: published,
        visible_from: visibleFrom,
        mood: form.mood,
      };
      if (!row.memory_id && !row.screenshot_id) timelinePayload.style = form.style;
      if (!row.message_id && !row.memory_id && !row.screenshot_id) timelinePayload.metadata = metadataFor(row, form);
      else if ((row.type === 'audio' || row.type === 'video') && row.message_id) timelinePayload.metadata = metadataFor(row, form);
      const results = await Promise.all([...sourceUpdates, supabase.from('timeline_elements').update(timelinePayload).eq('id', row.element_id)]);
      if (uploadedPath && sourceUpdates.length > 0 && !results[0]?.error) uploadedPathAttached = true;
      const error = results.find((result) => result.error)?.error;
      if (error) throw new Error(error.message);
      const saved = previewRow(original.current, { ...form, published });
      original.current = saved;
      initial.current = { ...form, published };
      setForm(initial.current);
      setReplacementFile(null);
      setGifSelection(null);
      const oldPath = row.memory_id ? row.memory_photo_storage_path : row.screenshot_storage_path;
      if (uploadedPath && oldPath && oldPath !== uploadedPath) await supabase.storage.from('screenshots').remove([oldPath]);
      setMessage('Сохранено. Reader уже показывает обновлённую сцену.');
      await onSaved(row.element_id);
    } catch (error) {
      if (uploadedPath && !uploadedPathAttached) await supabase.storage.from('screenshots').remove([uploadedPath]);
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить изменения.');
    } finally {
      setBusy(false);
    }
  }

  if (authorized === false) return <aside className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-lg rounded-[26px] border border-red-300 bg-white p-5 text-ink shadow-2xl"><div className="flex items-center gap-2 font-medium text-red-800"><LockKeyhole size={17}/>Админ-сессия закончилась</div><p className="mt-2 text-xs opacity-60">Открой вход в админку, затем вернись в Preview.</p><a href="/admin/login" className="mt-4 inline-block rounded-xl bg-burgundy px-4 py-2.5 text-xs text-white">Войти в админку</a></aside>;

  return <aside className="fixed inset-x-2 bottom-2 z-[90] mx-auto max-h-[82dvh] max-w-xl overflow-y-auto rounded-[30px] border border-white/15 bg-[#F7F0EB]/98 text-ink shadow-[0_28px_90px_rgba(0,0,0,.55)] backdrop-blur-2xl lg:inset-y-3 lg:left-auto lg:right-3 lg:max-h-none lg:w-[460px]">
    <div className="sticky top-0 z-10 border-b border-black/8 bg-[#F7F0EB]/95 px-4 py-3 backdrop-blur-xl">
      <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-burgundy text-gold"><Paintbrush size={16}/></span><div className="min-w-0 flex-1"><div className="text-[9px] uppercase tracking-[1.7px] text-burgundy/45">редактор прямо в Reader</div><div className="truncate font-serif text-xl text-burgundy">{typeLabel(row)} · {position} из {total}</div></div><button type="button" aria-label="Закрыть редактор" onClick={() => onClose(original.current)} className="rounded-xl border border-black/10 bg-white p-2"><X size={16}/></button></div>
      <div className="mt-3 grid grid-cols-[auto_1fr_auto] gap-2"><button type="button" aria-label="Предыдущая сцена" disabled={!canGoPrevious} onClick={() => navigate(-1)} className="rounded-xl border bg-white p-2.5 disabled:opacity-30"><ChevronLeft size={15}/></button><button type="button" onClick={() => void copyLink()} className="flex items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs text-burgundy"><Copy size={13}/>Ссылка на сцену</button><button type="button" aria-label="Следующая сцена" disabled={!canGoNext} onClick={() => navigate(1)} className="rounded-xl border bg-white p-2.5 disabled:opacity-30"><ChevronRight size={15}/></button></div>
    </div>

    <div className="space-y-3 p-4">
      {authorized === null && <div className="flex items-center gap-2 rounded-xl bg-white p-3 text-xs"><Loader2 size={14} className="animate-spin"/>Проверяю админ-доступ…</div>}
      {row.type !== 'pause' && <label className="block text-xs"><span className="opacity-55">{row.type === 'quote' ? 'Автор / подпись' : row.message_id ? 'Имя / заголовок' : 'Название'}</span><input value={form.title} onChange={(event) => patch({ title: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-white p-3 text-sm" placeholder="Название сцены"/></label>}
      <label className="block text-xs"><span className="opacity-55">{row.type === 'chapter' ? 'Подзаголовок' : row.type === 'quote' ? 'Текст цитаты' : 'Основной текст'}</span><textarea value={form.body} onChange={(event) => patch({ body: event.target.value })} className="mt-1 min-h-32 w-full rounded-xl border border-black/10 bg-white p-3 text-sm leading-relaxed" placeholder="Текст сразу меняется в Reader слева"/></label>
      {(row.screenshot_id || row.type === 'chapter' || row.type === 'audio' || row.type === 'video') && <label className="block text-xs"><span className="opacity-55">{row.screenshot_id ? 'Дополнительное описание' : row.type === 'chapter' ? 'Номер главы' : 'Альбом / дополнительная подпись'}</span><input value={form.extra} onChange={(event) => patch({ extra: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-white p-3 text-sm"/></label>}
      {isExternal && <label className="block text-xs"><span className="opacity-55">Ссылка</span><input value={form.url} onChange={(event) => patch({ url: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-white p-3 text-sm" inputMode="url"/></label>}
      {(row.type === 'audio' || row.type === 'video') && <label className="block text-xs"><span className="opacity-55">Исполнитель</span><input value={form.artist} onChange={(event) => patch({ artist: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-white p-3 text-sm"/></label>}
      {(row.memory_id || row.screenshot_id) && <div className="rounded-2xl border border-black/8 bg-white/70 p-3"><label className="block cursor-pointer text-xs"><span className="font-medium text-burgundy">Заменить изображение</span><input type="file" accept="image/*,.gif" onChange={(event) => { setReplacementFile(event.target.files?.[0] ?? null); setGifSelection(null); event.currentTarget.value = ''; }} className="mt-2 block w-full rounded-xl border border-dashed p-2 text-[10px]"/></label>{replacementFile && <div className="mt-2 flex items-center justify-between rounded-xl bg-[#F7F0EB] p-2 text-[10px]"><span className="min-w-0 truncate">{replacementFile.name} · {(replacementFile.size / 1024 / 1024).toFixed(1)} МБ</span><button type="button" onClick={() => setReplacementFile(null)} className="ml-2 rounded-lg border bg-white px-2 py-1">Убрать</button></div>}</div>}
      {row.metadata?.kind === 'gif' && <CommonsMediaSearch kind="gif" initialQuery={`${form.title} ${form.body}`.trim()} value={gifSelection} onChange={(asset) => { setGifSelection(asset); setReplacementFile(null); }}/>} 

      <div className="grid grid-cols-2 gap-2"><label className="text-xs"><span className="opacity-55">Дата и время</span><input type="datetime-local" value={form.occurredAt} onChange={(event) => patch({ occurredAt: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-white p-3 text-xs"/></label><label className="text-xs"><span className="opacity-55">Настроение</span><select value={form.mood} onChange={(event) => patch({ mood: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-white p-3 text-xs">{MOODS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label></div>
      <div className="rounded-2xl border border-black/8 bg-white/70 p-3"><label className="flex items-center justify-between gap-3 text-xs"><span><span className="block font-medium text-burgundy">Показывать в Reader</span><span className="mt-0.5 block opacity-45">Можно скрыть без удаления</span></span><input type="checkbox" checked={form.published} disabled={Boolean(form.visibleFrom)} onChange={(event) => patch({ published: event.target.checked })} className="h-5 w-5 accent-burgundy"/></label><label className="mt-3 block border-t border-black/8 pt-3 text-xs"><span className="opacity-55">Показать автоматически позже</span><input type="datetime-local" value={form.visibleFrom} onChange={(event) => patch({ visibleFrom: event.target.value, ...(event.target.value ? { published: true } : {}) })} className="mt-1 w-full rounded-xl border border-black/10 bg-white p-3 text-xs"/></label></div>

      <button type="button" aria-expanded={advancedStyle} onClick={() => setAdvancedStyle((value) => !value)} className="flex w-full items-center justify-between rounded-2xl border border-burgundy/10 bg-white/75 p-3 text-left text-xs text-burgundy"><span className="flex items-center gap-2"><Paintbrush size={14}/>Оформление, рамка и эффекты</span><ChevronDown size={14} className={`transition ${advancedStyle ? 'rotate-180' : ''}`}/></button>
      {advancedStyle && <StyleEditor value={form.style} onChange={(style) => patch({ style })} hasMedia={Boolean(row.media_id || row.screenshot_id || row.memory_photo_storage_path || row.style?.externalMediaUrl)} mediaKind={row.media_kind || (row.metadata?.kind === 'gif' ? 'gif' : row.type === 'audio' ? 'audio' : row.type === 'video' ? 'video' : null)} previewTitle={form.title} previewText={form.body}/>} 

      {message && <div className={`rounded-xl p-3 text-xs ${message.startsWith('Сохранено') || message.startsWith('Ссылка') ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>{message}</div>}
    </div>
    <div className="sticky bottom-0 grid grid-cols-[auto_1fr] gap-2 border-t border-black/8 bg-[#F7F0EB]/95 p-3 backdrop-blur-xl"><button type="button" disabled={!dirty || busy} onClick={reset} className="flex items-center justify-center gap-1 rounded-xl border bg-white px-3 py-3 text-xs disabled:opacity-35"><RotateCcw size={13}/>Отменить</button><button type="button" data-preview-save disabled={!dirty || busy || !authorized} onClick={() => void save()} className="flex items-center justify-center gap-2 rounded-xl bg-burgundy px-4 py-3 text-sm text-white shadow disabled:opacity-40">{busy ? <Loader2 size={15} className="animate-spin"/> : <Save size={15}/>}Сохранить <span className="hidden opacity-45 sm:inline">Ctrl/⌘S</span></button></div>
    <div className="sr-only">{form.published ? <Eye/> : <EyeOff/>}</div>
  </aside>;
}
