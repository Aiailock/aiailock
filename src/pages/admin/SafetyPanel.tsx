import { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle2, History, RefreshCw, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface IntegrityReport {
  messages?: number;
  published?: number;
  hidden?: number;
  scheduled?: number;
  missing_media?: number;
  stuck_imports?: number;
  duplicate_fingerprints?: number;
  untitled_chapters?: number;
  revisions?: number;
}

interface RevisionRow {
  id: number;
  source_table: string;
  source_id: string;
  before_data: Record<string, unknown>;
  after_data: Record<string, unknown>;
  changed_at: string;
}

const TABLE_LABELS: Record<string, string> = {
  messages: 'сообщение', memories: 'воспоминание', screenshots: 'скриншот', timeline_elements: 'сцена',
};

async function allRows(table: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

export default function SafetyPanel() {
  const [report, setReport] = useState<IntegrityReport>({});
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const [{ data: integrity, error: integrityError }, { data: history, error: historyError }] = await Promise.all([
      supabase.rpc('admin_integrity_report'),
      supabase.from('story_revisions').select('id,source_table,source_id,before_data,after_data,changed_at').order('changed_at', { ascending: false }).limit(50),
    ]);
    if (integrityError || historyError) setNotice(integrityError?.message ?? historyError?.message ?? 'Не удалось выполнить проверку.');
    else { setReport((integrity ?? {}) as IntegrityReport); setRevisions((history ?? []) as RevisionRow[]); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function restore(revision: RevisionRow) {
    if (!window.confirm(`Вернуть ${TABLE_LABELS[revision.source_table] ?? revision.source_table} к состоянию до этого изменения? Текущее состояние останется в журнале и его тоже можно будет вернуть.`)) return;
    setBusy(true); setNotice('');
    const { data, error } = await supabase.rpc('admin_restore_story_revision', { p_revision_id: revision.id });
    setNotice(error ? error.message : data ? 'Предыдущая версия восстановлена.' : 'Эту версию восстановить не удалось.');
    setBusy(false); await load();
  }

  async function downloadBackup() {
    setBusy(true); setNotice('Собираю резервную копию…');
    try {
      const tables = ['history_settings', 'imports', 'messages', 'media', 'ai_metadata', 'memories', 'screenshots', 'timeline_elements', 'reader_reactions', 'story_revisions'];
      const entries = await Promise.all(tables.map(async (table) => [table, await allRows(table)] as const));
      const backup = { format: 'aiailock-backup', version: 14, createdAt: new Date().toISOString(), note: 'Данные и ссылки на медиа; сами файлы Storage не включены.', tables: Object.fromEntries(entries) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `aiailock-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Резервная копия скачана. Храни её отдельно от сайта.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Не удалось скачать резервную копию.'); }
    finally { setBusy(false); }
  }

  const checks = [
    ['Опубликовано', report.published ?? 0, false],
    ['Запланировано', report.scheduled ?? 0, false],
    ['Скрыто', report.hidden ?? 0, false],
    ['Медиа без файла', report.missing_media ?? 0, true],
    ['Зависшие импорты', report.stuck_imports ?? 0, true],
    ['Дубли fingerprint', report.duplicate_fingerprints ?? 0, true],
    ['Главы без названия', report.untitled_chapters ?? 0, true],
    ['Версий сохранено', report.revisions ?? 0, false],
  ] as const;
  const issueCount = checks.filter(([, , issue]) => issue).reduce((sum, [, value]) => sum + value, 0);

  return <section className="space-y-5">
    <div className="rounded-[28px] bg-gradient-to-br from-[#25151D] to-[#0F0D0E] p-6 text-white shadow-xl"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[2px] text-gold"><ShieldCheck size={15}/> сохранность истории</div><h1 className="mt-2 font-serif text-4xl">Ничего важного не потеряется</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">Проверка целостности, резервная копия и последние версии текста собраны в одном месте.</p><div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void downloadBackup()} className="rounded-xl bg-gold px-4 py-2.5 text-sm font-medium text-[#1A1209]"><Archive size={15} className="mr-1 inline"/>Скачать копию</button><button type="button" disabled={busy} onClick={() => void load()} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm"><RefreshCw size={15} className="mr-1 inline"/>Проверить снова</button></div></div>
    {notice && <div className="rounded-xl border border-black/10 bg-white/75 p-3 text-sm">{notice}</div>}
    <div className={`flex items-center gap-3 rounded-2xl border p-4 ${issueCount ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{issueCount ? <TriangleAlert/> : <CheckCircle2/>}<div><div className="font-medium">{issueCount ? `Найдено предупреждений: ${issueCount}` : 'Структура истории в порядке'}</div><div className="text-xs opacity-60">Проверка ничего не удаляет и не изменяет.</div></div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{checks.map(([label, value, issue]) => <div key={label} className={`rounded-2xl border bg-white/80 p-4 ${issue && value ? 'border-amber-300' : 'border-black/5'}`}><div className="text-[10px] uppercase tracking-[1.5px] opacity-45">{label}</div><div className="mt-2 font-serif text-3xl text-burgundy">{value}</div></div>)}</div>
    <div className="rounded-[24px] border border-black/5 bg-white/85 p-4 sm:p-6"><div className="flex items-center gap-2"><History size={18} className="text-burgundy"/><h2 className="font-serif text-2xl text-burgundy">Последние изменения</h2></div><p className="mt-1 text-xs opacity-45">Сохраняются изменения текста, оформления, дат и публикации. Импорт не засоряет журнал.</p><div className="mt-4 space-y-2">{revisions.length === 0 && <p className="py-8 text-center text-sm opacity-45">Изменений после установки 0014 пока нет.</p>}{revisions.map((revision) => <div key={revision.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/5 bg-[#FBF8F5] p-3"><div className="min-w-0"><div className="text-sm font-medium">{TABLE_LABELS[revision.source_table] ?? revision.source_table}</div><div className="mt-1 text-[10px] opacity-45">{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(revision.changed_at))} · {revision.source_id.slice(0, 8)}</div></div><button type="button" disabled={busy} onClick={() => void restore(revision)} className="rounded-lg border border-burgundy/15 bg-white px-3 py-2 text-xs text-burgundy"><RotateCcw size={13} className="mr-1 inline"/>Вернуть эту версию</button></div>)}</div></div>
  </section>;
}
