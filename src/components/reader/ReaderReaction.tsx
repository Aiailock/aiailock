import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MessageCircleHeart, Send, X } from 'lucide-react';
import { recordReaderReaction } from '@/lib/readerApi';

const EMOJIS = ['❤', '🥹', '😊', '✨', '😂', '💔'];

interface StoredFeedback {
  emoji: string;
  note: string;
}

function visitorId() {
  const key = 'for-you-reader-id';
  let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); }
  return value;
}

function readFeedback(key: string): StoredFeedback {
  const raw = localStorage.getItem(key);
  if (!raw) return { emoji: '', note: '' };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredFeedback>;
    return { emoji: typeof parsed.emoji === 'string' ? parsed.emoji : '', note: typeof parsed.note === 'string' ? parsed.note : '' };
  } catch {
    return { emoji: raw, note: '' };
  }
}

export default function ReaderReaction({ elementId, token, dark = false }: { elementId: string; token: string; dark?: boolean }) {
  const storageKey = `for-you-reaction:${elementId}`;
  const pendingKey = `for-you-reaction-pending:${elementId}`;
  const initial = useRef(readFeedback(storageKey)).current;
  const [selected, setSelected] = useState(initial.emoji);
  const [note, setNote] = useState(initial.note);
  const [savedNote, setSavedNote] = useState(initial.note);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thankYou, setThankYou] = useState(false);
  const [error, setError] = useState('');
  const reduced = useReducedMotion();

  useEffect(() => {
    const syncPending = async () => {
      const raw = localStorage.getItem(pendingKey);
      if (!raw || !navigator.onLine) return;
      try {
        const pending = JSON.parse(raw) as StoredFeedback;
        await recordReaderReaction({ visitorId: visitorId(), elementId, emoji: pending.emoji || '💭', note: pending.note || '' }, token);
        localStorage.removeItem(pendingKey);
        setError('');
      } catch { /* it will retry after the next online event */ }
    };
    void syncPending();
    window.addEventListener('online', syncPending);
    return () => window.removeEventListener('online', syncPending);
  }, [elementId, pendingKey, token]);

  async function saveFeedback(emoji = selected || '💭', nextNote = note.trim()) {
    if (busy || (!emoji && !nextNote)) return;
    setSelected(emoji);
    setSavedNote(nextNote);
    setNote(nextNote);
    localStorage.setItem(storageKey, JSON.stringify({ emoji, note: nextNote }));
    localStorage.setItem(pendingKey, JSON.stringify({ emoji, note: nextNote }));
    setBusy(true);
    setError('');
    try {
      await recordReaderReaction({ visitorId: visitorId(), elementId, emoji, note: nextNote }, token);
      localStorage.removeItem(pendingKey);
      setThankYou(true);
      window.setTimeout(() => setThankYou(false), 1800);
    } catch {
      setThankYou(true);
      window.setTimeout(() => setThankYou(false), 1800);
      setError('Сохранено на этом телефоне. Отправлю, когда появится связь.');
    } finally {
      setBusy(false);
    }
  }

  const hasFeedback = Boolean(selected || savedNote);
  const muted = dark ? 'text-white/45' : 'text-burgundy/55';
  const panel = dark ? 'border-white/10 bg-white/[.045]' : 'border-burgundy/10 bg-white/40';

  if (!open) return (
    <div className={`mx-auto mt-7 max-w-[350px] text-center ${dark ? 'text-white' : 'text-burgundy'}`}>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2.5 text-xs transition ${panel}`}>
        <MessageCircleHeart size={15} className="text-gold" />
        <span>{hasFeedback ? 'Изменить моё мнение' : 'Оставить своё мнение'}</span>
        {selected && <span className="text-base">{selected}</span>}
      </button>
      {savedNote && <p className={`mx-auto mt-2 line-clamp-2 max-w-[300px] text-xs leading-relaxed ${muted}`}>«{savedNote}»</p>}
      <div aria-live="polite" className={`mt-1 h-4 font-script text-sm ${muted}`}>{thankYou ? 'сохраню это как ещё один кусочек нашей истории ♡' : ''}</div>
    </div>
  );

  return (
    <div className={`mx-auto mt-7 max-w-[350px] rounded-[22px] border p-4 text-center ${panel} ${dark ? 'text-white' : 'text-burgundy'}`}>
      <div className="flex items-center justify-between gap-3 text-left">
        <div><div className="text-[10px] uppercase tracking-[1.8px] opacity-45">что ты почувствовала?</div><div className="mt-1 text-xs opacity-55">Можно выбрать реакцию и написать несколько слов.</div></div>
        <button type="button" aria-label="Закрыть" onClick={() => setOpen(false)} className="shrink-0 rounded-full p-2 opacity-50"><X size={16}/></button>
      </div>
      <div className="mt-4 flex justify-center gap-1.5">
        {EMOJIS.map((emoji) => <motion.button key={emoji} type="button" disabled={busy} aria-label={`Реакция ${emoji}`} aria-pressed={selected === emoji} onClick={() => void saveFeedback(emoji, note.trim())} whileTap={reduced ? undefined : { scale: 0.84 }} className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg transition ${selected === emoji ? 'border-gold bg-gold/20 shadow-sm' : dark ? 'border-white/10 bg-black/10 opacity-70' : 'border-burgundy/10 bg-white/45 opacity-70'}`}>{emoji}</motion.button>)}
      </div>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={600} placeholder="Напиши, что вспомнилось или что ты думаешь…" className={`mt-4 min-h-24 w-full resize-y rounded-2xl border p-3 text-base outline-none ${dark ? 'border-white/10 bg-black/20 text-white placeholder:text-white/25 focus:border-gold/40' : 'border-burgundy/10 bg-white/65 text-ink placeholder:text-burgundy/30 focus:border-burgundy/30'}`} />
      <div className="mt-2 flex items-center justify-between gap-3"><span className="text-[10px] opacity-35">{note.length}/600</span><button type="button" disabled={busy || (!selected && !note.trim())} onClick={() => void saveFeedback()} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-gold px-4 py-2 text-xs font-medium text-[#1A1209] disabled:opacity-40"><Send size={13}/>{busy ? 'Сохраняю…' : 'Сохранить'}</button></div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <div aria-live="polite" className={`mt-2 min-h-4 font-script text-sm ${muted}`}>{thankYou ? 'сохраню это как ещё один кусочек нашей истории ♡' : ''}</div>
    </div>
  );
}
