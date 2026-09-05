import { supabase } from './supabaseClient';
export const READER_CHANGED = 'reader-content-changed';
export const READER_RESET = 'reader-progress-reset';
export function watchReader(onStatus: (status: string) => void) {
  let stopped = false;
  let busy = false;
  let revision: number | null = null;
  let epoch: number | null = null;
  const accept = (next: { revision: number; analytics_epoch: number }) => {
    if (stopped) return;
    if (revision !== null && next.revision !== revision) window.dispatchEvent(new Event(READER_CHANGED));
    if (epoch !== null && next.analytics_epoch !== epoch) window.dispatchEvent(new Event(READER_RESET));
    revision = next.revision; epoch = next.analytics_epoch;
    onStatus('Изменения появляются автоматически');
  };
  const check = async () => {
    if (stopped || busy || document.hidden) return;
    if (!navigator.onLine) { onStatus('Нет сети · ждём соединения'); return; }
    busy = true;
    try {
      const { data, error } = await supabase.from('reader_live_state').select('revision,analytics_epoch').eq('id', true).single();
      if (error) { onStatus('Автообновление недоступно · проверь установку 0027'); return; }
      accept(data);
    } catch { if (!stopped) onStatus('Ждём соединения'); }
    finally { busy = false; }
  };
  const channel = supabase.channel(`reader-live-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reader_live_state' }, () => { void check(); })
    .subscribe();
  void check();
  const timer = window.setInterval(() => { void check(); }, 5000);
  const focus = () => { void check(); };
  window.addEventListener('online', focus);
  window.addEventListener('focus', focus);
  document.addEventListener('visibilitychange', focus);
  return () => { stopped = true; window.clearInterval(timer); void supabase.removeChannel(channel); window.removeEventListener('online', focus); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
}
