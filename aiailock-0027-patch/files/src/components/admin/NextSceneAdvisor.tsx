import { BrainCircuit, Check, Film, ImagePlus, MessageCircleQuestion, Music2, Pause, Quote, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { suggestNextScenes, type NextSceneSuggestion, type SuggestedSceneKind } from '@/lib/nextSceneAdvisor';

const iconByKind: Partial<Record<SuggestedSceneKind, typeof Sparkles>> = {
  gif: Film,
  pause: Pause,
  quote: Quote,
  music: Music2,
  album: ImagePlus,
  interactive: MessageCircleQuestion,
};

export default function NextSceneAdvisor({
  text,
  onApply,
}: {
  text: string;
  onApply: (suggestion: NextSceneSuggestion) => void;
}) {
  const suggestions = useMemo(() => suggestNextScenes(text, 3), [text]);
  return <section className="mt-3 rounded-2xl border border-burgundy/10 bg-gradient-to-br from-[#FFF9F3] via-white to-[#F6E8EC] p-3" aria-label="Умные предложения следующей сцены">
    <div className="flex items-start gap-2">
      <span className="mt-0.5 rounded-xl bg-burgundy p-2 text-gold"><BrainCircuit size={15}/></span>
      <div><div className="text-xs font-medium text-burgundy">Что добавить следующим</div><p className="mt-0.5 text-[10px] leading-relaxed text-burgundy/50">Бесплатный локальный помощник читает только этот черновик. Он предлагает, но ничего не добавляет и не публикует сам.</p></div>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">{suggestions.map((item) => {
      const Icon = iconByKind[item.kind] ?? Sparkles;
      return <button type="button" key={item.id} onClick={() => onApply(item)} className="group rounded-2xl border border-burgundy/10 bg-white/85 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-burgundy/25 hover:shadow-md">
        <span className="flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-burgundy/7 text-burgundy"><Icon size={15}/></span><span className="text-[9px] font-medium text-emerald-700">{Math.round(item.confidence * 100)}%</span></span>
        <span className="mt-2 block text-xs font-medium text-burgundy">{item.title || ({ pause: 'Тихая пауза', quote: 'Большая цитата', gif: 'Подходящая GIF' } as Record<string, string>)[item.kind] || 'Новая сцена'}</span>
        <span className="mt-1 block text-[10px] leading-relaxed text-ink/48">{item.reason}</span>
        <span className="mt-2 flex items-center gap-1 text-[9px] font-medium uppercase tracking-[1px] text-burgundy/55"><Check size={10}/>подготовить черновик</span>
      </button>;
    })}</div>
  </section>;
}
