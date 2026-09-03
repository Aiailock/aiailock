import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, Eye, Gift, Heart, Image as ImageIcon, Mail, RotateCcw, Sparkles, Star } from 'lucide-react';
import type { PublicTimelineRow } from '@/lib/readerApi';
import { getOrCreateReaderVisitorId, recordReaderInteractionAnswer } from '@/lib/readerApi';
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
  question: { button: 'Ответить', closed: 'У меня есть один вопрос' },
  choice: { button: 'Выбрать путь', closed: 'Небольшая развилка в нашей истории' },
  scale: { button: 'Открыть шкалу', closed: 'Измерим то, что не измеряется?' },
  scratch: { button: 'Стереть слой', closed: 'Под защитным слоем спрятаны слова' },
  wish: { button: 'Загадать', closed: 'Здесь можно загадать одно желание' },
  constellation: { button: 'Зажечь звёзды', closed: 'Собери маленькое созвездие' },
};

function InteractionIcon({ kind, open }: { kind: string; open: boolean }) {
  const props = { size: 27, strokeWidth: 1.35 };
  if (open) return <Sparkles {...props} />;
  if (kind === 'gift') return <Gift {...props} />;
  if (kind === 'letter') return <Mail {...props} />;
  if (kind === 'flip' || kind === 'scratch') return <RotateCcw {...props} />;
  if (kind === 'photo-reveal') return <ImageIcon {...props} />;
  if (kind === 'promise' || kind === 'wish') return <Heart {...props} />;
  if (kind === 'constellation') return <Star {...props} />;
  return <Eye {...props} />;
}

function vibrate() {
  if ('vibrate' in navigator) navigator.vibrate(12);
}

export default function InteractiveMoment({ kind, title, text, row, token, dark, fontClass }: Props) {
  const storageKey = `for-you-interaction-${row.element_id}`;
  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as { selected?: number; scale?: number; complete?: boolean }; }
    catch { return {}; }
  }, [storageKey]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(typeof saved.selected === 'number' ? saved.selected : null);
  const [scale, setScale] = useState(saved.scale ?? 7);
  const [scaleDone, setScaleDone] = useState(saved.complete === true && kind === 'scale');
  const [scratch, setScratch] = useState(saved.complete === true && kind === 'scratch' ? 4 : 0);
  const [wished, setWished] = useState(saved.complete === true && kind === 'wish');
  const [stars, setStars] = useState(saved.complete === true && kind === 'constellation' ? 5 : 0);
  const [answerState, setAnswerState] = useState<'idle' | 'saving' | 'saved' | 'error'>(selected !== null ? 'saved' : 'idle');
  const reduced = useReducedMotion();
  const copy = interactionCopy[kind] ?? interactionCopy.spoiler;
  const hasPhoto = Boolean(row.memory_photo_storage_path);
  const options = Array.isArray(row.metadata?.options) ? row.metadata.options.map(String).filter(Boolean).slice(0, 4) : ['Да', 'Конечно', 'Очень', 'Расскажу позже'];
  const results = Array.isArray(row.metadata?.results) ? row.metadata.results.map(String).slice(0, 4) : [text, text, text, text];
  const choiceMode = kind === 'question' || kind === 'choice';
  const completed = choiceMode ? selected !== null : kind === 'scale' ? scaleDone : kind === 'scratch' ? scratch >= 4 : kind === 'wish' ? wished : kind === 'constellation' ? stars >= 5 : open;
  const revealedText = selected !== null ? (results[selected] || text) : text;

  function remember(value: Record<string, unknown>) {
    localStorage.setItem(storageKey, JSON.stringify(value));
    vibrate();
  }

  async function chooseAnswer(index: number) {
    setSelected(index);
    setAnswerState('saving');
    remember({ selected: index, complete: true });
    try {
      await recordReaderInteractionAnswer({ visitorId: getOrCreateReaderVisitorId(), elementId: row.element_id, answerIndex: index }, token);
      setAnswerState('saved');
    } catch {
      // The choice remains on this phone even if analytics is temporarily
      // unavailable; the story itself must never be interrupted.
      setAnswerState('error');
    }
  }

  return (
    <div className="mx-auto max-w-[360px] py-2 text-center">
      <motion.button
        type="button"
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); vibrate(); }}
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
            {choiceMode && selected === null && <div className="grid gap-2"><p className="mb-2 text-xs uppercase tracking-[2px] opacity-45">выбери один ответ</p>{options.map((option, index) => <motion.button whileTap={reduced ? undefined : { scale: .97 }} type="button" key={`${option}-${index}`} onClick={() => void chooseAnswer(index)} className="rounded-2xl border border-gold/25 bg-gold/10 px-4 py-3 font-serif text-lg text-gold transition hover:bg-gold/15"><span className="mr-2 text-[10px] opacity-45">{index + 1}</span>{option}</motion.button>)}</div>}
            {kind === 'scale' && !scaleDone && <div><div className="font-serif text-4xl text-gold">{scale}</div><input aria-label="Шкала чувств" type="range" min="1" max="10" value={scale} onChange={(event) => setScale(Number(event.target.value))} className="mt-5 w-full accent-[#C9A063]"/><div className="mt-2 flex justify-between text-[10px] opacity-45"><span>{options[0]}</span><span>{options[1]}</span></div><button type="button" onClick={() => { setScaleDone(true); remember({ scale, complete: true }); }} className="mt-5 rounded-full border border-gold/30 px-5 py-2 text-xs text-gold">Сохранить чувство</button></div>}
            {kind === 'scratch' && scratch < 4 && <button type="button" onClick={() => { const next = Math.min(4, scratch + 1); setScratch(next); if (next === 4) remember({ complete: true }); else vibrate(); }} className="relative min-h-36 w-full overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,#776b7e,#302936,#91839b)] p-6"><span className="font-serif text-xl text-white/80">Касайся, чтобы проявить</span><span className="mt-4 block text-xs uppercase tracking-[2px] text-white/50">{scratch * 25}%</span><span className="absolute inset-x-0 bottom-0 h-1 bg-white/10"><span className="block h-full bg-gold" style={{ width: `${scratch * 25}%` }}/></span></button>}
            {kind === 'wish' && !wished && <button type="button" onClick={() => { setWished(true); remember({ complete: true }); }} className="group py-5"><span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-3xl text-gold transition group-hover:scale-105">☆</span><span className="mt-4 block font-script text-xl text-gold/80">закрой глаза и нажми</span></button>}
            {kind === 'constellation' && stars < 5 && <div><p className="mb-5 text-xs uppercase tracking-[2px] opacity-45">зажги пять звёзд</p><div className="flex justify-center gap-3">{Array.from({ length: 5 }, (_, index) => <button type="button" aria-label={`Звезда ${index + 1}`} key={index} disabled={index > stars} onClick={() => { const next = Math.max(stars, index + 1); setStars(next); if (next === 5) remember({ complete: true }); else vibrate(); }} className={`text-3xl transition ${index < stars ? 'scale-110 text-gold drop-shadow-[0_0_10px_rgba(201,160,99,.8)]' : 'text-white/20'}`}>★</button>)}</div></div>}

            {completed && <motion.div initial={reduced ? undefined : { opacity: 0, scale: .94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} className={choiceMode ? 'rounded-[24px] border border-gold/20 bg-gradient-to-br from-gold/15 via-white/5 to-blush/10 p-5 shadow-inner' : ''}>
              {hasPhoto && <div className="mb-6 overflow-hidden rounded-2xl"><ReaderMedia row={row} token={token} /></div>}
              {choiceMode && selected !== null && <><CheckCircle2 size={32} className="mx-auto mb-3 text-gold"/><div className="text-[9px] uppercase tracking-[2px] text-gold/60">твой ответ</div><div className="mt-1 font-serif text-xl text-gold">{options[selected]}</div><div className="mx-auto my-4 h-px w-12 bg-gold/30"/></>}
              {kind === 'scale' && <div className="mb-4 text-[10px] uppercase tracking-[2px] text-gold/65">твой ответ — {scale} из 10</div>}
              {kind === 'wish' && <div aria-hidden className="mb-4 flex justify-center gap-2 text-gold">✦ ✧ ★ ✧ ✦</div>}
              <p className={`whitespace-pre-wrap text-[22px] leading-[1.65] ${fontClass}`}>{revealedText}</p>
              {choiceMode && <div className="mt-4"><div className="text-[9px] opacity-35">{answerState === 'saving' ? 'сохраняю ответ…' : answerState === 'saved' ? 'ответ сохранён' : answerState === 'error' ? 'ответ сохранён на этом телефоне' : ''}</div><button type="button" onClick={() => { setSelected(null); setAnswerState('idle'); localStorage.removeItem(storageKey); }} className="mt-3 rounded-full border border-current/10 px-4 py-2 text-[10px] opacity-55">Выбрать другой вариант</button></div>}
              {(kind === 'promise' || kind === 'wish') && <div className="mt-5 text-2xl text-gold">♡</div>}
            </motion.div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
