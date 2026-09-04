import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BookHeart, Check, Heart, ImagePlus, Layers3, Link2, Music2, Save, Sparkles, Trash2, Video, WandSparkles } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { createManualAudio, createManualVideo, isAudioFile, MAX_MANUAL_AUDIO_BYTES, MAX_MANUAL_VIDEO_BYTES } from '@/lib/manualMedia';
import { safeRemoteUrl } from '@/lib/safeUrl';
import type { SongSearchResult } from '@/lib/songSearch';
import SongSearch from '@/components/admin/SongSearch';
import StyleEditor, { AUDIO_PLAYER_STYLE_OPTIONS, type StyleValue } from './StyleEditor';
import { INTERACTION_OPTIONS } from '@/lib/styleOptions';
import VoiceRecorder from '@/components/admin/VoiceRecorder';
import CommonsMediaSearch, { type CommonsAsset } from '@/components/admin/CommonsMediaSearch';
import { downloadRemoteGif, MAX_GIF_BYTES } from '@/lib/remoteMedia';

type CreateKind = 'note' | 'memory' | 'special' | 'chapter' | 'quote' | 'pause' | 'album' | 'gif' | 'video' | 'voice' | 'music' | 'link' | 'interactive';

const KINDS: Array<{ id: CreateKind; label: string; hint: string }> = [
  { id: 'note', label: 'Запись', hint: 'Текст как новая страница дневника' },
  { id: 'memory', label: 'Воспоминание', hint: 'Текст и необязательное фото' },
  { id: 'special', label: 'Особый момент', hint: 'Большая эмоциональная сцена' },
  { id: 'chapter', label: 'Глава', hint: 'Красивый переход между периодами' },
  { id: 'quote', label: 'Цитата', hint: 'Большая фраза как кадр из фильма' },
  { id: 'pause', label: 'Пауза', hint: 'Воздух и тишина между сценами' },
  { id: 'album', label: 'Альбом', hint: 'Несколько скриншотов в одной сцене' },
  { id: 'gif', label: 'GIF', hint: 'Файл или ссылка между страницами' },
  { id: 'video', label: 'Видео', hint: 'Файл до 200 МБ или прямая ссылка' },
  { id: 'voice', label: 'Голосовое', hint: 'Записать с микрофона как в WhatsApp' },
  { id: 'music', label: 'Музыка', hint: 'Найти песню или загрузить своё аудио' },
  { id: 'link', label: 'Ссылка', hint: 'Переход или мини-окно прямо в истории' },
  { id: 'interactive', label: 'Сюрприз', hint: 'Подарок, письмо или секрет' },
];

const PRESETS: Array<{ id: string; label: string; style: StyleValue }> = [
  { id: 'diary', label: 'Личный дневник', style: { zone: 'default', font: 'literata', dateStyle: 'handwritten', dateFont: 'badscript', spacing: 'normal' } },
  { id: 'romance', label: 'Нежность', style: { zone: 'romantic', font: 'serif', dateStyle: 'centered', dateAlign: 'center', textAlign: 'center', decoration: ['petals'], spacing: 'cinematic' } },
  { id: 'night', label: 'Ночной разговор', style: { zone: 'night', frame: 'moonlit', font: 'badscript', dateStyle: 'capsule', decoration: ['stardust'], spacing: 'cinematic' } },
  { id: 'letter', label: 'Письмо', style: { zone: 'sepia', frame: 'envelope', font: 'badscript', dateStyle: 'handwritten', spacing: 'cinematic' } },
  { id: 'celebration', label: 'Праздник', style: { zone: 'gif', frame: 'garland', font: 'yeseva', dateStyle: 'ribbon', dateAlign: 'center', decoration: ['confetti'], spacing: 'cinematic' } },
  { id: 'quiet', label: 'Тихий момент', style: { zone: 'dusk', font: 'literata', dateStyle: 'line', decoration: ['candles'], spacing: 'cinematic' } },
];

interface Draft {
  kind: CreateKind;
  title: string;
  body: string;
  occurredAt: string;
  style: StyleValue;
  published: boolean;
  visibleFrom: string;
  interaction: string;
  gifUrl: string;
  externalUrl: string;
  linkOpenMode: 'external' | 'preview';
  musicMode: 'upload' | 'url';
  artist: string;
  audioPlayerStyle: string;
  selectedSong: SongSearchResult | null;
  albumLayout: string;
  reactionEmoji: string;
  reactionText: string;
  optionA: string;
  optionB: string;
  resultA: string;
  resultB: string;
  optionC: string;
  optionD: string;
  resultC: string;
  resultD: string;
}

const DRAFT_KEY = 'for-you-mobile-studio-draft-v1';
const nowForInput = () => new Date().toISOString().slice(0, 16);
const emptyDraft = (): Draft => ({ kind: 'note', title: '', body: '', occurredAt: nowForInput(), style: { dateStyle: 'line', spacing: 'normal', animation: 'fade-up' }, published: true, visibleFrom: '', interaction: 'gift', gifUrl: '', externalUrl: '', linkOpenMode: 'external', musicMode: 'upload', artist: '', audioPlayerStyle: 'vinyl', selectedSong: null, albumLayout: 'carousel', reactionEmoji: '❤', reactionText: '', optionA: 'Да', optionB: 'Конечно', optionC: 'Очень', optionD: 'Расскажу позже', resultA: '', resultB: '', resultC: '', resultD: '' });

const ROMANTIC_TEMPLATES: Array<{ label: string; hint: string; value: Partial<Draft>; style: StyleValue }> = [
  {
    label: 'Объятие через экран',
    hint: 'коробочка-сюрприз',
    value: { kind: 'interactive', interaction: 'gift', title: 'Тебе кое-что маленькое', body: 'Вот так. Крепко-крепко обнимаю тебя через этот экран и ещё пару секунд не отпускаю.' },
    style: { zone: 'romantic', frame: 'ribbon', font: 'badscript', decoration: ['petals'], spacing: 'cinematic' },
  },
  {
    label: 'Письмо на грустный день',
    hint: 'открывается конверт',
    value: { kind: 'interactive', interaction: 'letter', title: 'Открой, если тебе вдруг грустно', body: 'Я рядом. Даже если сейчас могу обнять тебя только словами.' },
    style: { zone: 'sepia', frame: 'envelope', font: 'badscript', spacing: 'cinematic' },
  },
  {
    label: 'Милый вопрос',
    hint: '4 варианта и 4 ответа',
    value: {
      kind: 'interactive', interaction: 'question', title: 'Можно один очень важный вопрос?', body: 'Любой твой ответ здесь всё равно заставит меня улыбнуться.',
      optionA: 'Да ☺️', optionB: 'Конечно', optionC: 'Очень-очень', optionD: 'Сначала обними',
      resultA: 'Я так и знал. И уже улыбаюсь.', resultB: 'Тогда считаю это нашим маленьким договором.', resultC: 'Вот теперь моё сердце довольно.', resultD: 'Иди сюда. Сначала обниму, потом спрошу ещё раз.',
    },
    style: { zone: 'romantic', frame: 'heart', font: 'serif', decoration: ['pixel-hearts'], spacing: 'cinematic' },
  },
  {
    label: 'Между строк',
    hint: 'тихая пауза',
    value: { kind: 'pause', title: '', body: 'Иногда самые тёплые вещи прячутся именно между обычными строками.' },
    style: { zone: 'dusk', font: 'literata', decoration: ['candles'], spacing: 'cinematic' },
  },
  {
    label: 'Та самая фраза',
    hint: 'большая цитата',
    value: { kind: 'quote', title: 'из нашей истории', body: '' },
    style: { zone: 'burgundy', frame: 'wax-seal', font: 'badscript', textAlign: 'center', spacing: 'cinematic' },
  },
  {
    label: 'Ночное сообщение',
    hint: 'мягкая страница',
    value: { kind: 'note', title: 'Пока ты спишь…', body: '' },
    style: { zone: 'night', frame: 'moonlit', font: 'badscript', decoration: ['stardust'], spacing: 'cinematic' },
  },
];

function readDraft(): Draft {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '') as Partial<Draft>;
    return { ...emptyDraft(), ...parsed, style: parsed.style ?? emptyDraft().style, occurredAt: parsed.occurredAt || nowForInput() };
  } catch {
    return emptyDraft();
  }
}

async function upload(file: File, folder: string) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `manual/${folder}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from('screenshots').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) throw error;
  return path;
}

async function uploadBatch(files: File[], folder: string): Promise<string[]> {
  const paths = new Array<string>(files.length);
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const index = next++;
      paths[index] = await upload(files[index], folder);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(3, files.length) }, () => worker()));
    return paths;
  } catch (error) {
    const uploaded = paths.filter(Boolean);
    if (uploaded.length > 0) await supabase.storage.from('screenshots').remove(uploaded);
    throw error;
  }
}

export default function QuickCreatePanel({ onCreated, onOpenTimeline }: { onCreated: () => void; onOpenTimeline: () => void }) {
  const [draft, setDraft] = useState<Draft>(readDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [gifSelection, setGifSelection] = useState<CommonsAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selectedKind = useMemo(() => KINDS.find((kind) => kind.id === draft.kind) ?? KINDS[0], [draft.kind]);
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);

  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);

  useEffect(() => {
    const timer = window.setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)), 250);
    return () => window.clearTimeout(timer);
  }, [draft]);

  function patch(next: Partial<Draft>) { setDraft((current) => ({ ...current, ...next })); setMessage(''); }
  function chooseKind(kind: CreateKind) {
    if (kind !== draft.kind) { setFiles([]); setCoverFile(null); setGifSelection(null); }
    patch({ kind, ...(kind === 'voice' ? { audioPlayerStyle: 'voice' } : kind === 'music' ? { audioPlayerStyle: 'vinyl' } : {}) });
  }
  function applyRomanticTemplate(template: (typeof ROMANTIC_TEMPLATES)[number]) {
    setFiles([]);
    setCoverFile(null);
    setGifSelection(null);
    setDraft((current) => ({
      ...current,
      ...template.value,
      style: { ...current.style, ...template.style },
      occurredAt: current.occurredAt || nowForInput(),
    }));
    setMessage('Заготовка готова. Перепиши слова под себя — оформление уже настроено.');
  }
  function reset() { const next = emptyDraft(); setDraft(next); setFiles([]); setCoverFile(null); setGifSelection(null); localStorage.removeItem(DRAFT_KEY); setMessage('Новый чистый черновик готов.'); }
  function selectFiles(incoming: File[]) {
    const isVideo = draft.kind === 'video';
    const isAudio = draft.kind === 'music' || draft.kind === 'voice';
    const maxBytes = isVideo ? MAX_MANUAL_VIDEO_BYTES : isAudio ? MAX_MANUAL_AUDIO_BYTES : MAX_GIF_BYTES;
    const valid = incoming.filter((file) => (isVideo ? file.type.startsWith('video/') : isAudio ? isAudioFile(file) : file.type.startsWith('image/')) && file.size <= maxBytes);
    if (valid.length !== incoming.length) setMessage(isVideo ? 'Можно добавить один видеофайл до 200 МБ.' : isAudio ? 'Можно добавить один аудиофайл до 60 МБ.' : 'Можно добавлять изображения до 20 МБ каждое. Неподходящие файлы пропущены.');
    setFiles((current) => {
      const source = draft.kind === 'album' ? [...current, ...valid] : valid.slice(0, 1);
      const unique = source.filter((file, index, all) => all.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size && candidate.lastModified === file.lastModified) === index);
      return unique.slice(0, draft.kind === 'album' ? 12 : 1);
    });
  }
  function moveFile(index: number, direction: -1 | 1) {
    setFiles((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (!draft.occurredAt) throw new Error('Укажи дату страницы.');
      const occurredAt = `${draft.occurredAt}Z`;
      const visibleFrom = draft.visibleFrom ? new Date(draft.visibleFrom).toISOString() : null;
      const visibility = { is_published: visibleFrom ? true : draft.published, visible_from: visibleFrom };
      const style: StyleValue = { ...draft.style };
      if (draft.kind === 'voice') {
        if (!files[0]) throw new Error('Запиши голосовое или выбери готовый аудиофайл.');
        await createManualAudio({
          file: files[0],
          title: draft.title.trim() || 'Голосовое сообщение',
          caption: draft.body,
          occurredAt,
          style: { zone: 'default', frame: 'minimal', spacing: 'normal', ...style, audioPlayerStyle: draft.audioPlayerStyle || 'voice' },
          published: visibility.is_published,
          visibleFrom,
          audioPurpose: 'voice',
        });
      } else if (draft.kind === 'music') {
        const song = draft.selectedSong;
        const resolvedTitle = song?.title || draft.title;
        const resolvedArtist = song?.artist || draft.artist;
        if (draft.musicMode === 'url') {
          const fullUrl = safeRemoteUrl(draft.externalUrl);
          if (!fullUrl) throw new Error('Вставь прямую ссылку на полный аудиофайл MP3/M4A/OGG.');
          const { error } = await supabase.from('timeline_elements').insert({
            type: 'audio', occurred_at: occurredAt, sort_tiebreak: 6,
            style: { zone: 'night', frame: 'minimal', spacing: 'cinematic', ...style, audioPlayerStyle: draft.audioPlayerStyle || 'vinyl', externalMediaUrl: fullUrl, externalMediaKind: 'audio' },
            ...visibility,
            metadata: {
              title: resolvedTitle.trim() || 'Музыка',
              artist: resolvedArtist.trim() || null,
              album: song?.album || null,
              coverUrl: safeRemoteUrl(song?.artworkUrl),
              sourceUrl: safeRemoteUrl(song?.sourceUrl),
              genre: song?.genre || null,
              durationMs: song?.durationMs ?? null,
              body: draft.body.trim() || null,
              musicSource: 'full-url',
            },
          });
          if (error) throw error;
        } else {
          if (!files[0]) throw new Error('Выбери аудиофайл.');
          await createManualAudio({
            file: files[0],
            coverFile,
            coverUrl: safeRemoteUrl(song?.artworkUrl),
            sourceUrl: safeRemoteUrl(song?.sourceUrl),
            title: resolvedTitle,
            artist: resolvedArtist,
            album: song?.album,
            caption: draft.body,
            occurredAt,
            style: { zone: 'night', frame: 'minimal', spacing: 'cinematic', ...style, audioPlayerStyle: draft.audioPlayerStyle || 'vinyl' },
            published: visibility.is_published,
            visibleFrom,
            audioPurpose: 'music',
          });
        }
      } else if (draft.kind === 'video') {
        const externalUrl = safeRemoteUrl(draft.externalUrl);
        if (files.length === 0 && !externalUrl) throw new Error('Выбери видеофайл или вставь прямую ссылку на видео.');
        if (files[0]) {
          await createManualVideo({
            file: files[0],
            title: draft.title,
            caption: draft.body,
            occurredAt,
            style: { zone: 'default', frame: 'film', spacing: 'cinematic', ...style },
            published: visibility.is_published,
            visibleFrom,
          });
        } else {
          const { error } = await supabase.from('timeline_elements').insert({
            type: 'video', occurred_at: occurredAt, sort_tiebreak: 5,
            style: { zone: 'default', frame: 'film', spacing: 'cinematic', ...style, externalMediaUrl: externalUrl, externalMediaKind: 'video' },
            ...visibility,
            metadata: { title: draft.title.trim() || null, body: draft.body.trim() || null },
          });
          if (error) throw error;
        }
      } else if (draft.kind === 'link') {
        const url = safeRemoteUrl(draft.externalUrl);
        if (!url) throw new Error('Вставь полную ссылку, начинающуюся с https:// или http://.');
        const { error } = await supabase.from('timeline_elements').insert({
          type: 'link', occurred_at: occurredAt, sort_tiebreak: 15,
          style: { zone: 'dusk', spacing: 'cinematic', ...style },
          ...visibility,
          metadata: {
            url,
            title: draft.title.trim() || 'Открыть следующую страницу',
            description: draft.body.trim() || null,
            openMode: draft.linkOpenMode,
          },
        });
        if (error) throw error;
      } else if (draft.kind === 'chapter') {
        if (!draft.title.trim()) throw new Error('Напиши название главы.');
        const { count } = await supabase.from('timeline_elements').select('*', { count: 'exact', head: true }).eq('type', 'chapter');
        const { error } = await supabase.from('timeline_elements').insert({
          type: 'chapter', occurred_at: occurredAt, sort_tiebreak: -20,
          style, ...visibility,
          metadata: { title: draft.title.trim(), subtitle: draft.body.trim() || null, number: Number(count ?? 0) + 1 },
        });
        if (error) throw error;
      } else if (draft.kind === 'quote' || draft.kind === 'pause') {
        if (draft.kind === 'quote' && !draft.body.trim()) throw new Error('Напиши текст цитаты.');
        const { error } = await supabase.from('timeline_elements').insert({
          type: draft.kind, occurred_at: occurredAt, sort_tiebreak: draft.kind === 'quote' ? -10 : 20,
          style: { zone: 'default', spacing: 'cinematic', ...style }, ...visibility,
          metadata: draft.kind === 'quote'
            ? { quote: draft.body.trim(), author: draft.title.trim() || null }
            : { text: draft.body.trim() || null },
        });
        if (error) throw error;
      } else if (draft.kind === 'note') {
        if (!draft.body.trim()) throw new Error('Напиши текст записи.');
        const id = crypto.randomUUID();
        const { error } = await supabase.from('messages').insert({
          id, fingerprint: `manual-${id}`, sender_name: draft.title.trim() || 'Запись',
          sent_at: occurredAt, is_system_message: false, is_multiline: draft.body.includes('\n'),
          original_text: draft.body.trim(), display_text: draft.body.trim(), has_media: false,
        });
        if (error) throw error;
        const { error: timelineError } = await supabase.from('timeline_elements').update({ style, ...visibility }).eq('message_id', id);
        if (timelineError) throw timelineError;
      } else if (draft.kind === 'album') {
        if (files.length === 0) throw new Error('Выбери один или несколько скриншотов.');
        if (files.length > 12) throw new Error('В одном альбоме можно максимум 12 изображений.');
        const collectionId = files.length > 1 ? crypto.randomUUID() : null;
        const albumFolder = `albums/${collectionId ?? crypto.randomUUID()}`;
        const storagePaths = await uploadBatch(files, albumFolder);
        const ids = files.map(() => crypto.randomUUID());
        const albumRows = storagePaths.map((storagePath, index) => ({
            id: ids[index], storage_path: storagePath,
            title: index === 0 ? draft.title.trim() || null : null,
            description: null,
            caption: index === 0 ? draft.body.trim() || null : null,
            occurred_at: occurredAt,
            position: 'custom', animation: 'fade', style,
            collection_id: collectionId,
            collection_order: index,
            collection_layout: draft.albumLayout,
            reaction_emoji: index === 0 ? draft.reactionEmoji || null : null,
            reaction_text: index === 0 ? draft.reactionText.trim() || null : null,
          }));
        const { error } = await supabase.from('screenshots').insert(albumRows);
        if (error) {
          await supabase.storage.from('screenshots').remove(storagePaths);
          throw error;
        }
        const { error: visibilityError } = await supabase.from('timeline_elements').update(visibility).in('screenshot_id', ids);
        if (visibilityError) throw visibilityError;
      } else {
        const isGif = draft.kind === 'gif';
        if (!isGif && !draft.body.trim()) throw new Error('Напиши текст момента.');
        if (isGif && files.length === 0 && !draft.gifUrl.trim()) throw new Error('Выбери GIF-файл или вставь прямую ссылку.');
        const id = crypto.randomUUID();
        const gifFile = isGif && !files[0] && draft.gifUrl.trim()
          ? await downloadRemoteGif(draft.gifUrl, gifSelection?.title || draft.title || 'animation')
          : null;
        const sourceFile = files[0] ?? gifFile;
        const photoPath = sourceFile ? await upload(sourceFile, `${draft.kind}/${id}`) : null;
        const metadata = draft.kind === 'special'
          ? { kind: 'special' }
          : draft.kind === 'interactive'
            ? {
                kind: 'interactive',
                interaction: draft.interaction,
                options: [draft.optionA, draft.optionB, draft.optionC, draft.optionD].map((value, index) => value.trim() || ['Да', 'Конечно', 'Очень', 'Расскажу позже'][index]),
                results: [draft.resultA, draft.resultB, draft.resultC, draft.resultD].map((value) => value.trim() || draft.body.trim()),
              }
            : draft.kind === 'gif' ? { kind: 'gif', sourceUrl: gifSelection?.sourceUrl ?? null, sourceTitle: gifSelection?.title ?? null, sourceProvider: gifSelection ? gifSelection.provider ?? 'Wikimedia Commons' : null } : {};
        if (isGif && !draft.body.trim()) style.hideText = true;
        const { error } = await supabase.from('memories').insert({
          id, title: draft.title.trim() || null,
          body: draft.body.trim() || 'GIF', occurred_at: occurredAt, importance: draft.kind === 'special' ? 5 : 3,
          photo_storage_path: photoPath, style, metadata,
        });
        if (error) throw error;
        const { error: visibilityError } = await supabase.from('timeline_elements').update(visibility).eq('memory_id', id);
        if (visibilityError) throw visibilityError;
      }

      localStorage.removeItem(DRAFT_KEY);
      setMessage('Готово — страница уже добавлена в историю. Можно сразу открыть Preview или продолжить редактирование.');
      setFiles([]);
      setCoverFile(null);
      setGifSelection(null);
      onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось добавить страницу.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid min-w-0 gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <form onSubmit={(event) => void save(event)} className="min-w-0 rounded-[28px] border border-black/5 bg-white/90 p-4 pb-28 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><div className="rounded-2xl bg-burgundy p-3 text-white"><BookHeart size={20} /></div><div><div className="text-[10px] uppercase tracking-[2px] text-burgundy/45">mobile story studio</div><h1 className="font-serif text-3xl text-burgundy">Добавить страницу</h1><p className="mt-1 text-xs opacity-50">Дата уже стоит текущая. Черновик сохраняется в этом телефоне автоматически.</p></div></div>

        <div className="mt-5 rounded-2xl border border-burgundy/10 bg-gradient-to-br from-[#FFF9F7] to-[#F6E8EC] p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-burgundy"><Heart size={14} fill="currentColor"/>Нежные заготовки</div>
          <p className="mt-1 text-[10px] leading-relaxed text-burgundy/50">Одно нажатие создаёт готовую сцену и оформление. Слова можно сразу изменить под вашу настоящую историю.</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">{ROMANTIC_TEMPLATES.map((template) => <button type="button" key={template.label} onClick={() => applyRomanticTemplate(template)} className="min-w-[150px] shrink-0 rounded-2xl border border-burgundy/10 bg-white/80 p-3 text-left shadow-sm"><span className="block text-xs font-medium text-burgundy">{template.label}</span><span className="mt-1 block text-[10px] text-ink/45">{template.hint}</span></button>)}</div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KINDS.map((kind) => <button type="button" key={kind.id} onClick={() => chooseKind(kind.id)} className={`min-w-0 rounded-2xl border p-3 text-left transition ${draft.kind === kind.id ? 'border-burgundy bg-burgundy text-white shadow-md' : 'border-black/10 bg-[#FBF8F5]'}`}><div className="text-sm font-medium">{kind.label}</div><div className="mt-1 text-[10px] leading-snug opacity-55">{kind.hint}</div></button>)}
        </div>

        <div className="mt-5 rounded-2xl bg-[#F6EFE0] p-3"><div className="flex items-center gap-2 text-xs font-medium text-burgundy"><WandSparkles size={14} /> Готовый стиль — без ручной настройки</div><div className="mt-2 flex flex-wrap gap-2">{PRESETS.map((preset) => <button type="button" key={preset.id} onClick={() => patch({ style: { ...draft.style, ...preset.style } })} className="rounded-full border border-burgundy/10 bg-white/70 px-3 py-1.5 text-[11px] text-burgundy">{preset.label}</button>)}</div></div>

        <input value={draft.title} onChange={(event) => patch({ title: event.target.value })} placeholder={draft.kind === 'chapter' ? 'Название главы' : draft.kind === 'quote' ? 'Автор или подпись (необязательно)' : draft.kind === 'interactive' && ['question','choice'].includes(draft.interaction) ? 'Напиши сам вопрос' : 'Название (необязательно)'} className="mt-4 w-full rounded-xl border p-3" />
        <textarea value={draft.body} onChange={(event) => patch({ body: event.target.value })} placeholder={draft.kind === 'chapter' ? 'Короткая фраза под названием' : draft.kind === 'quote' ? 'Та самая фраза…' : draft.kind === 'pause' ? 'Несколько тихих слов — или оставь пустым' : draft.kind === 'interactive' && ['question','choice'].includes(draft.interaction) ? 'Общий красивый ответ, если отдельный вариант ниже оставлен пустым' : draft.kind === 'interactive' ? 'Что откроется после нажатия?' : draft.kind === 'album' ? 'Общая подпись к альбому' : draft.kind === 'video' ? 'Подпись под видео (необязательно)' : draft.kind === 'voice' ? 'Подпись к голосовому (необязательно)' : draft.kind === 'music' ? 'Почему эта песня здесь или подпись к аудио' : draft.kind === 'link' ? 'Коротко объясни, куда ведёт ссылка' : 'Текст страницы'} className="mt-3 min-h-36 w-full rounded-xl border p-3" />
        <input type="datetime-local" value={draft.occurredAt} onChange={(event) => patch({ occurredAt: event.target.value })} className="mt-3 w-full rounded-xl border p-3" />

        {(draft.kind === 'memory' || draft.kind === 'special' || draft.kind === 'gif' || draft.kind === 'video' || draft.kind === 'interactive' || draft.kind === 'album') && <div className="mt-3 rounded-xl border border-dashed border-burgundy/15 bg-[#FBF8F5] p-3 text-sm">
          <label className="block cursor-pointer"><span className="flex items-center gap-2">{draft.kind === 'video' ? <Video size={16} /> : <ImagePlus size={16} />}{draft.kind === 'album' ? 'Скриншоты — выбирай сразу несколько или добавляй ещё' : draft.kind === 'gif' ? 'GIF-файл' : draft.kind === 'video' ? 'Видеофайл до 200 МБ' : 'Фото или GIF (необязательно)'}</span><input type="file" multiple={draft.kind === 'album'} accept={draft.kind === 'video' ? 'video/mp4,video/webm,video/quicktime,video/*' : draft.kind === 'gif' ? 'image/gif,.gif' : 'image/*,.gif'} onChange={(event) => { selectFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ''; }} className="mt-2 block w-full text-xs" /></label>
          {files.length > 0 && <><div className="mt-3 flex items-center justify-between text-[11px] text-burgundy/60"><span>Выбрано: {files.length}{draft.kind === 'album' ? ' из 12' : ''}</span><span>{(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} МБ</span></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{previews.map((preview, index) => <div key={`${preview.file.name}-${preview.file.lastModified}`} className="min-w-0 overflow-hidden rounded-xl border border-burgundy/10 bg-white/75"><div className="aspect-[4/5] overflow-hidden bg-black/5">{draft.kind === 'video' ? <video src={preview.url} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <img src={preview.url} alt="" className="h-full w-full object-cover" />}</div><div className="p-2"><div className="truncate text-[10px]" title={preview.file.name}>{index + 1}. {preview.file.name}</div><div className="mt-2 flex items-center justify-between"><div className="flex gap-1">{draft.kind === 'album' && <><button type="button" aria-label="Передвинуть влево" disabled={index === 0} onClick={() => moveFile(index, -1)} className="rounded-lg border p-1.5 disabled:opacity-25"><ArrowLeft size={12}/></button><button type="button" aria-label="Передвинуть вправо" disabled={index === files.length - 1} onClick={() => moveFile(index, 1)} className="rounded-lg border p-1.5 disabled:opacity-25"><ArrowRight size={12}/></button></>}</div><button type="button" aria-label="Удалить файл" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} className="rounded-lg border border-red-900/10 p-1.5 text-red-700"><Trash2 size={12}/></button></div></div></div>)}</div></>}
        </div>}

        {draft.kind === 'voice' && <div className="mt-3 space-y-3">
          <VoiceRecorder value={files[0] ?? null} disabled={busy} onChange={(file) => file ? selectFiles([file]) : setFiles([])} />
          <label className="block text-sm">Как будет выглядеть голосовое
            <select value={draft.audioPlayerStyle} onChange={(event) => patch({ audioPlayerStyle: event.target.value, style: { ...draft.style, audioPlayerStyle: event.target.value } })} className="mt-2 w-full rounded-xl border p-3 text-sm">
              {AUDIO_PLAYER_STYLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        </div>}

        {draft.kind === 'music' && <div className="mt-3 rounded-2xl border border-burgundy/10 bg-[#FBF8F5] p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-burgundy"><Music2 size={16}/>Музыка или своё аудио</div>
          <div className="mt-3 grid grid-cols-2 rounded-xl bg-black/[.035] p-1 text-xs"><button type="button" onClick={() => patch({ musicMode: 'upload', externalUrl: '' })} className={`rounded-lg px-3 py-2 ${draft.musicMode === 'upload' ? 'bg-white text-burgundy shadow-sm' : 'opacity-50'}`}>Загрузить трек</button><button type="button" onClick={() => { setFiles([]); setCoverFile(null); patch({ musicMode: 'url' }); }} className={`rounded-lg px-3 py-2 ${draft.musicMode === 'url' ? 'bg-white text-burgundy shadow-sm' : 'opacity-50'}`}>Ссылка на аудио</button></div>
          <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900"><b>В Reader играет полный трек.</b> Каталожное 30‑секундное превью больше не сохраняется.</div>
            <SongSearch metadataOnly value={draft.selectedSong} onChange={(song) => patch({ selectedSong: song, title: song.title, artist: song.artist })} />
            {draft.musicMode === 'upload'
              ? <div className="space-y-3"><label className="block text-sm">Полный аудиофайл до 60 МБ<input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.flac,.webm" onChange={(event) => { selectFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ''; }} className="mt-2 block w-full rounded-xl border border-dashed p-3 text-xs" /></label>{files[0] && <div className="flex items-center gap-3 rounded-xl bg-white p-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-burgundy text-gold"><Music2 size={17}/></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{files[0].name}</span><span className="text-[10px] opacity-45">{(files[0].size / 1024 / 1024).toFixed(1)} МБ</span></span><button type="button" onClick={() => setFiles([])} className="rounded-lg border p-2 text-red-700"><Trash2 size={13}/></button></div>}<input value={draft.artist} onChange={(event) => patch({ artist: event.target.value })} placeholder="Исполнитель (необязательно)" className="w-full rounded-xl border p-3 text-sm"/><label className="block text-sm">Своя обложка для винила (необязательно)<input type="file" accept="image/*" onChange={(event) => { const next = event.target.files?.[0] ?? null; if (next && next.size > 5 * 1024 * 1024) setMessage('Обложка должна быть не больше 5 МБ.'); else setCoverFile(next); event.currentTarget.value = ''; }} className="mt-2 block w-full rounded-xl border border-dashed p-3 text-xs" /></label>{coverFile && <div className="flex items-center justify-between rounded-xl bg-white p-3 text-xs"><span className="min-w-0 truncate">Обложка: {coverFile.name}</span><button type="button" onClick={() => setCoverFile(null)} className="ml-2 rounded-lg border p-2 text-red-700"><Trash2 size={13}/></button></div>}</div>
              : <label className="block text-sm">Прямая ссылка на полный MP3/M4A/OGG<input value={draft.externalUrl} inputMode="url" onChange={(event) => patch({ externalUrl: event.target.value })} placeholder="https://…/full-track.mp3" className="mt-2 w-full rounded-xl border p-3"/><span className="mt-1 block text-[10px] opacity-45">Ссылка должна открывать сам аудиофайл, а не страницу музыкального сервиса.</span></label>}
          </div>
          <label className="mt-3 block text-sm">Дизайн плеера
            <select value={draft.audioPlayerStyle} onChange={(event) => patch({ audioPlayerStyle: event.target.value, style: { ...draft.style, audioPlayerStyle: event.target.value } })} className="mt-2 w-full rounded-xl border p-3 text-sm">
              {AUDIO_PLAYER_STYLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        </div>}
        {draft.kind === 'gif' && <div className="mt-3 space-y-3">
          <CommonsMediaSearch kind="gif" value={gifSelection} onChange={(asset) => { setGifSelection(asset); patch({ gifUrl: asset.url }); }} />
          <label className="block text-sm">Или прямая ссылка на GIF<input value={draft.gifUrl} inputMode="url" onChange={(event) => { setGifSelection(null); patch({ gifUrl: event.target.value }); }} placeholder="https://…/animation.gif" className="mt-2 w-full rounded-xl border p-3" /></label>
        </div>}
        {draft.kind === 'video' && <label className="mt-3 block text-sm">Или прямая ссылка на MP4/WebM<input value={draft.externalUrl} inputMode="url" onChange={(event) => patch({ externalUrl: event.target.value })} placeholder="https://…/video.mp4" className="mt-2 w-full rounded-xl border p-3" /><span className="mt-1 block text-[10px] opacity-45">Если выбран файл, будет загружен именно он. Ссылка используется только без файла.</span></label>}
        {draft.kind === 'link' && <div className="mt-3 rounded-2xl border border-burgundy/10 bg-[#FBF8F5] p-3"><label className="block text-sm"><span className="flex items-center gap-2"><Link2 size={15}/>Адрес перехода</span><input value={draft.externalUrl} inputMode="url" onChange={(event) => patch({ externalUrl: event.target.value })} placeholder="https://example.com" className="mt-2 w-full rounded-xl border p-3" /></label><label className="mt-3 block text-sm">Как открыть<select value={draft.linkOpenMode} onChange={(event) => patch({ linkOpenMode: event.target.value as Draft['linkOpenMode'] })} className="mt-2 w-full rounded-xl border p-3"><option value="external">Перейти на сайт в новой вкладке</option><option value="preview">Открыть маленьким окном внутри истории</option></select></label><p className="mt-2 text-[10px] opacity-45">Некоторые сайты запрещают встраивание. Тогда у неё останется кнопка «открыть отдельно».</p></div>}
        {draft.kind === 'interactive' && <div className="mt-3 space-y-3"><label className="block text-sm">Как открывается<select value={draft.interaction} onChange={(event) => patch({ interaction: event.target.value })} className="mt-2 w-full rounded-xl border p-3">{INTERACTION_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label} — {option.hint}</option>)}</select></label>{['question','choice','scale'].includes(draft.interaction) && <div className="rounded-2xl border border-burgundy/10 bg-[#FBF8F5] p-3"><div className="text-xs font-medium text-burgundy">{draft.interaction === 'scale' ? 'Подписи краёв шкалы' : 'Четыре варианта ответа'}</div><div className="mt-2 grid grid-cols-2 gap-2"><input value={draft.optionA} onChange={(event) => patch({ optionA: event.target.value })} placeholder={draft.interaction === 'scale' ? 'Немного' : 'Ответ 1'} className="min-w-0 rounded-xl border p-3 text-sm"/><input value={draft.optionB} onChange={(event) => patch({ optionB: event.target.value })} placeholder={draft.interaction === 'scale' ? 'Бесконечно' : 'Ответ 2'} className="min-w-0 rounded-xl border p-3 text-sm"/>{draft.interaction !== 'scale' && <><input value={draft.optionC} onChange={(event) => patch({ optionC: event.target.value })} placeholder="Ответ 3" className="min-w-0 rounded-xl border p-3 text-sm"/><input value={draft.optionD} onChange={(event) => patch({ optionD: event.target.value })} placeholder="Ответ 4" className="min-w-0 rounded-xl border p-3 text-sm"/></>}</div>{draft.interaction !== 'scale' && <div className="mt-3 grid gap-2"><input value={draft.resultA} onChange={(event) => patch({ resultA: event.target.value })} placeholder="Красивый ответ после варианта 1" className="rounded-xl border p-3 text-sm"/><input value={draft.resultB} onChange={(event) => patch({ resultB: event.target.value })} placeholder="Красивый ответ после варианта 2" className="rounded-xl border p-3 text-sm"/><input value={draft.resultC} onChange={(event) => patch({ resultC: event.target.value })} placeholder="Красивый ответ после варианта 3" className="rounded-xl border p-3 text-sm"/><input value={draft.resultD} onChange={(event) => patch({ resultD: event.target.value })} placeholder="Красивый ответ после варианта 4" className="rounded-xl border p-3 text-sm"/></div>}</div>}</div>}
        {draft.kind === 'album' && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">Оформление альбома<select value={draft.albumLayout} onChange={(event) => patch({ albumLayout: event.target.value })} className="mt-2 w-full rounded-xl border p-3"><option value="carousel">Карусель — листать пальцем</option><option value="stack">Стопка снимков</option><option value="collage">Коллаж</option></select></label><label className="text-sm">Твоя реакция<div className="mt-2 flex gap-2"><select value={draft.reactionEmoji} onChange={(event) => patch({ reactionEmoji: event.target.value })} className="w-20 rounded-xl border p-3"><option>❤</option><option>🥹</option><option>😂</option><option>✨</option><option>💔</option></select><input value={draft.reactionText} onChange={(event) => patch({ reactionText: event.target.value })} placeholder="например: до сих пор улыбаюсь" className="min-w-0 flex-1 rounded-xl border p-3" /></div></label></div>}

        <div className="mt-4 rounded-2xl bg-black/[.025] p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.published} onChange={(event) => patch({ published: event.target.checked })} disabled={Boolean(draft.visibleFrom)} /> Сразу показать ей в reader</label><label className="mt-3 block text-xs text-burgundy/65">Или открыть автоматически позже<input type="datetime-local" value={draft.visibleFrom} onChange={(event) => patch({ visibleFrom: event.target.value })} className="mt-2 w-full rounded-xl border p-3 text-sm" /><span className="mt-1 block text-[10px] opacity-60">Если дата указана, сцена останется скрытой до этого момента.</span></label></div>
        <div className="sticky bottom-[72px] z-20 -mx-2 mt-4 grid grid-cols-[1fr_auto] gap-2 rounded-2xl border border-black/8 bg-white/95 p-2 shadow-xl backdrop-blur sm:static sm:mx-0 sm:flex sm:flex-wrap sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"><button disabled={busy} className="rounded-xl bg-burgundy px-5 py-3 text-sm text-white shadow disabled:opacity-45"><Save size={15} className="mr-1 inline" />{busy ? 'Добавляю…' : `Добавить: ${selectedKind.label}`}</button><button type="button" onClick={reset} className="rounded-xl border px-4 py-3 text-sm">Очистить</button></div>
        {message && <div className={`mt-4 rounded-xl p-3 text-sm ${message.startsWith('Готово') ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{message}{message.startsWith('Готово') && <button type="button" onClick={onOpenTimeline} className="mt-3 block rounded-lg border border-emerald-700/20 bg-white/60 px-3 py-2 text-xs">Открыть и редактировать в Истории</button>}</div>}
      </form>

      <div className="min-w-0 space-y-4">
        <div className="rounded-[28px] bg-gradient-to-br from-[#351523] to-[#1f1118] p-5 text-white shadow-xl"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[2px] text-white/45"><Sparkles size={13} /> визуальная мастерская</div><h2 className="mt-2 font-serif text-3xl">Настрой и сразу увидь результат</h2><div className="mt-4 grid gap-2 text-xs text-white/65 sm:grid-cols-3"><div className="rounded-xl bg-white/5 p-3"><Check size={13} className="mb-1" />Дата слева, справа или по центру</div><div className="rounded-xl bg-white/5 p-3"><Layers3 size={13} className="mb-1" />Фоны по ссылке и эффекты</div><div className="rounded-xl bg-white/5 p-3"><ImagePlus size={13} className="mb-1" />Альбомы до 12 кадров</div></div></div>
        <StyleEditor
          value={{ ...draft.style, ...((draft.kind === 'music' || draft.kind === 'voice') ? { audioPlayerStyle: draft.audioPlayerStyle } : {}) }}
          onChange={(style) => patch({ style, ...(typeof style.audioPlayerStyle === 'string' ? { audioPlayerStyle: style.audioPlayerStyle } : {}) })}
          hasMedia={draft.kind === 'album' || draft.kind === 'gif' || draft.kind === 'video' || draft.kind === 'music' || draft.kind === 'voice' || files.length > 0}
          mediaKind={draft.kind === 'music' || draft.kind === 'voice' ? 'audio' : draft.kind === 'video' ? 'video' : draft.kind === 'gif' ? 'gif' : files.length ? 'photo' : null}
          previewTitle={draft.title || (draft.kind === 'voice' ? 'Голосовое сообщение' : draft.kind === 'music' ? draft.selectedSong?.title ?? '' : '')}
          previewText={draft.body}
        />
      </div>
    </section>
  );
}
