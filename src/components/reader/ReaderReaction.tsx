import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { recordReaderReaction } from '@/lib/readerApi';

const EMOJIS = ['❤', '🥹', '😊', '✨', '😂', '💔'];

function visitorId() {
  const key = 'for-you-reader-id';
  let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); }
  return value;
}

export default function ReaderReaction({ elementId, token, dark = false }: { elementId: string; token: string; dark?: boolean }) {
  const storageKey = `for-you-reaction:${elementId}`;
  const [selected, setSelected] = useState(() => localStorage.getItem(storageKey) ?? '');
  const [busy, setBusy] = useState(false);
  const [thankYou, setThankYou] = useState(false);
  const reduced = useReducedMotion();

  async function react(emoji: string) {
    if (busy) return;
    const previous = selected;
    setSelected(emoji);
    setBusy(true);
    try {
      await recordReaderReaction({ visitorId: visitorId(), elementId, emoji }, token);
      localStorage.setItem(storageKey, emoji);
      setThankYou(true);
      window.setTimeout(() => setThankYou(false), 1800);
    } catch {
      setSelected(previous);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`mx-auto mt-8 max-w-[340px] text-center ${dark ? 'text-white' : 'text-burgundy'}`}>
      <div className="text-[10px] uppercase tracking-[1.8px] opacity-35">что ты почувствовала?</div>
      <div className="mt-3 flex justify-center gap-1.5">
        {EMOJIS.map((emoji) => <motion.button key={emoji} type="button" disabled={busy} aria-label={`Реакция ${emoji}`} aria-pressed={selected === emoji} onClick={() => void react(emoji)} whileTap={reduced ? undefined : { scale: 0.82 }} className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg transition ${selected === emoji ? 'border-gold bg-gold/20 shadow-sm' : dark ? 'border-white/10 bg-white/5 opacity-65' : 'border-burgundy/10 bg-white/35 opacity-65'}`}>{emoji}</motion.button>)}
      </div>
      <div aria-live="polite" className="mt-2 h-4 font-script text-sm opacity-55">{thankYou ? 'я это почувствовал ♡' : ''}</div>
    </div>
  );
}

