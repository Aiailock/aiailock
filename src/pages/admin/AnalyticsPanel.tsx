import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, BookOpenCheck, CheckCircle2, Clock3, RefreshCw, Smartphone } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface VisitorRow {
  visitor_id: string;
  first_seen_at: string;
  last_seen_at: string;
  visit_count: number;
  last_element_at: string | null;
  last_element_type: string | null;
  max_position: number;
  max_progress: number;
  completed_at: string | null;
  viewport_width: number | null;
}

interface VisitRow {
  id: string;
  opened_at: string;
  last_seen_at: string;
  last_element_at: string | null;
  last_element_type: string | null;
  max_position: number;
  max_progress: number;
  completed_at: string | null;
}

function when(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Activity; label: string; value: string; hint: string }) {
  return <div className="rounded-[24px] border border-black/5 bg-white/85 p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-[1.8px] opacity-45">{label}</span><Icon size={17} className="text-burgundy/50" /></div><div className="mt-3 font-serif text-3xl text-burgundy">{value}</div><div className="mt-1 text-xs opacity-45">{hint}</div></div>;
}

export default function AnalyticsPanel() {
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [visitorResult, visitResult] = await Promise.all([
      supabase.from('reader_visitors').select('visitor_id,first_seen_at,last_seen_at,visit_count,last_element_at,last_element_type,max_position,max_progress,completed_at,viewport_width').order('last_seen_at', { ascending: false }),
      supabase.from('reader_visits').select('id,opened_at,last_seen_at,last_element_at,last_element_type,max_position,max_progress,completed_at').order('opened_at', { ascending: false }).limit(50),
    ]);
    const issue = visitorResult.error ?? visitResult.error;
    if (issue) setError(issue.message); else { setVisitors((visitorResult.data ?? []) as VisitorRow[]); setVisits((visitResult.data ?? []) as VisitRow[]); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    const last = visitors[0] ?? null;
    return {
      visits: visitors.reduce((sum, row) => sum + row.visit_count, 0),
      progress: visitors.reduce((max, row) => Math.max(max, row.max_progress), 0),
      completed: visitors.some((row) => Boolean(row.completed_at)),
      last,
    };
  }, [visitors]);

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-[28px] bg-gradient-to-br from-[#371525] to-burgundy p-6 text-white shadow-xl">
      <div><div className="text-[10px] uppercase tracking-[2.5px] text-white/45">reader activity</div><h1 className="mt-2 font-serif text-4xl">Она читала?</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">Здесь видны открытия истории и самая дальняя прочитанная точка. Preview администратора не записывается.</p></div>
      <button type="button" onClick={() => void load()} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs"><RefreshCw size={14} className={`mr-1 inline ${loading ? 'animate-spin' : ''}`} />Обновить</button>
    </div>

    {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Статистика появится после применения миграции 0012 и публикации функции reader-analytics. {error}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat icon={Activity} label="Статус" value={summary.last ? 'Да, заходила' : 'Пока нет'} hint={summary.last ? `Последний раз: ${when(summary.last.last_seen_at)}` : 'Открытий ещё не было'} />
      <Stat icon={Clock3} label="Открытия" value={String(summary.visits)} hint={`${visitors.length} ${visitors.length === 1 ? 'устройство' : 'устройства'}`} />
      <Stat icon={BookOpenCheck} label="Дочитано" value={`${summary.progress}%`} hint={summary.last ? `До элемента №${summary.last.max_position}` : 'Пока нет данных'} />
      <Stat icon={CheckCircle2} label="Финал" value={summary.completed ? 'Дочитала' : 'Ещё нет'} hint={summary.completed ? 'История была пройдена до конца' : 'Последняя страница ещё не достигнута'} />
    </div>

    {summary.last && <div className="rounded-[26px] border border-black/5 bg-[#F6EFE0] p-6"><div className="text-[10px] uppercase tracking-[2px] text-burgundy/45">последняя прочитанная точка</div><div className="mt-2 font-serif text-2xl text-burgundy">{summary.last.last_element_type ?? 'элемент истории'} · №{summary.last.max_position}</div><div className="mt-1 text-sm opacity-55">Событие истории от {when(summary.last.last_element_at)} · прогресс {summary.last.max_progress}%</div></div>}

    <div className="rounded-[26px] border border-black/5 bg-white/85 p-5 shadow-sm">
      <div className="flex items-center gap-2"><Smartphone size={17} className="text-burgundy/55" /><h2 className="font-serif text-2xl text-burgundy">Последние открытия</h2></div>
      <div className="mt-4 divide-y divide-black/5">
        {visits.map((visit) => <div key={visit.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[1.2fr_.8fr_.8fr] sm:items-center"><div><div className="font-medium">{when(visit.opened_at)}</div><div className="text-xs opacity-45">активность до {when(visit.last_seen_at)}</div></div><div className="text-xs opacity-60">{visit.last_element_type ?? '—'} · №{visit.max_position}</div><div className="sm:text-right"><span className="rounded-full bg-burgundy/5 px-3 py-1 text-xs text-burgundy">{visit.max_progress}%</span></div></div>)}
        {!loading && visits.length === 0 && <div className="py-10 text-center text-sm opacity-45">Как только reader откроют после обновления, первое посещение появится здесь.</div>}
      </div>
    </div>
  </section>;
}
