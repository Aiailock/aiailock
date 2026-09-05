import { useState } from 'react';
import type { SupportNote } from '@/lib/chapterSupport';
const themes = {
  letter: { background: 'linear-gradient(145deg,#301c28,#19131b)', color: '#fff0e7', borderColor: '#b68561' },
  night: { background: 'linear-gradient(145deg,#171e42,#0c1025)', color: '#e5eaff', borderColor: '#6e7baf' },
  sunrise: { background: 'linear-gradient(145deg,#713c39,#34212e)', color: '#fff4de', borderColor: '#d5a275' },
  minimal: { background: '#151518', color: '#f6f0e8', borderColor: '#5a5052' },
};
export default function SupportCard({ note, preview = false }: { note: SupportNote; preview?: boolean }) {
  const [saved, setSaved] = useState(() => { try { return localStorage.getItem(`support-heart-${note.id}`) === '1'; } catch { return false; } });
  return <aside className="mx-auto my-12 w-[calc(100%-2rem)] max-w-lg rounded-[28px] border px-6 py-10 text-center shadow-xl sm:px-10" style={themes[note.style] ?? themes.letter}>
    <span aria-hidden="true" className="text-2xl">♡</span>
    {note.title && <h2 className="mt-4 break-words font-serif text-2xl">{note.title}</h2>}
    <p className="mt-5 whitespace-pre-wrap break-words font-serif text-xl leading-relaxed">{note.body}</p>
    {note.signature && <p className="mt-6 break-words text-base opacity-80">{note.signature}</p>}
    {!preview && <button type="button" aria-pressed={saved} onClick={() => { const next = !saved; setSaved(next); try { localStorage.setItem(`support-heart-${note.id}`, next ? '1' : '0'); } catch { /* private mode */ } }} className="mt-6 min-h-11 rounded-full border border-current px-5 py-2 text-sm">{saved ? '♥ Мне стало теплее' : '♡ Сохранить тепло'}</button>}
  </aside>;
}
