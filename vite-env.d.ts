import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles, Check, RotateCcw } from 'lucide-react';
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

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('messages')
      .select('id,sender_name,sent_at,original_text,display_text,ai_metadata(mood,suggested_style,applied_style,model,prompt_version,status,error_message)')
      .eq('is_system_message', false)
      .not('original_text', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(50);
    if (!error) setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function invoke(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke('process-ai', { body });
    setBusy(false);
    if (error || data?.error) {
      setMessage(error?.message ?? String(data?.error));
      return;
    }
    setMessage(`Готово: обработано ${data.processed ?? 0}, кэш ${data.cached ?? 0}, fallback ${data.fallbackCount ?? 0}.`);
    await load();
  }

  return (
    <section className="mt-8 rounded-2xl border border-black/10 bg-white/60 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-burgundy">ИИ и оформление</h2>
          <p className="mt-1 text-xs opacity-60">ИИ предлагает, администратор принимает. Оригинал никогда не теряется.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void invoke({ action: 'process', limit: 100 })} disabled={busy} className="inline-flex items-center gap-2 rounded bg-burgundy px-3 py-2 text-xs text-white disabled:opacity-40">
            <Sparkles size={14} /> Обработать новые
          </button>
          <button onClick={() => void invoke({ action: 'process', limit: 100, force: true })} disabled={busy} className="inline-flex items-center gap-2 rounded border border-black/15 px-3 py-2 text-xs disabled:opacity-40">
            <RefreshCw size={14} /> Переобработать
          </button>
        </div>
      </div>

      {message && <div className="mt-4 rounded bg-black/5 p-3 text-xs">{message}</div>}
      {loading ? <p className="mt-6 text-sm opacity-50">Загружаю сообщения…</p> : (
        <div className="mt-5 space-y-3">
          {rows.map((row) => {
            const meta = Array.isArray(row.ai_metadata) ? row.ai_metadata[0] : row.ai_metadata;
            return (
              <article key={row.id} className="rounded-xl border border-black/10 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs opacity-50">{new Date(row.sent_at).toLocaleString('ru-RU')} · {row.sender_name}</div>
                  <span className="text-xs">{labelMood(meta?.mood ?? null)}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm">{row.original_text}</p>
                {row.display_text && row.display_text !== row.original_text && (
                  <p className="mt-2 whitespace-pre-wrap rounded bg-cream px-3 py-2 font-serif text-base">{row.display_text}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {meta?.status === 'completed' && (
                    <button onClick={() => void invoke({ action: 'apply_suggestion', messageId: row.id })} disabled={busy} className="inline-flex items-center gap-1 rounded border border-black/10 px-2 py-1 text-xs">
                      <Check size={13} /> Принять стиль
                    </button>
                  )}
                  {meta?.applied_style && (
                    <button onClick={() => void invoke({ action: 'clear_applied', messageId: row.id })} disabled={busy} className="inline-flex items-center gap-1 rounded border border-black/10 px-2 py-1 text-xs">
                      <RotateCcw size={13} /> Вернуть предложение
                    </button>
                  )}
                  {meta?.error_message && <span className="text-xs text-red-700">Ошибка: {meta.error_message}</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
