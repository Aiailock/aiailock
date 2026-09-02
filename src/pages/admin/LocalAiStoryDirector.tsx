import { useMemo, useRef, useState } from 'react';
import {
  Check,
  Eye,
  Loader2,
  MonitorSmartphone,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import SongSearch from '@/components/admin/SongSearch';
import type { SongSearchResult } from '@/lib/songSearch';
import CommonsMediaSearch, { type CommonsAsset } from '@/components/admin/CommonsMediaSearch';
import {
  buildDirectorPrompt,
  fallbackSuggestions,
  occurredAtForGap,
  parseDirectorResponse,
  selectCandidateGaps,
  type CandidateGap,
  type DirectorMode,
  type DirectorSuggestionType,
  type GeneratedSuggestion,
  type StoryContextRow,
} from '@/lib/localStoryDirector';

type LocalEngine = {
  chat: { completions: { create: (request: Record<string, unknown>) => Promise<{ choices?: Array<{ message?: { content?: string | null } }> }> } };
  unload?: () => Promise<void> | void;
};

interface SuggestionRow {
  id: string;
  batch_id: string;
  left_element_id: string | null;
  right_element_id: string | null;
  suggested_type: DirectorSuggestionType;
  title: string | null;
  body: string | null;
  reason: string | null;
  asset_query: string | null;
  asset_url: string | null;
  confidence: number;
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
  state: 'draft' | 'approved' | 'rejected' | 'staged' | 'published';
  sort_order: number;
  occurred_at: string;
  staged_element_id: string | null;
}

const WEBLLM_MODULE = 'https://esm.run/@mlc-ai/web-llm@0.2.82';
const MODEL_OPTIONS = [
  { id: 'Qwen3-0.6B-q4f16_1-MLC', label: 'Лёгкая · Qwen3 0.6B', hint: 'Быстрее и легче для обычного ноутбука.' },
  { id: 'Qwen3-1.7B-q4f16_1-MLC', label: 'Лучше · Qwen3 1.7B', hint: 'Лучше понимает контекст, но требует больше памяти.' },
] as const;

const TYPE_LABEL: Record<DirectorSuggestionType, string> = {
  pause: 'Пауза',
  chapter: 'Глава',
  quote: 'Цитата',
  gif: 'GIF',
  image: 'Картинка',
  video: 'Видео',
  music: 'Музыка',
  link: 'Ссылка',
};

function isWebGpuAvailable() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

async function readAllContext(): Promise<StoryContextRow[]> {
  const all: StoryContextRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('admin_ai_story_context')
      .select('*')
      .order('display_order', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    all.push(...((data ?? []) as StoryContextRow[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return all;
}

function normalizeSuggestion(generated: GeneratedSuggestion, gap: CandidateGap) {
  return {
    left_element_id: gap.left.element_id,
    right_element_id: gap.right.element_id,
    suggested_type: generated.type as DirectorSuggestionType,
    title: generated.title?.trim() || null,
    body: generated.body?.trim() || null,
    reason: generated.reason?.trim() || gap.signals.join(' · ') || null,
    asset_query: generated.assetQuery?.trim() || null,
    asset_url: null,
    confidence: Math.max(0, Math.min(1, Number(generated.confidence ?? .5))),
    style: { zone: 'default', spacing: 'cinematic', animation: 'fade-up', hideTime: true },
    metadata: {},
    state: 'draft' as const,
    occurred_at: occurredAtForGap(gap),
  };
}

export default function LocalAiStoryDirector() {
  const engineRef = useRef<LocalEngine | null>(null);
  const [modelId, setModelId] = useState<string>(MODEL_OPTIONS[0].id);
  const [mode, setMode] = useState<DirectorMode>('careful');
  const [progress, setProgress] = useState('');
  const [modelReady, setModelReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<'draft' | 'staged' | 'published'>('draft');
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [songSelections, setSongSelections] = useState<Record<string, SongSearchResult | null>>({});
  const [commonsSelections, setCommonsSelections] = useState<Record<string, CommonsAsset | null>>({});

  const selectedCount = selected.size;
  const needsAsset = useMemo(
    () => suggestions.filter((row) => selected.has(row.id) && ['gif','image','video','music','link'].includes(row.suggested_type) && !row.asset_url),
    [selected, suggestions],
  );

  async function loadModel() {
    if (!isWebGpuAvailable()) {
      setNotice('WebGPU недоступен. Структурный бесплатный анализ будет работать, но смысловые тексты локальный ИИ на этом устройстве не сгенерирует.');
      return;
    }
    setBusy(true);
    setNotice('');
    setProgress('Подключаю локальный движок…');
    try {
      if (engineRef.current?.unload) await engineRef.current.unload();
      engineRef.current = null;
      setModelReady(false);
      const webllm = await import(/* @vite-ignore */ WEBLLM_MODULE) as {
        CreateMLCEngine: (id: string, options: Record<string, unknown>) => Promise<LocalEngine>;
      };
      const engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (report: { text?: string; progress?: number }) => {
          const percent = typeof report.progress === 'number' ? ` ${Math.round(report.progress * 100)}%` : '';
          setProgress(`${report.text ?? 'Загружаю модель…'}${percent}`);
        },
        logLevel: 'WARN',
      });
      engineRef.current = engine;
      setModelReady(true);
      setProgress('Локальный ИИ готов. После первой загрузки модель кэшируется браузером.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось загрузить локальную модель.');
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  async function askLocalAi(gaps: CandidateGap[]): Promise<GeneratedSuggestion[]> {
    const engine = engineRef.current;
    if (!engine) return fallbackSuggestions(gaps);
    const result: GeneratedSuggestion[] = [];
    for (let i = 0; i < gaps.length; i += 2) {
      const chunk = gaps.slice(i, i + 2);
      setProgress(`ИИ читает подходящие переходы: ${Math.min(i + chunk.length, gaps.length)} / ${gaps.length}`);
      try {
        const response = await engine.chat.completions.create({
          messages: [
            { role: 'system', content: 'Отвечай только валидным JSON-массивом. Не используй markdown.' },
            { role: 'user', content: buildDirectorPrompt(chunk, mode) },
          ],
          temperature: 0.35,
          top_p: 0.85,
          max_tokens: 900,
        });
        const parsed = parseDirectorResponse(response.choices?.[0]?.message?.content ?? '');
        result.push(...(parsed.length ? parsed : fallbackSuggestions(chunk)));
      } catch {
        result.push(...fallbackSuggestions(chunk));
      }
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    return result;
  }

  async function analyze() {
    setBusy(true);
    setNotice('');
    setShowPreview(false);
    try {
      setProgress('Читаю уже опубликованную историю и считаю её ритм…');
      const context = await readAllContext();
      if (context.length < 2) throw new Error('В истории пока недостаточно элементов для анализа.');
      const gaps = selectCandidateGaps(context, mode);
      if (gaps.length === 0) {
        setSuggestions([]);
        setBatchId(null);
        setNotice('ИИ-режиссёру нечего добавлять: по выбранной интенсивности явных слабых переходов не найдено. Это хороший результат.');
        return;
      }

      const generated = await askLocalAi(gaps);
      const gapMap = new Map(gaps.map((gap) => [gap.id, gap]));
      const usable = generated.filter((item) => item.type !== 'none' && gapMap.has(item.gapId));
      if (usable.length === 0) {
        setNotice('После чтения контекста ИИ решил ничего не добавлять. Можно переключить интенсивность на «Умеренно», если хочешь больше предложений.');
        return;
      }

      const { data: batch, error: batchError } = await supabase
        .from('ai_story_batches')
        .insert({ mode, model_id: engineRef.current ? modelId : 'heuristic-fallback', settings: { sourceCount: context.length, candidateCount: gaps.length } })
        .select('id,status')
        .single();
      if (batchError) throw batchError;

      const rows = usable.map((item, index) => {
        const gap = gapMap.get(item.gapId)!;
        return { batch_id: batch.id, sort_order: index, ...normalizeSuggestion(item, gap) };
      });
      const { data, error } = await supabase.from('ai_story_suggestions').insert(rows).select('*').order('sort_order');
      if (error) throw error;
      const loaded = (data ?? []) as SuggestionRow[];
      setBatchId(batch.id);
      setBatchStatus('draft');
      setSuggestions(loaded);
      setSelected(new Set(loaded.filter((row) => row.confidence >= (mode === 'careful' ? .62 : .52)).map((row) => row.id)));
      setProgress('');
      setNotice(`Готово: ${loaded.length} точечных предложений. Ничего ещё не опубликовано.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось проанализировать историю.');
    } finally {
      setBusy(false);
      setProgress((value) => value.startsWith('Локальный ИИ готов') ? value : '');
    }
  }

  function patchLocal(id: string, patch: Partial<SuggestionRow>) {
    setSuggestions((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  async function saveSuggestion(row: SuggestionRow) {
    const { error } = await supabase.from('ai_story_suggestions').update({
      suggested_type: row.suggested_type,
      title: row.title,
      body: row.body,
      reason: row.reason,
      asset_query: row.asset_query,
      asset_url: row.asset_url,
      style: row.style,
      metadata: row.metadata,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) throw error;
  }

  async function preparePreview() {
    if (!batchId) return;
    setBusy(true);
    setNotice('');
    try {
      for (const row of suggestions) {
        await saveSuggestion(row);
        const state = selected.has(row.id) ? 'approved' : 'rejected';
        const { error } = await supabase.from('ai_story_suggestions').update({ state }).eq('id', row.id);
        if (error) throw error;
      }
      const { data, error } = await supabase.rpc('admin_stage_ai_batch', { p_batch_id: batchId });
      if (error) throw error;
      setBatchStatus('staged');
      setShowPreview(true);
      setNotice(`Черновик подготовлен: ${Number(data ?? 0)} сцен видно только тебе в предпросмотре.${needsAsset.length ? ` ${needsAsset.length} предложений без выбранного медиа/ссылки пока не вставлены.` : ''}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось подготовить предпросмотр.');
    } finally {
      setBusy(false);
    }
  }

  async function unstage() {
    if (!batchId) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('admin_unstage_ai_batch', { p_batch_id: batchId });
      if (error) throw error;
      setBatchStatus('draft');
      setShowPreview(false);
      setNotice('Скрытые AI-сцены удалены из предпросмотра. Опубликованная история не менялась.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось отменить черновик.');
    } finally { setBusy(false); }
  }

  async function publish() {
    if (!batchId || batchStatus !== 'staged') return;
    if (!window.confirm(`Опубликовать ${selectedCount} выбранных AI-дополнений? После этого они появятся у читателя.`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('admin_publish_ai_batch', { p_batch_id: batchId });
      if (error) throw error;
      setBatchStatus('published');
      setShowPreview(false);
      setNotice(`Опубликовано ${Number(data ?? 0)} AI-дополнений. Исходные записи истории не изменены.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось опубликовать выбранные сцены.');
    } finally { setBusy(false); }
  }

  const previewUrl = batchId ? `/?preview=1&aiBatch=${encodeURIComponent(batchId)}` : '/?preview=1';

  return <section className="space-y-5">
    <div className="overflow-hidden rounded-[30px] bg-gradient-to-br from-[#26141D] via-[#171014] to-[#0B0A0C] p-6 text-white shadow-xl">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[2.4px] text-gold"><WandSparkles size={15}/> Local AI Story Director</div>
      <h1 className="mt-3 font-serif text-4xl leading-tight">Дополнить уже готовую историю</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/55">ИИ работает только в твоём браузере. Он учитывает уже вставленные музыку, GIF, фото, видео, главы и паузы. Сначала создаёт предложения и скрытый preview — публикация только после твоего подтверждения.</p>
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.055] p-4 text-xs leading-relaxed text-white/60"><b className="text-white/85">0 ₸ за запросы.</b> Никаких OpenAI/Claude/Gemini API. Модель загружается на твоё устройство и выполняет анализ через WebGPU.</div>
    </div>

    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="rounded-2xl border border-black/10 bg-white/75 p-5 shadow-sm">
        <div className="flex items-center gap-2 font-medium text-burgundy"><MonitorSmartphone size={17}/> Локальный ИИ</div>
        <label className="mt-4 block text-xs">Модель
          <select value={modelId} disabled={busy || modelReady} onChange={(event) => setModelId(event.target.value)} className="mt-2 w-full rounded-xl border p-3 text-sm">
            {MODEL_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <p className="mt-2 text-[11px] opacity-45">{MODEL_OPTIONS.find((item) => item.id === modelId)?.hint}</p>
        <button type="button" onClick={() => void loadModel()} disabled={busy} className="mt-4 w-full rounded-xl bg-burgundy px-4 py-3 text-sm text-white disabled:opacity-45">{busy ? <Loader2 size={15} className="mr-2 inline animate-spin"/> : <Sparkles size={15} className="mr-2 inline"/>}{modelReady ? 'Перезагрузить локальный ИИ' : 'Загрузить локальный ИИ'}</button>
        {!isWebGpuAvailable() && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">На этом браузере WebGPU не найден. Можно использовать структурный fallback, но смысловые предложения будут слабее.</p>}
        {progress && <p className="mt-3 break-words text-xs opacity-55">{progress}</p>}
      </div>

      <div className="rounded-2xl border border-black/10 bg-white/75 p-5 shadow-sm">
        <div className="font-medium text-burgundy">Насколько активно дополнять</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {([
            ['careful','Очень аккуратно','Лучший режим для твоей уже оформленной истории.'],
            ['balanced','Умеренно','Чуть больше переходов и медиа-идей.'],
            ['cinematic','Кинематографично','Больше режиссёрских предложений.'],
          ] as Array<[DirectorMode,string,string]>).map(([id,label,hint]) => <button key={id} type="button" onClick={() => setMode(id)} disabled={busy} className={`rounded-xl border p-3 text-left ${mode === id ? 'border-burgundy bg-[#F6EFE0]' : 'border-black/10 bg-white'}`}><div className="text-sm font-medium">{label}</div><div className="mt-1 text-[10px] opacity-45">{hint}</div></button>)}
        </div>
        <button type="button" onClick={() => void analyze()} disabled={busy} className="mt-4 w-full rounded-xl bg-[#181014] px-4 py-3 text-sm text-white disabled:opacity-45">{busy ? <Loader2 size={15} className="mr-2 inline animate-spin"/> : <WandSparkles size={15} className="mr-2 inline"/>}Проанализировать всю готовую историю</button>
      </div>
    </div>

    {notice && <div className="rounded-xl border border-black/10 bg-white/80 p-4 text-sm">{notice}</div>}

    {suggestions.length > 0 && <>
      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[#F5EEE9]/95 p-3 shadow-lg backdrop-blur-xl md:top-4">
        <div className="text-sm"><b>{suggestions.length}</b> предложений · выбрано <b>{selectedCount}</b></div>
        <div className="flex flex-wrap gap-2">
          {batchStatus !== 'published' && <button type="button" onClick={() => setSelected(new Set(suggestions.map((row) => row.id)))} className="rounded-lg border bg-white px-3 py-2 text-xs">Выбрать все</button>}
          {batchStatus === 'draft' && <button type="button" disabled={busy || selectedCount === 0} onClick={() => void preparePreview()} className="rounded-lg bg-burgundy px-3 py-2 text-xs text-white disabled:opacity-40"><Eye size={13} className="mr-1 inline"/>Предпросмотр выбранных</button>}
          {batchStatus === 'staged' && <button type="button" disabled={busy} onClick={() => void unstage()} className="rounded-lg border px-3 py-2 text-xs"><Trash2 size={13} className="mr-1 inline"/>Убрать черновик</button>}
          {batchStatus === 'staged' && <button type="button" disabled={busy} onClick={() => void publish()} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs text-white"><Check size={13} className="mr-1 inline"/>Опубликовать выбранное</button>}
        </div>
      </div>

      <div className="space-y-3">
        {suggestions.map((row, index) => {
          const checked = selected.has(row.id);
          const mediaType = ['gif','image','video','music'].includes(row.suggested_type);
          return <article key={row.id} className={`rounded-2xl border bg-white/80 p-4 shadow-sm transition ${checked ? 'border-burgundy/35' : 'border-black/8 opacity-65'}`}>
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={checked} disabled={batchStatus !== 'draft'} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} className="mt-1 h-4 w-4"/>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs uppercase tracking-[1.6px] text-burgundy/55">AI предложение {index + 1}</div><div className="text-[10px] opacity-40">уверенность {Math.round(row.confidence * 100)}%</div></div>
                <div className="mt-2 text-[11px] opacity-45">{row.reason}</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[170px_1fr]">
                  <select value={row.suggested_type} disabled={batchStatus !== 'draft'} onChange={(event) => patchLocal(row.id, { suggested_type: event.target.value as DirectorSuggestionType })} className="rounded-xl border p-3 text-sm">{Object.entries(TYPE_LABEL).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select>
                  <input value={row.title ?? ''} disabled={batchStatus !== 'draft'} onChange={(event) => patchLocal(row.id, { title: event.target.value })} placeholder="Название — если нужно" className="rounded-xl border p-3 text-sm"/>
                </div>
                <textarea value={row.body ?? ''} disabled={batchStatus !== 'draft'} onChange={(event) => patchLocal(row.id, { body: event.target.value })} placeholder="Текст вставки — можно оставить пустым" className="mt-3 min-h-20 w-full rounded-xl border p-3 text-sm"/>
                {row.asset_query && <div className="mt-3 rounded-xl bg-[#FBF8F5] p-3 text-xs"><span className="opacity-45">ИИ предлагает искать:</span> {row.asset_query}</div>}
                {mediaType && row.suggested_type !== 'music' && batchStatus === 'draft' && <div className="mt-3 space-y-3">
                  <CommonsMediaSearch kind={row.suggested_type as 'image' | 'gif' | 'video'} initialQuery={row.asset_query ?? ''} value={commonsSelections[row.id] ?? null} onChange={(asset) => {
                    setCommonsSelections((current) => ({ ...current, [row.id]: asset }));
                    patchLocal(row.id, {
                      asset_url: asset.url,
                      metadata: { ...row.metadata, sourceUrl: asset.sourceUrl, sourceTitle: asset.title, sourceProvider: 'Wikimedia Commons' },
                    });
                  }}/>
                  <label className="block text-xs">Или вставь свою прямую ссылку
                    <input value={row.asset_url ?? ''} onChange={(event) => patchLocal(row.id, { asset_url: event.target.value })} placeholder="https://…" className="mt-2 w-full rounded-xl border p-3 text-sm"/>
                  </label>
                </div>}
                {row.suggested_type === 'link' && batchStatus === 'draft' && <label className="mt-3 block text-xs">Ссылка для этой сцены
                  <input value={row.asset_url ?? ''} onChange={(event) => patchLocal(row.id, { asset_url: event.target.value })} placeholder="https://…" className="mt-2 w-full rounded-xl border p-3 text-sm"/>
                </label>}
                {row.suggested_type === 'music' && batchStatus === 'draft' && <div className="mt-3">
                  <div className="mb-2 text-xs opacity-50">Подбери бесплатное официальное превью через уже существующий поиск музыки:</div>
                  <SongSearch value={songSelections[row.id] ?? null} onChange={(song) => {
                    setSongSelections((current) => ({ ...current, [row.id]: song }));
                    patchLocal(row.id, {
                      asset_url: song.previewUrl,
                      title: song.title,
                      metadata: {
                        ...row.metadata,
                        title: song.title,
                        artist: song.artist,
                        album: song.album || null,
                        coverUrl: song.artworkUrl || null,
                        sourceUrl: song.sourceUrl || null,
                        genre: song.genre || null,
                        durationMs: song.durationMs,
                        musicSource: 'search',
                      },
                    });
                  }}/>
                </div>}
                <div className="mt-3 text-[10px] opacity-35">Позиция: {row.left_element_id?.slice(0,8)} → {row.right_element_id?.slice(0,8)}</div>
              </div>
            </div>
          </article>;
        })}
      </div>
    </>}

    {batchId && batchStatus !== 'draft' && <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-serif text-2xl text-burgundy">Настоящий Reader preview</div><p className="mt-1 text-xs opacity-45">Скрытые AI-сцены добавлены только в этот админский preview. Обычный читатель их не получает.</p></div><a href={previewUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-burgundy px-4 py-2 text-xs text-white"><Eye size={13} className="mr-1 inline"/>Открыть отдельно</a></div>
      {showPreview && <div className="mt-4 flex justify-center"><div className="overflow-hidden rounded-[36px] border-[10px] border-[#222] bg-black shadow-2xl"><iframe key={previewUrl} title="AI Reader preview" src={previewUrl} className="h-[844px] w-[390px] max-w-[calc(100vw-48px)] bg-cream"/></div></div>}
    </div>}

    <details className="rounded-2xl border border-black/10 bg-white/65 p-4 text-xs">
      <summary className="cursor-pointer font-medium text-burgundy">Что именно ИИ делает и чего никогда не делает</summary>
      <div className="mt-3 space-y-2 leading-relaxed opacity-65"><p>Читает только уже опубликованную последовательность и ищет слабые переходы. Учитывает плотность текста и медиа, временные разрывы, настроение и уже существующие главы/паузы.</p><p>Не меняет original_text/display_text, не удаляет существующие элементы и не публикует ничего сам.</p><p>Если модель не нужна или WebGPU недоступен, структурный fallback всё равно может найти места, где нужен воздух или глава.</p></div>
    </details>
  </section>;
}
