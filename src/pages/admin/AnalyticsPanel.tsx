import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, BookOpenCheck, CheckCircle2, Clock3, Cpu, Globe2, Heart,
  MonitorSmartphone, RefreshCw, Smartphone, Trash2, Wifi,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

type DeviceInfo = Record<string, unknown>;

interface VisitorRow {
  visitor_id: string;
  first_seen_at: string;
  last_seen_at: string;
  visit_count: number;
  last_element_id: string | null;
  last_element_at: string | null;
  last_element_type: string | null;
  last_element_label: string | null;
  last_element_preview: string | null;
  last_chapter: string | null;
  max_position: number;
  max_progress: number;
  completed_at: string | null;
  user_agent: string | null;
  viewport_width: number | null;
  device_info: DeviceInfo | null;
  country_code: string | null;
}

interface VisitRow {
  id: string;
  visitor_id: string;
  opened_at: string;
  last_seen_at: string;
  last_element_id: string | null;
  last_element_at: string | null;
  last_element_type: string | null;
  last_element_label: string | null;
  last_element_preview: string | null;
  last_chapter: string | null;
  max_position: number;
  max_progress: number;
  completed_at: string | null;
  user_agent: string | null;
  viewport_width: number | null;
  device_info: DeviceInfo | null;
  country_code: string | null;
}

interface ReactionRow {
  id: string;
  emoji: string;
  note: string | null;
  updated_at: string;
  element_id: string;
}

interface StoryPointRow {
  element_id: string;
  type: string;
  occurred_at: string;
  story_position: number;
  story_label: string;
  story_preview: string | null;
}

function when(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function sessionLength(opened: string, lastSeen: string) {
  const seconds = Math.max(0, Math.round((new Date(lastSeen).getTime() - new Date(opened).getTime()) / 1000));
  if (seconds < 60) return `${Math.max(1, seconds)} сек.`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} мин.`;
  const hours = Math.floor(seconds / 3600);
  return `${hours} ч. ${Math.round((seconds % 3600) / 60)} мин.`;
}

function stringValue(info: DeviceInfo | null, key: string): string | null {
  const value = info?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(info: DeviceInfo | null, key: string): number | null {
  const value = Number(info?.[key]);
  return Number.isFinite(value) ? value : null;
}

function legacyDevice(userAgent: string | null) {
  if (!userAgent) return 'Неизвестное устройство';
  if (/iPhone/i.test(userAgent)) return 'Apple iPhone';
  if (/iPad/i.test(userAgent)) return 'Apple iPad';
  if (/Android/i.test(userAgent)) return 'Android-устройство';
  if (/Windows/i.test(userAgent)) return 'Компьютер Windows';
  if (/Macintosh|Mac OS/i.test(userAgent)) return 'Компьютер Mac';
  return 'Компьютер';
}

function deviceTitle(row: Pick<VisitorRow, 'device_info' | 'user_agent'> | Pick<VisitRow, 'device_info' | 'user_agent'>) {
  return stringValue(row.device_info, 'model') ?? legacyDevice(row.user_agent);
}

function deviceSubtitle(row: Pick<VisitorRow, 'device_info' | 'user_agent'> | Pick<VisitRow, 'device_info' | 'user_agent'>) {
  const parts = [stringValue(row.device_info, 'deviceType'), stringValue(row.device_info, 'browser'), stringValue(row.device_info, 'os')].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Подробности появятся после следующего открытия истории';
}

function screenText(info: DeviceInfo | null, fallback: number | null) {
  const width = numberValue(info, 'screenWidth');
  const height = numberValue(info, 'screenHeight');
  const viewportWidth = numberValue(info, 'viewportWidth') ?? fallback;
  const viewportHeight = numberValue(info, 'viewportHeight');
  const screen = width && height ? `${width}×${height}` : '—';
  const viewport = viewportWidth ? `${viewportWidth}${viewportHeight ? `×${viewportHeight}` : ''}` : '—';
  return `${screen} · окно ${viewport}`;
}

function hardwareText(info: DeviceInfo | null) {
  const cores = numberValue(info, 'hardwareConcurrency');
  const memory = numberValue(info, 'deviceMemory');
  if (!cores && !memory) return 'Не сообщается браузером';
  return [cores ? `${cores} потоков` : null, memory ? `≈ ${memory} ГБ RAM` : null].filter(Boolean).join(' · ');
}

function networkText(info: DeviceInfo | null) {
  const effective = stringValue(info, 'effectiveConnectionType');
  const type = stringValue(info, 'connectionType');
  const downlink = numberValue(info, 'downlinkMbps');
  const saveData = info?.saveData === true;
  const parts = [type, effective, downlink ? `≈ ${downlink} Мбит/с` : null, saveData ? 'экономия трафика' : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Не сообщается браузером';
}

function PointSummary({ point, label, preview, position, chapter, occurredAt, compact = false }: {
  point?: StoryPointRow;
  label?: string | null;
  preview?: string | null;
  position: number;
  chapter?: string | null;
  occurredAt?: string | null;
  compact?: boolean;
}) {
  const resolvedLabel = point?.story_label ?? label ?? 'Элемент истории';
  const resolvedPreview = point?.story_preview ?? preview;
  const resolvedPosition = position || point?.story_position || 0;
  return <div className="min-w-0">
    {chapter && <div className="mb-1 text-[9px] uppercase tracking-[1.6px] text-burgundy/45">Глава: {chapter}</div>}
    <div className={`${compact ? 'text-xs' : 'font-serif text-2xl'} text-burgundy`}>{resolvedLabel} · №{resolvedPosition || '—'}</div>
    {resolvedPreview && <p className={`${compact ? 'mt-1 line-clamp-2 text-[11px]' : 'mt-2 max-w-3xl text-sm leading-relaxed'} whitespace-pre-wrap text-burgundy/65`}>«{resolvedPreview}»</p>}
    {occurredAt && <div className="mt-1 text-[10px] opacity-40">Событие истории: {when(point?.occurred_at ?? occurredAt)}</div>}
  </div>;
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Activity; label: string; value: string; hint: string }) {
  return <div className="rounded-[24px] border border-black/5 bg-white/85 p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-[1.8px] opacity-45">{label}</span><Icon size={17} className="text-burgundy/50" /></div><div className="mt-3 font-serif text-3xl text-burgundy">{value}</div><div className="mt-1 text-xs opacity-45">{hint}</div></div>;
}

function DeviceFact({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return <div className="rounded-2xl bg-[#FBF8F5] p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[1.4px] text-burgundy/40"><Icon size={12} />{label}</div><div className="mt-1.5 break-words text-xs leading-relaxed text-burgundy/70">{value}</div></div>;
}

export default function AnalyticsPanel() {
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [points, setPoints] = useState<Record<string, StoryPointRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showClear, setShowClear] = useState(false);
  const [includeReactions, setIncludeReactions] = useState(true);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [visitorResult, visitResult, reactionResult] = await Promise.all([
      supabase.from('reader_visitors').select('visitor_id,first_seen_at,last_seen_at,visit_count,last_element_id,last_element_at,last_element_type,last_element_label,last_element_preview,last_chapter,max_position,max_progress,completed_at,user_agent,viewport_width,device_info,country_code').order('last_seen_at', { ascending: false }),
      supabase.from('reader_visits').select('id,visitor_id,opened_at,last_seen_at,last_element_id,last_element_at,last_element_type,last_element_label,last_element_preview,last_chapter,max_position,max_progress,completed_at,user_agent,viewport_width,device_info,country_code').order('opened_at', { ascending: false }).limit(100),
      supabase.from('reader_reactions').select('id,emoji,note,updated_at,element_id').order('updated_at', { ascending: false }).limit(100),
    ]);
    const issue = visitorResult.error ?? visitResult.error ?? reactionResult.error;
    if (issue) {
      setError(issue.message);
      setLoading(false);
      return;
    }
    const nextVisitors = (visitorResult.data ?? []) as VisitorRow[];
    const nextVisits = (visitResult.data ?? []) as VisitRow[];
    const nextReactions = (reactionResult.data ?? []) as ReactionRow[];
    setVisitors(nextVisitors);
    setVisits(nextVisits);
    setReactions(nextReactions);

    const ids = Array.from(new Set([
      ...nextVisitors.map((row) => row.last_element_id),
      ...nextVisits.map((row) => row.last_element_id),
      ...nextReactions.map((row) => row.element_id),
    ].filter((value): value is string => Boolean(value))));
    if (ids.length) {
      const pointResult = await supabase.from('admin_reader_story_points')
        .select('element_id,type,occurred_at,story_position,story_label,story_preview')
        .in('element_id', ids);
      if (pointResult.error) setError(pointResult.error.message);
      else setPoints(Object.fromEntries(((pointResult.data ?? []) as StoryPointRow[]).map((point) => [point.element_id, point])));
    } else setPoints({});
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

  async function clearAnalytics() {
    setClearing(true); setError('');
    const { error: clearError } = await supabase.rpc('admin_clear_reader_analytics', { p_include_reactions: includeReactions });
    if (clearError) setError(clearError.message);
    else {
      setShowClear(false);
      await load();
    }
    setClearing(false);
  }

  const lastPoint = summary.last?.last_element_id ? points[summary.last.last_element_id] : undefined;

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-[28px] bg-gradient-to-br from-[#371525] to-burgundy p-6 text-white shadow-xl">
      <div><div className="text-[10px] uppercase tracking-[2.5px] text-white/45">reader activity</div><h1 className="mt-2 font-serif text-4xl">Она читала?</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">Открытия, устройства, длительность посещений и точное место, до которого она дошла. Preview администратора не записывается.</p></div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setShowClear((value) => !value)} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs text-white/75"><Trash2 size={14} className="mr-1 inline" />Очистить</button>
        <button type="button" onClick={() => void load()} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs"><RefreshCw size={14} className={`mr-1 inline ${loading ? 'animate-spin' : ''}`} />Обновить</button>
      </div>
    </div>

    {showClear && <div className="rounded-[24px] border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm">
      <div className="font-serif text-2xl">Очистить статистику чтения?</div>
      <p className="mt-1 text-sm text-red-950/65">Будут удалены все открытия, список устройств, прогресс и последняя прочитанная точка. История, фото и настройки не изменятся.</p>
      <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl bg-white/70 p-3 text-sm"><input type="checkbox" checked={includeReactions} onChange={(event) => setIncludeReactions(event.target.checked)} className="h-4 w-4 accent-burgundy" /><span>Также удалить все реакции и написанные мнения</span></label>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={clearing} onClick={() => void clearAnalytics()} className="rounded-xl bg-red-800 px-4 py-2.5 text-xs font-medium text-white disabled:opacity-50">{clearing ? 'Очищаю…' : 'Да, очистить'}</button><button type="button" disabled={clearing} onClick={() => setShowClear(false)} className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs">Отмена</button></div>
    </div>}

    {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Примени миграцию 0017 и заново опубликуй функцию reader-analytics. {error}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Stat icon={Activity} label="Статус" value={summary.last ? 'Да, заходила' : 'Пока нет'} hint={summary.last ? `Последний раз: ${when(summary.last.last_seen_at)}` : 'Открытий ещё не было'} />
      <Stat icon={Clock3} label="Открытия" value={String(summary.visits)} hint={`${visitors.length} ${visitors.length === 1 ? 'устройство' : 'устройств'}`} />
      <Stat icon={BookOpenCheck} label="Дочитано" value={`${summary.progress}%`} hint={summary.last ? `До элемента №${summary.last.max_position}` : 'Пока нет данных'} />
      <Stat icon={CheckCircle2} label="Финал" value={summary.completed ? 'Дочитала' : 'Ещё нет'} hint={summary.completed ? 'История была пройдена до конца' : 'Последняя точка ещё не достигнута'} />
      <Stat icon={Heart} label="Мнения" value={String(reactions.length)} hint={reactions[0] ? `Последнее: ${reactions[0].emoji} · ${when(reactions[0].updated_at)}` : 'Реакций пока нет'} />
    </div>

    {summary.last && <div className="rounded-[26px] border border-black/5 bg-[#F6EFE0] p-6">
      <div className="text-[10px] uppercase tracking-[2px] text-burgundy/45">последняя прочитанная точка</div>
      <div className="mt-3"><PointSummary point={lastPoint} label={summary.last.last_element_label ?? summary.last.last_element_type} preview={summary.last.last_element_preview} position={summary.last.max_position} chapter={summary.last.last_chapter} occurredAt={summary.last.last_element_at} /></div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-burgundy/60"><span className="rounded-full bg-white/70 px-3 py-1.5">Прогресс {summary.last.max_progress}%</span><span className="rounded-full bg-white/70 px-3 py-1.5">Зафиксировано {when(summary.last.last_seen_at)}</span><span className="rounded-full bg-white/70 px-3 py-1.5">{deviceTitle(summary.last)}</span></div>
    </div>}

    <div className="rounded-[26px] border border-black/5 bg-white/85 p-5 shadow-sm">
      <div className="flex items-center gap-2"><MonitorSmartphone size={18} className="text-burgundy/55" /><h2 className="font-serif text-2xl text-burgundy">Устройства</h2></div>
      <p className="mt-1 text-xs text-burgundy/45">Одно устройство определяется сохранённым идентификатором браузера. После очистки данных браузера оно появится как новое.</p>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {visitors.map((visitor) => {
          const info = visitor.device_info;
          const timezone = stringValue(info, 'timezone');
          const language = stringValue(info, 'language');
          const point = visitor.last_element_id ? points[visitor.last_element_id] : undefined;
          return <article key={visitor.visitor_id} className="rounded-[22px] border border-burgundy/10 bg-white p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-serif text-xl text-burgundy">{deviceTitle(visitor)}</div><div className="mt-0.5 text-[11px] text-burgundy/45">{deviceSubtitle(visitor)}</div></div><span className="shrink-0 rounded-full bg-burgundy/5 px-3 py-1 text-[10px] text-burgundy">{visitor.visit_count} откр.</span></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <DeviceFact icon={Smartphone} label="Экран" value={screenText(info, visitor.viewport_width)} />
              <DeviceFact icon={Globe2} label="Язык и часовой пояс" value={[language, timezone, visitor.country_code].filter(Boolean).join(' · ') || 'Не сообщается браузером'} />
              <DeviceFact icon={Cpu} label="Устройство" value={hardwareText(info)} />
              <DeviceFact icon={Wifi} label="Соединение" value={networkText(info)} />
            </div>
            <div className="mt-3 rounded-2xl bg-[#F6EFE0]/65 p-3"><PointSummary compact point={point} label={visitor.last_element_label ?? visitor.last_element_type} preview={visitor.last_element_preview} position={visitor.max_position} chapter={visitor.last_chapter} /></div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-burgundy/40"><span>Впервые: {when(visitor.first_seen_at)}</span><span>Последний раз: {when(visitor.last_seen_at)}</span><span>Прогресс: {visitor.max_progress}%</span></div>
            {visitor.user_agent && <details className="mt-3 text-[10px] text-burgundy/40"><summary className="cursor-pointer select-none">Техническая строка браузера</summary><div className="mt-2 break-all rounded-xl bg-black/[.03] p-3 font-mono leading-relaxed">{visitor.user_agent}</div></details>}
          </article>;
        })}
        {!loading && visitors.length === 0 && <div className="py-10 text-center text-sm opacity-45 xl:col-span-2">После следующего открытия истории устройство появится здесь.</div>}
      </div>
    </div>

    {reactions.length > 0 && <div className="rounded-[26px] border border-black/5 bg-white/85 p-5 shadow-sm"><div className="flex items-center gap-2"><Heart size={17} className="text-burgundy/55" /><h2 className="font-serif text-2xl text-burgundy">Её реакции и мнение</h2></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{reactions.slice(0, 60).map((reaction) => { const point = points[reaction.element_id]; return <div key={reaction.id} className="min-w-0 rounded-2xl border border-burgundy/10 bg-[#FBF8F5] px-4 py-3"><div><span className="text-xl">{reaction.emoji}</span><span className="ml-2 text-[10px] opacity-45">{when(reaction.updated_at)}</span></div>{reaction.note && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-burgundy">«{reaction.note}»</p>}<div className="mt-3 border-t border-burgundy/5 pt-3"><PointSummary compact point={point} label="Элемент истории" position={point?.story_position ?? 0} occurredAt={point?.occurred_at} /></div></div>; })}</div></div>}

    <div className="rounded-[26px] border border-black/5 bg-white/85 p-5 shadow-sm">
      <div className="flex items-center gap-2"><Smartphone size={17} className="text-burgundy/55" /><h2 className="font-serif text-2xl text-burgundy">Последние открытия</h2></div>
      <div className="mt-4 divide-y divide-black/5">
        {visits.map((visit) => { const point = visit.last_element_id ? points[visit.last_element_id] : undefined; return <div key={visit.id} className="grid gap-3 py-4 text-sm lg:grid-cols-[1fr_1.25fr_.75fr] lg:items-center"><div><div className="font-medium text-burgundy">{when(visit.opened_at)}</div><div className="mt-0.5 text-xs opacity-45">{deviceTitle(visit)} · {sessionLength(visit.opened_at, visit.last_seen_at)}</div><div className="mt-1 text-[10px] opacity-35">{deviceSubtitle(visit)}</div></div><PointSummary compact point={point} label={visit.last_element_label ?? visit.last_element_type} preview={visit.last_element_preview} position={visit.max_position} chapter={visit.last_chapter} occurredAt={visit.last_element_at} /><div className="lg:text-right"><span className="rounded-full bg-burgundy/5 px-3 py-1 text-xs text-burgundy">{visit.max_progress}%</span>{visit.completed_at && <div className="mt-2 text-[10px] text-emerald-700">Дошла до финала</div>}</div></div>; })}
        {!loading && visits.length === 0 && <div className="py-10 text-center text-sm opacity-45">Как только reader откроют после обновления, первое посещение появится здесь.</div>}
      </div>
    </div>
  </section>;
}
