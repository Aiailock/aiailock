import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Eye, Gift, Heart, Image as ImageIcon, Mail, RotateCcw, Sparkles } from 'lucide-react';
import type { PublicTimelineRow } from '@/lib/readerApi';
import ReaderMedia from './ReaderMedia';

interface Props {
  kind: string;
  title: string | null;
  text: string;
  row: PublicTimelineRow;
  token: string;
  dark: boolean;
  fontClass: string;
}

const interactionCopy: Record<string, { button: string; closed: string }> = {
  spoiler: { button: 'Раскрыть секрет', closed: 'Здесь спрятано кое-что важное' },
  gift: { button: 'Открыть подарок', closed: 'Маленький подарок для тебя' },
  letter: { button: 'Открыть письмо', closed: 'Это письмо ждало именно тебя' },
  flip: { button: 'Перевернуть карточку', closed: 'Нажми и посмотри, что с другой стороны' },
  'photo-reveal': { button: 'Проявить воспоминание', closed: 'Фотография пока скрыта' },
  promise: { button: 'Коснуться сердца', closed: 'Одно обещание для тебя' },
};

function InteractionIcon({ kind, open }: { kind: string; open: boolean }) {
  const props = { size: 27, strokeWidth: 1.35 };
  if (open) return <Sparkles {...props} />;
  if (kind === 'gift') return <Gift {...props} />;
  if (kind === 'letter') return <Mail {...props} />;
  if (kind === 'flip') return <RotateCcw {...props} />;
  if (kind === 'photo-reveal') return <ImageIcon {...props} />;
  if (kind === 'promise') return <Heart {...props} />;
  return <Eye {...props} />;
}

export default function InteractiveMoment({ kind, title, text, row, token, dark, fontClass }: Props) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const copy = interactionCopy[kind] ?? interactionCopy.spoiler;
  const hasPhoto = Boolean(row.memory_photo_storage_path);

  return (
    <div className="mx-auto max-w-[360px] py-2 text-center">
      <motion.button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        whileTap={reduced ? undefined : { scale: 0.97 }}
        className={`group relative w-full overflow-hidden rounded-[30px] border px-6 py-8 shadow-[0_20px_50px_-32px_rgba(74,27,47,.65)] backdrop-blur-sm transition ${dark ? 'border-white/15 bg-white/10 text-white' : 'border-burgundy/10 bg-white/65 text-burgundy'}`}
      >
        <span aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-blush/25 blur-2xl" />
        <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-current/15 bg-white/20 transition group-hover:scale-105"><InteractionIcon kind={kind} open={open} /></span>
        <span className="relative mt-5 block text-[10px] uppercase tracking-[2.4px] opacity-50">интерактивный момент</span>
        <span className="relative mt-2 block font-serif text-2xl">{open ? (title || 'Для тебя') : copy.closed}</span>
        <span className="relative mt-4 inline-flex rounded-full border border-current/15 px-4 py-2 text-xs">{open ? 'Свернуть' : copy.button}</span>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduced ? undefined : { opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className={`relative -mt-3 rounded-b-[30px] border border-t-0 px-6 pb-7 pt-8 shadow-sm ${dark ? 'border-white/10 bg-black/10 text-white' : 'border-burgundy/10 bg-white/55 text-ink'}`}
          >
            {hasPhoto && <div className="mb-6 overflow-hidden rounded-2xl"><ReaderMedia row={row} token={token} /></div>}
            <p className={`whitespace-pre-wrap text-[22px] leading-[1.65] ${fontClass}`}>{text}</p>
            {kind === 'promise' && <div className="mt-5 text-2xl text-gold">♡</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
