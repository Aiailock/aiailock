import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { supportStyles, supportTemplates, type SupportNote } from '@/lib/chapterSupport';
import SupportCard from '@/components/reader/SupportCard';

type Day = { id: string; last: string; label: string };
const blank = (): SupportNote => ({ id: crypto.randomUUID(), anchor_id: '', placement: 'before', title: 'Немного тепла для тебя', body: '', signature: 'Обнял, приподнял ♡', style: 'letter', published: false });
const field = 'w-full rounded-xl border border-burgundy/20 bg-white p-3 text-base text-burgundy';
const button = 'min-h-11 rounded-xl border border-burgundy/20 px-4 py-2 text-sm disabled:opacity-40';
export default function SupportStudio() {
  const [days, setDays] = useState<Day[]>([]);
  const [notes, setNotes] = useState<SupportNote[]>([]);
  const [draft, setDraft] = useState<SupportNote>(() => { try { return JSON.parse(localStorage.getItem('support-studio-draft') ?? 'null') ?? blank(); } catch { return blank(); } });
  const [dayId, setDayId] = useState('');
  const [placement, setPlacement] = useState<'before' | 'after'>(draft.placement);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Все');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('support-template-favorites') ?? '[]'); } catch { return []; } });
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const entries: Array<{ id: string; occurred_at: string; type: string; metadata: Record<string, unknown> }> = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error: problem } = await supabase.from('timeline_elements').select('id,occurred_at,type,metadata')
          .eq('is_published', true).or(`visible_from.is.null,visible_from.lte.${new Date().toISOString()}`)
          .order('display_order').order('id').range(offset, offset + 999);
        if (problem) throw problem;
        entries.push(...(data ?? []));
        if ((data?.length ?? 0) < 1000) break;
      }
      const groups: Day[] = [];
      let dateKey = '';
      for (const row of entries) {
        const date = new Date(row.occurred_at);
        const key = date.toLocaleDateString('sv-SE');
        if (!groups.length || row.type === 'chapter' || key !== dateKey) {
          groups.push({ id: row.id, last: row.id, label: `${date.toLocaleDateString('ru-RU')} · ${row.type === 'chapter' && row.metadata?.title ? row.metadata.title : 'День истории'}` });
          dateKey = key;
        } else groups[groups.length - 1].last = row.id;
      }
      const { data, error: problem } = await supabase.from('chapter_support').select('*').order('created_at').order('id');
      if (problem) throw problem;
      setDays(groups); setNotes(data ?? []); setReady(true);
    } catch (e) { setError(`Не удалось загрузить студию. Проверь миграцию 0027. ${e instanceof Error ? e.message : (e as { message?: string }).message ?? ''}`); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { try { localStorage.setItem('support-studio-draft', JSON.stringify(draft)); } catch { /* full storage */ } }, [draft]);
  const day = days.find((d) => d.id === dayId);
  const anchor = day ? placement === 'before' ? day.id : day.last : draft.anchor_id;
  const filtered = useMemo(() => supportTemplates.filter((t) => (category === 'Все' || t.category === category) && (!favoritesOnly || favorites.includes(t.id)) && t.body.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [category, query, favoritesOnly, favorites]);
  const change = (patch: Partial<SupportNote>) => setDraft((old) => ({ ...old, ...patch }));
  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const note = { ...draft, anchor_id: anchor, placement, body: draft.body.trim() };
      const { error: problem } = await supabase.from('chapter_support').upsert(note);
      if (problem) throw problem;
      setDraft(note); await load(); setNotice(note.published ? 'Опубликовано. Открытый reader получит изменения автоматически.' : 'Черновик сохранён. В reader его пока нет.');
    } catch (e) { setError((e as { message?: string }).message ?? 'Не удалось сохранить.'); }
    finally { setBusy(false); }
  }
  async function remove(note: SupportNote) {
    if (!window.confirm('Удалить эту вставку поддержки?')) return;
    setBusy(true);
    const { error: problem } = await supabase.from('chapter_support').delete().eq('id', note.id);
    if (problem) setError(problem.message);
    else { if (note.id === draft.id) setDraft(blank()); await load(); }
    setBusy(false);
  }
  function edit(note: SupportNote) { setDraft(note); setDayId(''); setPlacement(note.placement); document.getElementById('support-editor')?.scrollIntoView({ behavior: 'smooth' }); }
  return <section className="space-y-6 text-burgundy">
    <div className="rounded-[28px] bg-gradient-to-br from-[#371525] to-[#794955] p-6 text-white">
      <p className="text-sm text-white/70">Маленькие письма между днями</p><h1 className="mt-2 font-serif text-4xl">Слова для неё</h1>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-white/80">Выбери день и оставь немного тепла перед ним или после. Между двумя днями можно поставить вечернее пожелание и слова на новое утро.</p>
      <div className="mt-5 flex flex-wrap gap-3 text-sm"><span>{supportTemplates.length} заготовки</span><span>· {notes.filter((n) => n.published).length} опубликовано</span><span>· {notes.filter((n) => !n.published).length} черновиков</span></div>
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-900">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice}</p>}
    <div id="support-editor" className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4 rounded-[26px] border border-burgundy/10 bg-white/90 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-serif text-2xl">Твоё пожелание</h2><button className={button} onClick={() => { setDraft(blank()); setDayId(''); setPlacement('before'); setNotice(''); }}>Новая вставка</button></div>
        <label className="block text-sm">День / глава<select className={`${field} mt-2`} value={dayId} onChange={(e) => setDayId(e.target.value)}><option value="">{draft.anchor_id ? 'Сохранённое место вставки' : 'Выбери день'}</option>{days.map((d, index) => <option key={d.id} value={d.id}>{index + 1}. {d.label}</option>)}</select></label>
        <label className="block text-sm">Расположение<select className={`${field} mt-2`} value={placement} onChange={(e) => { setPlacement(e.target.value as 'before' | 'after'); if (!dayId && draft.anchor_id) { const matched = days.find((d) => d.id === draft.anchor_id || d.last === draft.anchor_id); if (matched) setDayId(matched.id); } }}><option value="before">Перед началом дня</option><option value="after">После последней записи дня</option></select></label>
        <label className="block text-sm">Заголовок<input className={`${field} mt-2`} maxLength={120} value={draft.title} onChange={(e) => change({ title: e.target.value })}/></label>
        <label className="block text-sm">Слова поддержки<textarea rows={6} maxLength={2000} className={`${field} mt-2`} value={draft.body} onChange={(e) => change({ body: e.target.value })}/><span className="mt-1 block text-right text-sm opacity-60">{draft.body.length} / 2000</span></label>
        <label className="block text-sm">Подпись<input className={`${field} mt-2`} maxLength={100} value={draft.signature} onChange={(e) => change({ signature: e.target.value })}/></label>
        <label className="block text-sm">Оформление<select className={`${field} mt-2`} value={draft.style} onChange={(e) => change({ style: e.target.value as SupportNote['style'] })}>{Object.entries(supportStyles).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="flex min-h-11 items-center gap-3 text-base"><input type="checkbox" checked={draft.published} onChange={(e) => change({ published: e.target.checked })}/>Показывать в reader после сохранения</label>
        <button disabled={busy || !ready || !anchor || !draft.body.trim()} onClick={() => void save()} className="min-h-12 w-full rounded-xl bg-burgundy px-5 py-3 text-base text-white disabled:opacity-40">{busy ? 'Сохраняю…' : draft.published ? 'Сохранить и опубликовать' : 'Сохранить черновик'}</button>
        <p className="text-sm opacity-65">Текст сохраняется на этом устройстве во время набора. В reader изменения попадут только после сохранения и публикации. Вставка остаётся рядом с выбранной записью, если позже переместить её в истории.</p>
      </div>
      <div className="min-w-0 rounded-[26px] bg-[#0b0b0d] py-5"><p className="px-6 text-sm text-white/70">Так она увидит твои слова</p><SupportCard preview note={{ ...draft, body: draft.body || 'Выбери заготовку ниже или напиши свои слова.' }}/></div>
    </div>
    <div className="space-y-4 rounded-[26px] bg-white/85 p-5">
      <h2 className="font-serif text-2xl">Когда хочется сказать больше</h2>
      <div className="flex flex-wrap gap-3"><input aria-label="Поиск заготовок" placeholder="Найти слова…" className={`${field} sm:w-auto sm:flex-1`} value={query} onChange={(e) => setQuery(e.target.value)}/><select aria-label="Категория" className={`${field} sm:w-auto`} value={category} onChange={(e) => setCategory(e.target.value)}>{['Все', ...new Set(supportTemplates.map((t) => t.category))].map((c) => <option key={c}>{c}</option>)}</select></div>
      <div className="flex flex-wrap gap-3"><button className={button} aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}>{favoritesOnly ? '★ Только избранные' : '☆ Показать избранные'}</button><button className={button} disabled={!filtered.length} onClick={() => change({ body: filtered[Math.floor(Math.random() * filtered.length)].body })}>Случайное пожелание</button></div>
      <div className="grid max-h-[620px] gap-3 overflow-y-auto md:grid-cols-2">{filtered.map((t) => <article key={t.id} className="rounded-2xl border border-burgundy/10 p-4"><p className="text-sm opacity-60">{t.category}</p><p className="my-3 text-base leading-relaxed">{t.body}</p><div className="flex gap-2"><button className={button} onClick={() => change({ body: t.body })}>Вставить в редактор</button><button aria-label="В избранное" aria-pressed={favorites.includes(t.id)} className={button} onClick={() => { const next = favorites.includes(t.id) ? favorites.filter((id) => id !== t.id) : [...favorites, t.id]; setFavorites(next); try { localStorage.setItem('support-template-favorites', JSON.stringify(next)); } catch { /* private mode */ } }}>{favorites.includes(t.id) ? '★' : '☆'}</button></div></article>)}</div>
      {!filtered.length && <p className="text-base opacity-60">Пока ничего не найдено. Попробуй другую категорию или добавь слова в избранное.</p>}
    </div>
    <div className="space-y-3"><div className="flex justify-between gap-2"><h2 className="font-serif text-2xl">Твои вставки · {notes.length}</h2><button className={button} onClick={() => void load()}>Обновить</button></div>{notes.map((note) => <article key={note.id} className="rounded-2xl border border-burgundy/10 bg-white p-5"><p className="text-sm opacity-60">{note.published ? 'Опубликовано' : 'Черновик'} · {note.placement === 'before' ? 'Перед записью' : 'После записи'} · {days.find((d) => d.id === note.anchor_id || d.last === note.anchor_id)?.label ?? 'Привязано к записи истории'}</p><h3 className="mt-2 font-serif text-xl">{note.title}</h3><p className="my-3 whitespace-pre-wrap text-base">{note.body}</p><div className="flex flex-wrap gap-2"><button className={button} onClick={() => edit(note)}>Редактировать</button><button className={button} onClick={() => edit({ ...note, id: crypto.randomUUID(), published: false })}>Создать копию</button><a className={button} href={`/?preview=1&element=${note.anchor_id}`} target="_blank" rel="noreferrer">Открыть место</a><button disabled={busy} className={`${button} text-red-800`} onClick={() => void remove(note)}>Удалить</button></div></article>)}{ready && !notes.length && <p className="text-base opacity-60">Здесь появятся твои сохранённые пожелания.</p>}</div>
  </section>;
}
