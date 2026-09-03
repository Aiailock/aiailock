import { useEffect, useRef, useState } from 'react';
import { Mic, Play, RotateCcw, Square } from 'lucide-react';

interface Props {
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}

function clock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function preferredMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function extensionFor(type: string) {
  if (type.includes('mp4')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  return 'webm';
}

export default function VoiceRecorder({ value, onChange, disabled = false }: Props) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setSeconds(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function start() {
    setMessage('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessage('Этот браузер не умеет записывать звук. Можно выбрать готовый аудиофайл ниже.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const resolvedType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: resolvedType });
        const file = new File([blob], `voice-${new Date().toISOString().replace(/[:.]/g, '-')}.${extensionFor(resolvedType)}`, { type: resolvedType });
        onChange(file);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
      };
      recorderRef.current = recorder;
      streamRef.current = stream;
      startedAtRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      recorder.start(250);
    } catch (error) {
      setMessage(error instanceof Error && error.name === 'NotAllowedError'
        ? 'Разреши доступ к микрофону в браузере и нажми запись ещё раз.'
        : 'Не удалось включить микрофон. Можно загрузить готовую запись ниже.');
    }
  }

  function stop() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
    setRecording(false);
  }

  function reset() {
    if (recording) stop();
    onChange(null);
    setSeconds(0);
    setMessage('');
  }

  return <div className="rounded-2xl border border-burgundy/10 bg-[#eff8f1] p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-burgundy"><Mic size={16}/> Голосовое сообщение</div>
        <p className="mt-1 text-[11px] text-burgundy/50">Как в WhatsApp: нажми, говори и останови запись.</p>
      </div>
      {recording && <span className="rounded-full bg-red-600/10 px-3 py-1 text-xs font-medium text-red-700"><span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-red-600"/>REC {clock(seconds)}</span>}
    </div>

    {!value && !recording && <button type="button" disabled={disabled} onClick={() => void start()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#25765a] px-5 py-3 text-sm font-medium text-white shadow-sm disabled:opacity-45"><Mic size={17}/> Начать запись</button>}
    {recording && <button type="button" onClick={stop} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-red-700 px-5 py-3 text-sm font-medium text-white"><Square size={15} fill="currentColor"/> Остановить и сохранить</button>}

    {value && previewUrl && <div className="mt-4 rounded-2xl bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25765a] text-white"><Play size={17} fill="currentColor"/></span>
        <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium text-burgundy">{value.name}</div><div className="mt-1 text-[10px] text-burgundy/45">{(value.size / 1024 / 1024).toFixed(1)} МБ · готово к добавлению</div></div>
        <button type="button" onClick={reset} aria-label="Записать заново" className="rounded-full border border-burgundy/10 p-2 text-burgundy"><RotateCcw size={14}/></button>
      </div>
      <audio controls preload="metadata" src={previewUrl} className="mt-3 h-9 w-full" />
    </div>}

    {message && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{message}</p>}
    <label className="mt-4 block text-xs text-burgundy/55">Или выбери готовую запись
      <input type="file" disabled={disabled || recording} accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.flac,.webm" onChange={(event) => { onChange(event.target.files?.[0] ?? null); event.currentTarget.value = ''; }} className="mt-2 block w-full rounded-xl border border-dashed border-burgundy/15 bg-white p-3 text-xs" />
    </label>
    <p className="mt-2 text-[10px] text-burgundy/40">Запись микрофона работает на опубликованном HTTPS-сайте Netlify. Максимум файла — 60 МБ.</p>
  </div>;
}
