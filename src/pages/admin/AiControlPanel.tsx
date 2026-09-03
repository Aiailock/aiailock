import { useEffect, useState } from 'react';
import { AlertTriangle, Check, KeyRound, PenLine, RefreshCw, RotateCcw, Save, Sparkles, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface Row {
  id: string;
  sender_name: string;
  sent_at: string;
  original_text: string | null;
  display_text: string | null;
  ai_metadata: {
    mood: string | null;
    suggested_style: Record<string, unknown> | null;
    applied_style: Record<string, unknown> | null;
    model: string | null;
    prompt_version: string | null;
    status: string;
    error_message: string | null;
  } | Array<{ mood: string | null; suggested_style: Record<string, unknown> | null; applied_style: Record<string, unknown> | null; model: string | null; prompt_version: string | null; status: string; error_message: string | null }> | null;
}

function labelMood(mood: string | null) {
  const map: Record<string, string> = {
    normal: 'обычное', romantic: 'романтика', sad: 'грусть', funny: 'юмор', deep: 'глубокое',
    night: 'ночь', memory: 'воспоминание', important: 'важное', hopeful: 'надежда', neutral: 'нейтральное',
  };
  return mood ? map[mood] ?? mood : 'не определено';
}

export default function AiControlPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('messages')
      .select('id,sender_name,sent_at,original_text,display_text,ai_metadata(mood,suggested_style,applied_style,model,prompt_version,status,error_message)')
      .eq('is_system_message', false)
      .not('original_text', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(80);
    if (!error) setRows((data ?? []) as unknown as Row[]);
    else setMessage(error.message);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function invoke(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke('process-ai', {
      body: { ...body, apiKey: apiKey.trim() || undefined },
    });
    setBusy(false);
    if (error || data?.error) {
      let detail = '';
      const context = (error as { context?: unknown } | null)?.context;
      if (context instanceof Response) {
        const payload = await context.clone().json().catch(() => ({})) as { error?: unknown };
        if (typeof payload.error === 'string') detail = payload.error;
      }
      setMessage(detail || error?.message || String(data?.error));
      return;
    }
    const processed = Number(data.processed ?? 0);
    const changed = Number(data.changed ?? 0);
    const unchanged = Number(data.unchanged ?? 0);
    const fallbackCount = Number(data.fallbackCount ?? 0);
    if (processed === 0 && Number(data.failed ?? 0) === 0) {
      setMessage('Все сообщения уже проверены этой версией редактора. Новых или изменённых текстов нет.');
    } else {
      setMessage(`Готово: проверено ${processed}, улучшено ${changed}, оставлено без изменений ${unchanged}${fallbackCount ? ` · без облачного ИИ ${fallbackCount}` : ''}${data.failed ? ` · ошибок ${data.failed}` : ''}.`);
    }
    await load();
  }

  async function saveManual(row: Row) {
    const value = editingText.trim();
    if (!value) { setMessage('Текст не может быть пустым.'); return; }
    setBusy(true);
    const { error } = await supabase.from('messages').update({ display_text: value }).eq('id', row.id);
    setBusy(false);
    if (error) setMessage(error.message);
    else {
      setEditingId(null);
      setMessage('Текст сохранён. Оригинал остался в базе и доступен для сравнения.');
      await load();
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] bg-gradient-to-br from-[#351523] to-[#171016] p-5 text-white shadow-xl sm:p-6">
        <div className="text-[10px] uppercase tracking-[2.4px] text-gold/75">бережный редактор</div>
        <h1 className="mt-2 font-serif text-4xl">ИИ и оформление</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">Проверяет новые тексты, исправляет пунктуацию и небольшие опечатки. Ничего не публикуется пустым: если правка не нужна, это будет явно написано.</p>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <label className="block text-sm font-medium text-burgundy"><KeyRound size={14} className="mr-1 inline" />Ключ OpenRouter — необязательно
            <input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-or-v1-…" className="mt-2 w-full rounded-xl border p-3 text-sm" />
          </label>
          <p className="mt-2 text-[11px] leading-relaxed opacity-50">С ключом используется бесплатный облачный маршрутизатор. Ключ действует только в этой вкладке и не сохраняется. Без ключа работает безопасная локальная проверка оформления.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex">
          <button onClick={() => void invoke({ action: 'process', limit: 100 })} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-burgundy px-4 py-3 text-xs text-white disabled:opacity-40">
            <Sparkles size={14} /> Обработать новые
          </button>
          <button onClick={() => void invoke({ action: 'process', limit: 100, force: true })} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/15 px-4 py-3 text-xs disabled:opacity-40">
            <RefreshCw size={14} /> Переобработать
          </button>
        </div>
      </div>
      </div>

      {message && <div className="rounded-2xl border border-black/8 bg-white/80 p-4 text-sm shadow-sm">{message}</div>}
      {loading ? <p className="mt-6 text-sm opacity-50">Загружаю сообщения…</p> : (
        <div className="space-y-3">
          {rows.map((row) => {
            const meta = Array.isArray(row.ai_metadata) ? row.ai_metadata[0] : row.ai_metadata;
            const shownText = row.display_text || row.original_text || '';
            const changed = Boolean(row.display_text && row.original_text && row.display_text.trim() !== row.original_text.trim());
            return (
              <article key={row.id} className="rounded-2xl border border-black/10 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs opacity-50">{new Date(row.sent_at).toLocaleString('ru-RU')} · {row.sender_name}</div>
                  <span className="shrink-0 rounded-full bg-[#F6EFE0] px-2.5 py-1 text-[10px] text-burgundy">{labelMood(meta?.mood ?? null)}</span>
                </div>
                {editingId === row.id ? <div className="mt-3 rounded-2xl bg-[#F6EFE0] p-3">
                  <textarea autoFocus value={editingText} onChange={(event) => setEditingText(event.target.value)} className="min-h-32 w-full rounded-xl border bg-white p-3 text-base leading-relaxed" />
                  <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => void saveManual(row)} className="rounded-xl bg-burgundy px-3 py-2.5 text-xs text-white"><Save size={13} className="mr-1 inline" />Сохранить</button><button type="button" disabled={busy} onClick={() => setEditingId(null)} className="rounded-xl border bg-white px-3 py-2.5 text-xs"><X size={13} className="mr-1 inline" />Отмена</button></div>
                </div> : <>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed opacity-65">{row.original_text}</p>
                  <div className={`mt-3 rounded-xl px-3 py-3 ${changed ? 'bg-cream' : 'border border-dashed border-black/10 bg-black/[.018]'}`}>
                    <div className="mb-1 text-[9px] uppercase tracking-[1.4px] opacity-40">{changed ? 'вариант редактора' : 'проверено · изменений не нужно'}</div>
                    <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{shownText || 'Текст отсутствует'}</p>
                  </div>
                </>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {editingId !== row.id && <button type="button" onClick={() => { setEditingId(row.id); setEditingText(shownText); }} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-3 py-2 text-xs"><PenLine size={13} />Исправить вручную</button>}
                  {meta?.status === 'completed' && (
                    <button onClick={() => void invoke({ action: 'apply_suggestion', messageId: row.id })} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-3 py-2 text-xs">
                      <Check size={13} /> Принять стиль
                    </button>
                  )}
                  {meta?.applied_style && (
                    <button onClick={() => void invoke({ action: 'clear_applied', messageId: row.id })} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-3 py-2 text-xs">
                      <RotateCcw size={13} /> Вернуть предложение
                    </button>
                  )}
                  {meta?.error_message && <span className="flex items-center gap-1 text-xs text-red-700"><AlertTriangle size={13} />Ошибка: {meta.error_message}</span>}
                </div>
              </article>
            );
          })}
          {rows.length === 0 && <div className="rounded-2xl border border-dashed border-black/10 bg-white/60 p-10 text-center text-sm opacity-50">Текстовых сообщений пока нет.</div>}
        </div>
      )}
    </section>
  );
}
