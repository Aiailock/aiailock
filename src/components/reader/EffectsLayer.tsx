import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';

// Decorative overlays ported from reader-prototype.html's particle systems
// (petals / confetti / snow / rain-drop / pixel-heart / gif-sprite), rebuilt
// as a single reusable layer so any timeline element can request one via
// `style.decoration` (see ElementStyle in src/types/timeline.ts), instead of
// each zone hard-coding its own particle script the way the prototype did.
//
// Supported decoration ids: 'petals' | 'confetti' | 'snow' | 'rain' |
// 'pixel-hearts' | 'fireflies' | 'stardust' | 'leaves' | 'candles' | 'custom-gif'

export type DecorationKind = 'petals' | 'confetti' | 'snow' | 'rain' | 'pixel-hearts' | 'fireflies' | 'stardust' | 'leaves' | 'candles' | 'custom-gif';

const LEAF_GLYPHS = ['🍁', '🍂', '🍃'];

function seededRandoms(count: number, seed: number) {
  // Deterministic pseudo-random so re-renders (and SSR-less hydration) don't
  // jitter particle positions between passes.
  let s = seed || 1;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: count }, () => rand());
}

const CONFETTI_COLORS = ['#E85A80', '#F4C89A', '#7CF7C4', '#C8BFE7', '#FFD86B'];

export default function EffectsLayer({ decorations, seed = 1, gifUrl }: { decorations?: string[] | null; seed?: number; gifUrl?: string | null }) {
  const reduced = useReducedMotion();
  const list = (decorations ?? []).filter(Boolean) as DecorationKind[];

  const petalRands = useMemo(() => seededRandoms(7, seed + 1), [seed]);
  const confettiRands = useMemo(() => seededRandoms(16, seed + 2), [seed]);
  const snowRands = useMemo(() => seededRandoms(22, seed + 3), [seed]);
  const rainRands = useMemo(() => seededRandoms(26, seed + 4), [seed]);
  const heartRands = useMemo(() => seededRandoms(9, seed + 5), [seed]);
  const fireflyRands = useMemo(() => seededRandoms(14, seed + 6), [seed]);
  const stardustRands = useMemo(() => seededRandoms(18, seed + 7), [seed]);
  const leafRands = useMemo(() => seededRandoms(8, seed + 8), [seed]);
  const candleRands = useMemo(() => seededRandoms(3, seed + 9), [seed]);
  const gifRands = useMemo(() => seededRandoms(3, seed + 10), [seed]);

  if (reduced || list.length === 0) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {list.includes('petals') && petalRands.map((r, i) => (
        <span key={`p${i}`} className="petal" style={{ left: `${r * 100}%`, fontSize: `${10 + r * 8}px`, animationDuration: `${14 + r * 10}s`, animationDelay: `${r * 10}s`, color: '#E9A9B8' }}>❀</span>
      ))}
      {list.includes('confetti') && confettiRands.map((r, i) => (
        <span key={`c${i}`} className="confetti" style={{ left: `${r * 100}%`, background: CONFETTI_COLORS[i % CONFETTI_COLORS.length], animationDuration: `${3 + r * 2.5}s`, animationDelay: `${r * 3}s`, transform: `rotate(${Math.floor(r * 360)}deg)` }} />
      ))}
      {list.includes('snow') && snowRands.map((r, i) => {
        const size = 3 + r * 4;
        return <span key={`s${i}`} className="snow" style={{ width: size, height: size, left: `${r * 100}%`, animationDuration: `${6 + r * 6}s`, animationDelay: `${r * 6}s` }} />;
      })}
      {list.includes('rain') && rainRands.map((r, i) => (
        <span key={`r${i}`} className="rain-drop" style={{ left: `${r * 100}%`, animationDuration: `${0.6 + r * 0.5}s`, animationDelay: `${r * 2}s` }} />
      ))}
      {list.includes('pixel-hearts') && heartRands.map((r, i) => (
        <span key={`h${i}`} className="pixel-heart" style={{ left: `${r * 100}%`, top: `${(r * 80) + 5}%`, animationDelay: `${r * 2}s` }}>♥</span>
      ))}
      {list.includes('fireflies') && fireflyRands.map((r, i) => (
        <span key={`f${i}`} className="firefly" style={{ left: `${r * 100}%`, top: `${(r * 90) + 5}%`, animationDuration: `${3 + r * 3}s`, animationDelay: `${r * 4}s` }} />
      ))}
      {list.includes('stardust') && stardustRands.map((r, i) => (
        <span key={`d${i}`} className="stardust" style={{ left: `${r * 100}%`, top: `${(r * 90) + 5}%`, animationDuration: `${4 + r * 3}s`, animationDelay: `${r * 3}s` }} />
      ))}
      {list.includes('leaves') && leafRands.map((r, i) => (
        <span key={`l${i}`} className="leaf" style={{ left: `${r * 100}%`, animationDuration: `${11 + r * 9}s`, animationDelay: `${r * 9}s` }}>{LEAF_GLYPHS[i % LEAF_GLYPHS.length]}</span>
      ))}
      {list.includes('candles') && candleRands.map((r, i) => (
        <span key={`cn${i}`} className="candle-glow" style={{ left: `${18 + r * 64}%`, animationDuration: `${2.2 + r * 1.4}s`, animationDelay: `${r * 1.5}s` }} />
      ))}
      {list.includes('custom-gif') && gifUrl && gifRands.map((r, i) => (
        <img key={`g${i}`} src={gifUrl} alt="" aria-hidden="true" className="gif-sprite" style={{ left: `${10 + r * 70}%`, top: `${10 + r * 60}%`, animationDuration: `${5 + r * 4}s`, animationDelay: `${r * 3}s` }} />
      ))}
    </div>
  );
}
