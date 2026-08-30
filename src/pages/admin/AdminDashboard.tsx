import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarClock,
  CheckSquare2,
  Eye,
  FileArchive,
  GripVertical,
  ImagePlus,
  Images,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import AiControlPanel from "./AiControlPanel";
import StyleEditor, { type StyleValue } from "./StyleEditor";
import {
  DEFAULT_SPECIAL_MOMENT_LABEL,
  DEFAULT_TIME_FORMAT,
  TIME_FORMAT_OPTIONS,
  type TimeFormatId,
} from "@/lib/readerSettingsContext";
import AnalyticsPanel from "./AnalyticsPanel";
import { ALIGN_OPTIONS, DATE_STYLE_OPTIONS, FONT_OPTIONS } from "@/lib/styleOptions";
import QuickCreatePanel from "./QuickCreatePanel";
import { safeRemoteUrl } from "@/lib/safeUrl";

interface ImportRow {
  id: string;
  file_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  messages_found: number;
  messages_new: number;
  messages_duplicate: number;
  media_found: number;
  media_matched: number;
  media_missing: number;
  error_message: string | null;
  log?: Array<{ step: string; status: string; message: string; at: string }>;
}
interface TimelineRow {
  id: string;
  type: string;
  occurred_at: string;
  message_id: string | null;
  media_id: string | null;
  memory_id: string | null;
  screenshot_id: string | null;
  style: Record<string, unknown>;
  mood: string | null;
  importance: number;
  is_published: boolean;
  metadata: Record<string, unknown>;
}
interface MessageRow {
  id: string;
  sent_at: string;
  sender_name: string;
  original_text: string | null;
  display_text: string | null;
}
interface MemoryRow {
  id: string;
  title: string | null;
  body: string;
  occurred_at: string;
  importance: number;
  place_after_message_id: string | null;
  photo_storage_path: string | null;
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
}
interface ScreenshotRow {
  id: string;
  storage_path: string;
  title: string | null;
  description: string | null;
  caption: string | null;
  occurred_at: string;
  place_after_message_id: string | null;
  animation: string;
  position: string;
  style: Record<string, unknown>;
  collection_id: string | null;
  collection_order: number;
  collection_layout: string;
  reaction_emoji: string | null;
  reaction_text: string | null;
}
interface MediaRow {
  id: string;
  original_filename: string;
  kind: string;
  status: string;
  size_bytes: number | null;
  created_at: string;
  storage_path: string | null;
  message_id: string | null;
}

type Tab =
  | "dashboard"
  | "create"
  | "analytics"
  | "import"
  | "timeline"
  | "memories"
  | "special"
  | "screenshots"
  | "media"
  | "ai"
  | "settings"
  | "preview";
const tabs: Array<[Tab, string]> = [
  ["dashboard", "Обзор"],
  ["create", "Добавить"],
  ["analytics", "Чтение"],
  ["timeline", "История"],
  ["memories", "Воспоминания"],
  ["special", "Особенные"],
  ["screenshots", "Скриншоты"],
  ["media", "Медиа"],
  ["import", "Импорт"],
  ["ai", "ИИ"],
  ["settings", "Настройки"],
  ["preview", "Preview"],
];
const tabIcons: Record<Tab, typeof BarChart3> = {
  dashboard: BarChart3, create: Plus, analytics: Activity, timeline: CheckSquare2, memories: Star,
  special: Sparkles, screenshots: ImagePlus, media: Images, import: FileArchive,
  ai: Sparkles, settings: Settings2, preview: Eye,
};
const themeDefaults: Record<string, string> = {
  cream: "#FBF3EE",
  blush: "#F2C9C2",
  peach: "#F0B79A",
  lavender: "#C8BFE7",
  burgundy: "#4A1B2F",
  gold: "#C9A063",
  ink: "#3A2E30",
  paper: "#F6EFE0",
};
const themePresets: Array<{ name: string; colors: Record<string, string> }> = [
  { name: "Нежная", colors: themeDefaults },
  { name: "Ночная", colors: { ...themeDefaults, cream: "#201827", paper: "#2C2134", ink: "#F4EAF0", blush: "#9B6B83", peach: "#B87A70", lavender: "#6F668E", burgundy: "#E8B7C8", gold: "#D7B97A" } },
  { name: "Старая книга", colors: { ...themeDefaults, cream: "#F2E7CF", paper: "#E6D4B2", ink: "#443529", blush: "#D9B6A3", peach: "#C8926B", lavender: "#B7A991", burgundy: "#6E392E", gold: "#A77A36" } },
  { name: "Лаванда", colors: { ...themeDefaults, cream: "#F7F3FB", paper: "#EEE7F5", ink: "#3A3146", blush: "#E3CADF", peach: "#E8BFB3", lavender: "#B9A7D4", burgundy: "#5A365F", gold: "#B18B5C" } },
];
function dateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [userEmail, setUserEmail] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setUserEmail(data.user?.email ?? ""));
  }, []);
  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/admin/login";
  }
  async function rebuildSpecials() {
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.rpc("rebuild_special_timeline");
    setBusy(false);
    setNotice(
      error ? error.message : "Специальные элементы хронологии обновлены.",
    );
    setRefreshKey((x) => x + 1);
  }
  return (
    <div className="admin-shell min-h-screen bg-[#f5eee9] font-sans text-ink md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-white/10 bg-gradient-to-b from-[#351523] to-[#1f1118] p-4 text-white md:flex">
        <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><div className="font-pixel text-[10px] text-gold">FOR YOU</div><div className="mt-2 font-serif text-2xl">Мастерская истории</div><div className="mt-2 truncate text-[11px] text-white/40">{userEmail}</div></div>
        <nav className="mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Админ разделы">{tabs.map(([id, label]) => { const Icon = tabIcons[id]; return <button key={id} onClick={() => setTab(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${tab === id ? "bg-white text-burgundy shadow-lg" : "text-white/65 hover:bg-white/10 hover:text-white"}`}><Icon size={16} /><span>{label}</span></button>; })}</nav>
        <div className="mt-4 space-y-2"><button onClick={() => void rebuildSpecials()} disabled={busy} className="w-full rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10"><RefreshCw size={14} className={`mr-1 inline ${busy ? "animate-spin" : ""}`} />Синхронизировать</button><button onClick={() => void logout()} className="w-full rounded-xl px-3 py-2 text-xs text-white/45 hover:bg-white/10"><LogOut size={14} className="mr-1 inline" />Выйти</button></div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-black/10 bg-[#f5eee9]/92 shadow-sm backdrop-blur-xl md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3"><div><div className="font-pixel text-[9px] text-burgundy">FOR YOU / ADMIN</div><div className="mt-1 max-w-[150px] truncate text-[10px] opacity-45">{userEmail}</div></div><div className="flex gap-1"><button aria-label="Синхронизировать" onClick={() => void rebuildSpecials()} disabled={busy} className="rounded-xl border border-black/10 bg-white/70 p-2"><RefreshCw size={15} className={busy ? "animate-spin" : ""} /></button><button aria-label="Выйти" onClick={() => void logout()} className="rounded-xl border border-black/10 p-2"><LogOut size={15} /></button></div></div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Админ разделы">{tabs.map(([id, label]) => { const Icon = tabIcons[id]; return <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs transition ${tab === id ? "bg-burgundy text-white shadow-sm" : "bg-white/40"}`}><Icon size={13} />{label}</button>; })}</nav>
        </header>
        <div className="mx-auto hidden max-w-[1500px] items-center justify-between px-7 pb-0 pt-6 md:flex"><div><div className="text-[10px] uppercase tracking-[2px] text-burgundy/40">раздел</div><div className="mt-1 font-serif text-2xl text-burgundy">{tabs.find(([id]) => id === tab)?.[1]}</div></div><button onClick={() => setTab("preview")} className="rounded-xl border border-black/10 bg-white/60 px-4 py-2 text-xs"><Eye size={14} className="mr-1 inline" />Посмотреть reader</button></div>
        {notice && <div className="mx-auto mt-4 max-w-[1500px] px-4 md:px-7"><div className="rounded-xl border border-black/10 bg-white/75 p-3 text-sm shadow-sm">{notice}</div></div>}
        <main className="mx-auto max-w-[1500px] px-4 pb-24 pt-5 md:px-7 md:py-6">
        {tab === "dashboard" && (
          <DashboardPanel onTab={setTab} refreshKey={refreshKey} />
        )}
        {tab === "analytics" && <AnalyticsPanel />}
        {tab === "create" && <QuickCreatePanel onCreated={() => setRefreshKey((x) => x + 1)} onOpenTimeline={() => setTab("timeline")} />}
        {tab === "import" && (
          <ImportPanel onDone={() => setRefreshKey((x) => x + 1)} />
        )}
        {tab === "timeline" && <TimelinePanel refreshKey={refreshKey} />}
        {tab === "memories" && <MemoriesPanel specialOnly={false} />}
        {tab === "special" && <MemoriesPanel specialOnly />}
        {tab === "screenshots" && <ScreenshotsPanel />}
        {tab === "media" && <MediaPanel />}
        {tab === "ai" && <AiControlPanel />}
        {tab === "settings" && <SettingsPanel />}
        {tab === "preview" && <PreviewPanel />}
        </main>
        {tab !== "create" && <button type="button" onClick={() => setTab("create")} className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-burgundy px-5 py-3 text-sm text-white shadow-2xl md:hidden"><Plus size={17} />Добавить</button>}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string | number;
  icon: typeof BarChart3;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border border-black/10 bg-white/80 p-5 text-left shadow-sm ${onClick ? "transition hover:-translate-y-0.5 hover:shadow-md" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[1.5px] opacity-45">
          {label}
        </span>
        <Icon size={17} className="text-burgundy/55" />
      </div>
      <div className="mt-3 font-serif text-4xl text-burgundy">{value}</div>
    </button>
  );
}

function DashboardPanel({
  onTab,
  refreshKey,
}: {
  onTab: (tab: Tab) => void;
  refreshKey: number;
}) {
  const [stats, setStats] = useState({
    messages: 0,
    photos: 0,
    videos: 0,
    audio: 0,
    screenshots: 0,
    memories: 0,
    specials: 0,
    imports: 0,
  });
  const [lastImport, setLastImport] = useState<ImportRow | null>(null);
  useEffect(() => {
    (async () => {
      const results = await Promise.all([
        supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("is_system_message", false),
        supabase
          .from("media")
          .select("*", { count: "exact", head: true })
          .eq("kind", "photo"),
        supabase
          .from("media")
          .select("*", { count: "exact", head: true })
          .eq("kind", "video"),
        supabase
          .from("media")
          .select("*", { count: "exact", head: true })
          .eq("kind", "audio"),
        supabase
          .from("screenshots")
          .select("*", { count: "exact", head: true }),
        supabase.from("memories").select("*", { count: "exact", head: true }),
        supabase
          .from("timeline_elements")
          .select("*", { count: "exact", head: true })
          .eq("type", "special"),
        supabase.from("imports").select("*", { count: "exact", head: true }),
      ]);
      setStats({
        messages: results[0].count ?? 0,
        photos: results[1].count ?? 0,
        videos: results[2].count ?? 0,
        audio: results[3].count ?? 0,
        screenshots: results[4].count ?? 0,
        memories: results[5].count ?? 0,
        specials: results[6].count ?? 0,
        imports: results[7].count ?? 0,
      });
      const { data } = await supabase
        .from("imports")
        .select(
          "id,file_name,status,started_at,finished_at,messages_found,messages_new,messages_duplicate,media_found,media_matched,media_missing,error_message,log",
        )
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLastImport((data as ImportRow | null) ?? null);
    })();
  }, [refreshKey]);
  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-[radial-gradient(circle_at_20%_20%,rgba(242,201,194,.8),transparent_45%),linear-gradient(135deg,#4A1B2F,#27111D)] p-7 text-white shadow-xl">
        <div className="text-[11px] uppercase tracking-[3px] text-white/55">
          digital story control room
        </div>
        <h1 className="mt-2 font-serif text-5xl">
          История, которая продолжается.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
          Импортируй новый экспорт WhatsApp, редактируй единый timeline и сразу
          смотри, как книга выглядит для читателя.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={() => onTab("create")}
            className="rounded-xl bg-white px-4 py-2 text-sm text-burgundy shadow"
          >
            <Plus size={14} className="mr-1 inline" />Новая страница
          </button>
          <button
            onClick={() => onTab("import")}
            className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white"
          >
            Импортировать ZIP
          </button>
          <button
            onClick={() => onTab("preview")}
            className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white"
          >
            Открыть reader
          </button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Статистика чтения"
          value="Открыть"
          icon={Activity}
          onClick={() => onTab("analytics")}
        />
        <Card
          label="Сообщения"
          value={stats.messages.toLocaleString("ru-RU")}
          icon={BarChart3}
          onClick={() => onTab("timeline")}
        />
        <Card
          label="Фото"
          value={stats.photos}
          icon={Images}
          onClick={() => onTab("media")}
        />
        <Card
          label="Видео"
          value={stats.videos}
          icon={Eye}
          onClick={() => onTab("media")}
        />
        <Card
          label="Аудио"
          value={stats.audio}
          icon={Sparkles}
          onClick={() => onTab("media")}
        />
        <Card
          label="Воспоминания"
          value={stats.memories}
          icon={Star}
          onClick={() => onTab("memories")}
        />
        <Card
          label="Особенные"
          value={stats.specials}
          icon={Sparkles}
          onClick={() => onTab("special")}
        />
        <Card
          label="Скриншоты"
          value={stats.screenshots}
          icon={ImagePlus}
          onClick={() => onTab("screenshots")}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-2xl border border-black/10 bg-white/80 p-6 shadow-sm">
          <h2 className="font-serif text-2xl text-burgundy">
            Последний импорт
          </h2>
          {lastImport ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs opacity-45">Архив</div>
                <div className="mt-1 text-sm">{lastImport.file_name}</div>
              </div>
              <div>
                <div className="text-xs opacity-45">Статус</div>
                <div className="mt-1 text-sm">{lastImport.status}</div>
              </div>
              <div>
                <div className="text-xs opacity-45">Новых</div>
                <div className="mt-1 text-sm font-medium">
                  +{lastImport.messages_new}
                </div>
              </div>
              <div>
                <div className="text-xs opacity-45">Дубликатов</div>
                <div className="mt-1 text-sm">
                  {lastImport.messages_duplicate}
                </div>
              </div>
              <div>
                <div className="text-xs opacity-45">Медиа</div>
                <div className="mt-1 text-sm">
                  {lastImport.media_matched}/{lastImport.media_found}
                </div>
              </div>
              <div>
                <div className="text-xs opacity-45">Время</div>
                <div className="mt-1 text-sm">
                  {dateTime(lastImport.started_at)}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm opacity-55">Импортов пока нет.</p>
          )}
        </div>
        <div className="rounded-2xl border border-black/10 bg-[#F6EFE0] p-6">
          <h2 className="font-serif text-2xl text-burgundy">
            Перед публикацией
          </h2>
          <p className="mt-3 text-sm leading-relaxed opacity-70">
            Проверь timeline, скрывай технические сообщения, при необходимости
            пройди AI-обработку, добавь редкие особенные моменты и только потом
            делись ссылкой.
          </p>
        </div>
      </div>
    </section>
  );
}

function ImportPanel({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [startDate, setStartDate] = useState("");
  const [needsStart, setNeedsStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const load = useCallback(async () => {
    const [{ data: settings }, { data }] = await Promise.all([
      supabase
        .from("history_settings")
        .select("reader_starts_at")
        .eq("id", true)
        .maybeSingle(),
      supabase
        .from("imports")
        .select(
          "id,file_name,status,started_at,finished_at,messages_found,messages_new,messages_duplicate,media_found,media_matched,media_missing,error_message,log",
        )
        .order("started_at", { ascending: false })
        .limit(20),
    ]);
    setNeedsStart(!settings);
    setImports((data ?? []) as ImportRow[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function pollImport(
    importId: string,
  ): Promise<Record<string, unknown>> {
    // The function now responds immediately and finishes the real work in
    // the background (see supabase/functions/import-zip — EdgeRuntime.
    // waitUntil), because large exports (many photos/videos) take longer
    // than the platform's request wall-clock limit. Poll the `imports` row
    // until it leaves the 'processing' state.
    for (;;) {
      const { data, error } = await supabase
        .from("imports")
        .select(
          "id,status,file_name,started_at,finished_at,messages_found,messages_new,messages_duplicate,media_found,media_matched,media_missing,error_message,log",
        )
        .eq("id", importId)
        .single();
      if (error) return { error: error.message };
      if (data && data.status !== "processing")
        return data as Record<string, unknown>;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      setReport({ error: "ZIP слишком большой. Ограничение: 200 MB." });
      return;
    }
    setBusy(true);
    setReport(null);
    try {
      // Upload straight to the private `originals` bucket (admin already has
      // full RLS access to it — see 0003_storage.sql) instead of streaming
      // the whole archive through the import-zip function's request body.
      // For large exports that request-body buffering was enough to exceed
      // the Edge Function's memory limit and get the worker killed mid-
      // request (a bare 502, before the function could even respond).
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `imports/pending/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("originals")
        .upload(storagePath, file, {
          contentType: "application/zip",
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase.functions.invoke("import-zip", {
        body: {
          storagePath,
          fileName: file.name,
          fileSize: file.size,
          ...(needsStart && startDate
            ? { reader_starts_at: `${startDate}T00:00:00.000Z` }
            : {}),
        },
      });
      if (error || data?.error) {
        setBusy(false);
        setReport({ error: error?.message ?? data.error });
        return;
      }
      const importId = data.importId as string;
      await load();
      const finalReport = await pollImport(importId);
      setBusy(false);
      setReport(finalReport);
      onDone();
      await load();
    } catch (err) {
      setBusy(false);
      setReport({
        error:
          err instanceof Error ? err.message : "Не удалось загрузить архив.",
      });
    }
  }
  const steps = [
    "ZIP загружается напрямую в Storage",
    "Архив распаковывается и анализируется",
    "Сообщения и media сопоставляются",
    "Дубликаты отбрасываются",
    "Данные сохраняются в Supabase",
    "Обработка продолжается в фоне — для больших архивов может занять несколько минут",
  ];
  return (
    <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <FileArchive className="text-burgundy" />
          <div>
            <h1 className="font-serif text-3xl text-burgundy">
              Импорт истории
            </h1>
            <p className="text-xs opacity-55">
              Полный экспорт с медиа можно загружать снова и снова —
              существующие сообщения не дублируются.
            </p>
          </div>
        </div>
        <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4">
          <label className="block text-sm">
            ZIP-архив или .txt переписки
            <input
              type="file"
              accept=".zip,application/zip,.txt,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full rounded-xl border border-dashed border-burgundy/20 bg-[#FBF3EE] p-3 text-sm"
              required
            />
            <span className="mt-2 block text-[11px] leading-relaxed opacity-50">
              ZIP «с медиа» из WhatsApp — фото/видео/голосовые подставятся
              автоматически. Обычный .txt переписки (без медиа) тоже подойдёт —
              сообщения импортируются, а на месте фото появится плейсхолдер
              «медиа отсутствует», который потом можно вручную заменить реальным
              фото или скриншотом (вкладки «Скриншоты» / «Воспоминания»). Позже
              можно доимпортировать тот же период уже полным ZIP — недостающие
              файлы подтянутся автоматически, дублей не будет.
            </span>
          </label>
          {file && (
            <div className="rounded-xl bg-black/[.03] p-3 text-xs">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB{" "}
              {file.name.toLowerCase().endsWith(".txt") && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                  без медиа
                </span>
              )}
            </div>
          )}
          {needsStart && (
            <label className="block text-sm">
              Дата начала истории
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="mt-2 block w-full rounded-xl border border-black/10 p-3"
              />
            </label>
          )}
          <button
            disabled={!file || busy || (needsStart && !startDate)}
            className="w-full rounded-xl bg-burgundy px-5 py-3 text-sm text-white disabled:opacity-40"
          >
            {busy ? "Обрабатываю архив…" : "Загрузить и собрать историю"}
          </button>
        </form>
        {busy && (
          <div className="mt-6 space-y-2 rounded-2xl bg-[#F6EFE0] p-4">
            {steps.map((step, i) => (
              <div
                key={step}
                className={`flex items-center gap-3 text-sm ${i === steps.length - 1 ? "opacity-35" : ""}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${i < steps.length - 1 ? "animate-pulse bg-burgundy" : "bg-black/10"}`}
                />
                {step}
                {i === 0 && (
                  <span className="ml-auto text-xs opacity-45">сервер</span>
                )}
              </div>
            ))}
          </div>
        )}
        {report && (
          <pre className="mt-5 max-h-80 overflow-auto rounded-xl bg-[#211820] p-4 text-xs text-white">
            {JSON.stringify(report, null, 2)}
          </pre>
        )}
      </div>
      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <h2 className="font-serif text-2xl text-burgundy">История импортов</h2>
        <div className="mt-4 space-y-3">
          {imports.map((item) => (
            <div key={item.id} className="rounded-xl border border-black/5 p-3">
              <div className="flex justify-between gap-2 text-xs">
                <span className="truncate">{item.file_name}</span>
                <span>{item.status}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] opacity-55">
                <span>{dateTime(item.started_at)}</span>
                <span>+{item.messages_new} новых</span>
                <span>{item.messages_duplicate} дублей</span>
                <span>
                  медиа {item.media_matched}/{item.media_found}
                </span>
              </div>
              {item.media_missing > 0 && (
                <div className="mt-2 text-xs text-amber-700">
                  Не найдено media: {item.media_missing}
                </div>
              )}
              {item.error_message && (
                <div className="mt-2 text-xs text-red-700">
                  {item.error_message}
                </div>
              )}
              {item.log?.length ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs opacity-55">
                    Лог обработки
                  </summary>
                  <div className="mt-2 space-y-1 border-l border-black/10 pl-3">
                    {item.log.map((entry, index) => (
                      <div key={`${item.id}-${index}`} className="text-[11px]">
                        <span className="font-medium">{entry.step}</span> ·{" "}
                        {entry.message}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Возвращает ISO-момент времени строго между двумя соседями (или рядом с
// единственным соседом, если элемент кладут в начало/конец списка). Именно
// этим значением новый/перетащенный элемент занимает нужное место в общей
// хронологии — без него админу пришлось бы вручную подбирать дату и время.
function midpointIso(prevIso: string | null, nextIso: string | null): string {
  const prev = prevIso ? new Date(prevIso).getTime() : null;
  const next = nextIso ? new Date(nextIso).getTime() : null;
  if (prev !== null && next !== null)
    return new Date(
      prev + Math.max(1, Math.round((next - prev) / 2)),
    ).toISOString();
  if (prev !== null) return new Date(prev + 1000).toISOString();
  if (next !== null) return new Date(next - 1000).toISOString();
  return new Date().toISOString();
}

function MessageAnchorPicker({
  value,
  onChange,
  label = "Расположение рядом с сообщением",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [items, setItems] = useState<MessageRow[]>([]);
  useEffect(() => {
    void supabase
      .from("messages")
      .select("id,sent_at,sender_name,original_text,display_text")
      .eq("is_system_message", false)
      .order("sent_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setItems((data ?? []) as MessageRow[]));
  }, []);
  return (
    <label className="block text-sm">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border p-3 text-sm"
      >
        <option value="">Не привязывать — использовать выбранную дату</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {dateTime(item.sent_at)} · {item.sender_name}:{" "}
            {(item.display_text ?? item.original_text ?? "медиа")
              .replace(/\s+/g, " ")
              .slice(0, 72)}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-[11px] opacity-45">
        Никаких UUID: просто выбери нужное сообщение из списка.
      </span>
    </label>
  );
}

type InsertKind =
  | "message"
  | "chapter"
  | "gif"
  | "special"
  | "memory"
  | "screenshot"
  | "spoiler"
  | "gift"
  | "letter"
  | "flip"
  | "photo-reveal"
  | "promise";
const insertKindLabel: Record<InsertKind, string> = {
  message: "Сообщение",
  chapter: "Глава",
  gif: "GIF",
  special: "Особый момент",
  memory: "Воспоминание",
  screenshot: "Скриншот",
  spoiler: "Секрет",
  gift: "Подарок",
  letter: "Письмо",
  flip: "Перевёртыш",
  "photo-reveal": "Проявить фото",
  promise: "Обещание",
};
const interactionKinds = new Set<InsertKind>([
  "spoiler",
  "gift",
  "letter",
  "flip",
  "photo-reveal",
  "promise",
]);

// Тонкая полоса-разделитель между двумя карточками истории: клик по «+»
// открывает выбор типа вставки и мини-форму прямо на месте. Компонент живёт
// на уровне модуля (а не объявлен внутри TimelinePanel), потому что при
// объявлении внутри тела компонента React получает НОВУЮ функцию-компонент
// на каждый ре-рендер родителя — а значит считает её другим типом элемента
// и полностью размонтирует/монтирует заново DOM-узел поля ввода при любом
// изменении состояния (например, после каждой набранной буквы). Именно
// из-за этого поле теряло фокус и приходилось кликать в него заново на
// каждую букву. Все нужные данные и колбэки приходят пропсами.
interface InsertGapProps {
  prevId: string | null;
  nextId: string | null;
  reorderable: boolean;
  insertGap: { prevId: string | null; nextId: string | null } | null;
  insertKind: InsertKind | null;
  insertTitle: string;
  insertBody: string;
  insertBusy: boolean;
  insertError: string;
  onOpen: (prevId: string | null, nextId: string | null) => void;
  onClose: () => void;
  onPickKind: (kind: InsertKind) => void;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onFileChange: (f: File | null) => void;
  onSubmit: () => void;
}
function InsertGap({
  prevId,
  nextId,
  reorderable,
  insertGap,
  insertKind,
  insertTitle,
  insertBody,
  insertBusy,
  insertError,
  onOpen,
  onClose,
  onPickKind,
  onTitleChange,
  onBodyChange,
  onFileChange,
  onSubmit,
}: InsertGapProps) {
  if (!reorderable) return null;
  const open = insertGap?.prevId === prevId && insertGap?.nextId === nextId;
  if (!open)
    return (
      <div className="group relative py-1">
        <div className="h-px bg-black/5" />
        <button
          type="button"
          onClick={() => onOpen(prevId, nextId)}
          title="Вставить сюда"
        className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-burgundy/15 bg-white text-burgundy opacity-100 shadow-sm transition sm:h-5 sm:w-5 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Plus size={12} />
        </button>
      </div>
    );
  const hasTitle = insertKind !== "screenshot" && insertKind !== "message";
  const hasPhoto = insertKind !== "screenshot" && insertKind !== "message" && insertKind !== "chapter";
  return (
    <div className="my-2 rounded-2xl border border-dashed border-burgundy/25 bg-[#FBF3EE] p-3">
      {!insertKind ? (
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs opacity-55">Что вставить сюда?</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-xs opacity-45 hover:opacity-80"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              ["message", "chapter", "gif", "special", "memory", "screenshot"] as InsertKind[]
            ).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onPickKind(k)}
                className="rounded-lg border border-burgundy/20 bg-white px-3 py-1.5 text-xs hover:bg-burgundy hover:text-white"
              >
                {insertKindLabel[k]}
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-black/5 pt-3">
            <div className="mb-2 text-[10px] uppercase tracking-[1.6px] text-burgundy/45">
              интерактив для неё
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  "spoiler",
                  "gift",
                  "letter",
                  "flip",
                  "photo-reveal",
                  "promise",
                ] as InsertKind[]
              ).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onPickKind(k)}
                  className="rounded-lg border border-gold/30 bg-[#fffaf3] px-3 py-1.5 text-xs text-burgundy hover:bg-burgundy hover:text-white"
                >
                  {insertKindLabel[k]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="opacity-55">{insertKindLabel[insertKind]}</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 opacity-45 hover:opacity-80"
            >
              <X size={14} />
            </button>
          </div>
          {hasTitle && (
            <input
              value={insertTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Название (необязательно)"
              className="w-full rounded-lg border p-2 text-sm"
            />
          )}
          {insertKind === "screenshot" && (
            <input
              type="file"
              accept="image/*,.gif"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-dashed p-2 text-xs"
            />
          )}
          <textarea
            value={insertBody}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder={
              insertKind === "screenshot"
                ? "Подпись (необязательно)"
                : insertKind === "chapter"
                  ? "Короткая фраза под названием главы"
                : insertKind === "message"
                  ? "Текст сообщения"
                  : interactionKinds.has(insertKind)
                    ? "Что откроется после нажатия?"
                    : "Текст момента"
            }
            className="min-h-20 w-full rounded-lg border p-2 text-sm"
          />
          {hasPhoto && (
            <label className="block text-xs opacity-55">
              Фото (необязательно)
              <input
                type="file"
                accept="image/*,.gif"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full rounded-lg border border-dashed p-2 text-xs"
              />
            </label>
          )}
          {insertError && <p className="text-xs text-red-700">{insertError}</p>}
          <button
            type="button"
            disabled={insertBusy}
            onClick={onSubmit}
            className="rounded-lg bg-burgundy px-3 py-2 text-xs text-white disabled:opacity-50"
          >
            {insertBusy ? "Добавляю…" : "Добавить сюда"}
          </button>
        </div>
      )}
    </div>
  );
}

function TimelinePanel({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<TimelineRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [styleValue, setStyleValue] = useState<StyleValue>({});
  const [textEditing, setTextEditing] = useState<string | null>(null);
  const [displayText, setDisplayText] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 80;
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | "end" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [insertGap, setInsertGap] = useState<{
    prevId: string | null;
    nextId: string | null;
  } | null>(null);
  const [insertKind, setInsertKind] = useState<InsertKind | null>(null);
  const [insertTitle, setInsertTitle] = useState("");
  const [insertBody, setInsertBody] = useState("");
  const [insertFile, setInsertFile] = useState<File | null>(null);
  const [insertBusy, setInsertBusy] = useState(false);
  const [insertError, setInsertError] = useState("");
  // Воспоминания/особые моменты и скриншоты, вставленные через «+» (или
  // импортированные), раньше показывались в единой истории как безликая
  // плашка «Медиа/вложение привязано…» без текста и без формы редактирования —
  // редактировать их можно было только уйдя на отдельную вкладку. Подгружаем
  // содержимое обеих таблиц для текущей страницы, чтобы редактировать текст
  // и оформление каждого элемента прямо здесь, как у обычных сообщений.
  const [memMap, setMemMap] = useState<Map<string, MemoryRow>>(new Map());
  const [shotMap, setShotMap] = useState<Map<string, ScreenshotRow>>(new Map());
  const [memEditing, setMemEditing] = useState<string | null>(null);
  const [memForm, setMemForm] = useState({ title: "", body: "" });
  const [shotEditing, setShotEditing] = useState<string | null>(null);
  const [shotForm, setShotForm] = useState({
    title: "",
    description: "",
    caption: "",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStyle, setBulkStyle] = useState<StyleValue>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dateEditing, setDateEditing] = useState<string | null>(null);
  const [dateValue, setDateValue] = useState("");
  const [chapterEditing, setChapterEditing] = useState<string | null>(null);
  const [chapterForm, setChapterForm] = useState({ title: "", subtitle: "", number: "" });

  // Сортировка по возрастанию (старое → новое), как в самой читалке — так
  // порядок карточек в админке совпадает с тем, что увидит читатель, и
  // перетаскивание/вставка «между двумя» интуитивно понятны.
  const load = useCallback(async () => {
    const [{ data: elements }, { data: msgs }] = await Promise.all([
      supabase
        .from("timeline_elements")
        .select(
          "id,type,occurred_at,message_id,media_id,memory_id,screenshot_id,style,mood,importance,is_published,metadata",
        )
        .order("occurred_at", { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1),
      supabase
        .from("messages")
        .select("id,sent_at,sender_name,original_text,display_text")
        .eq("is_system_message", false)
        .order("sent_at", { ascending: false })
        .limit(1200),
    ]);
    const els = (elements ?? []) as TimelineRow[];
    setRows(els);
    setMessages((msgs ?? []) as MessageRow[]);
    const memIds = els
      .map((r) => r.memory_id)
      .filter((id): id is string => Boolean(id));
    const shotIds = els
      .map((r) => r.screenshot_id)
      .filter((id): id is string => Boolean(id));
    const [{ data: mems }, { data: shots }] = await Promise.all([
      memIds.length
        ? supabase
            .from("memories")
            .select(
              "id,title,body,occurred_at,importance,place_after_message_id,photo_storage_path,style,metadata",
            )
            .in("id", memIds)
        : Promise.resolve({ data: [] as MemoryRow[] }),
      shotIds.length
        ? supabase
            .from("screenshots")
            .select(
              "id,storage_path,title,description,caption,occurred_at,animation,position,style",
            )
            .in("id", shotIds)
        : Promise.resolve({ data: [] as ScreenshotRow[] }),
    ]);
    setMemMap(new Map(((mems ?? []) as MemoryRow[]).map((m) => [m.id, m])));
    setShotMap(
      new Map(((shots ?? []) as ScreenshotRow[]).map((s) => [s.id, s])),
    );
  }, [page]);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  const map = useMemo(
    () => new Map(messages.map((m) => [m.id, m])),
    [messages],
  );
  const q = filter.toLowerCase().trim();
  const visible = rows.filter((r) => {
    const m = r.message_id ? map.get(r.message_id) : null;
    return (
      !q ||
      r.type.includes(q) ||
      r.mood?.includes(q) ||
      m?.original_text?.toLowerCase().includes(q)
    );
  });
  // Перетаскивание и «вставить между» полагаются на то, что соседи в
  // отфильтрованном списке — реальные соседи в хронологии. Пока идёт поиск
  // это не гарантировано, поэтому оба режима на время фильтра выключены.
  const reorderable = q.length === 0;

  // Стиль хранится в двух местах: у сообщений/медиа — прямо в
  // timeline_elements.style, а у воспоминаний/особых моментов/скриншотов —
  // на исходной таблице (memories/screenshots), откуда триггер копирует его
  // обратно в timeline_elements при каждом изменении. Раньше эта функция
  // всегда писала в timeline_elements напрямую — для memory/screenshot это
  // расходилось с исходной таблицей и следующее же сохранение в отдельной
  // вкладке «Воспоминания»/«Скриншоты» затирало оформление обратно старым
  // значением (именно это и давало «баги с рамками» в предпросмотре).
  async function saveStyle(row: TimelineRow) {
    try {
      const table = row.memory_id
        ? "memories"
        : row.screenshot_id
          ? "screenshots"
          : null;
      const sourceId = row.memory_id ?? row.screenshot_id;
      const { error } =
        table && sourceId
          ? await supabase
              .from(table)
              .update({ style: styleValue })
              .eq("id", sourceId)
          : await supabase
              .from("timeline_elements")
              .update({ style: styleValue })
              .eq("id", row.id);
      if (error) throw error;
      setEditing(null);
      await load();
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Не удалось сохранить стиль.",
      );
    }
  }
  async function saveText(id: string) {
    const { error } = await supabase
      .from("messages")
      .update({ display_text: displayText || null })
      .eq("id", id);
    if (error) window.alert(error.message);
    else {
      setTextEditing(null);
      await load();
    }
  }
  async function saveMemory(row: TimelineRow) {
    if (!row.memory_id) return;
    const { error } = await supabase
      .from("memories")
      .update({
        title: memForm.title.trim() || null,
        body: memForm.body.trim(),
      })
      .eq("id", row.memory_id);
    if (error) window.alert(error.message);
    else {
      setMemEditing(null);
      await load();
    }
  }
  async function saveShot(row: TimelineRow) {
    if (!row.screenshot_id) return;
    const { error } = await supabase
      .from("screenshots")
      .update({
        title: shotForm.title.trim() || null,
        description: shotForm.description.trim() || null,
        caption: shotForm.caption.trim() || null,
      })
      .eq("id", row.screenshot_id);
    if (error) window.alert(error.message);
    else {
      setShotEditing(null);
      await load();
    }
  }
  async function saveChapter(row: TimelineRow) {
    const metadata = { ...(row.metadata ?? {}), title: chapterForm.title.trim() || "Новая глава", subtitle: chapterForm.subtitle.trim() || null, number: chapterForm.number.trim() || null };
    const { error } = await supabase.from("timeline_elements").update({ metadata }).eq("id", row.id);
    if (error) window.alert(error.message);
    else { setChapterEditing(null); await load(); }
  }
  async function toggle(row: TimelineRow) {
    const { error } = await supabase
      .from("timeline_elements")
      .update({ is_published: !row.is_published })
      .eq("id", row.id);
    if (error) window.alert(error.message);
    else await load();
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function bulkUpdate(
    patch: StyleValue | null,
    published: boolean | null,
  ) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const { error } = await supabase.rpc("admin_bulk_update_timeline", {
      p_ids: ids,
      p_style_patch: patch,
      p_published: published,
    });
    setBulkBusy(false);
    if (error) window.alert(error.message);
    else {
      setBulkOpen(false);
      setBulkStyle({});
      await load();
    }
  }
  async function deleteElements(ids: string[]) {
    if (
      ids.length === 0 ||
      !window.confirm(
        `Удалить навсегда ${ids.length === 1 ? "этот элемент" : `${ids.length} элементов`}? Вернуть их можно будет только повторным импортом или ручным добавлением.`,
      )
    )
      return;
    setBulkBusy(true);
    const { data, error } = await supabase.rpc(
      "admin_delete_timeline_elements",
      { p_ids: ids },
    );
    if (error) {
      setBulkBusy(false);
      window.alert(error.message);
      return;
    }
    const storage =
      (data as { storage?: Array<{ bucket?: string; path?: string }> } | null)
        ?.storage ?? [];
    const byBucket = new Map<string, string[]>();
    for (const item of storage)
      if (item.bucket && item.path)
        byBucket.set(item.bucket, [
          ...(byBucket.get(item.bucket) ?? []),
          item.path,
        ]);
    for (const [bucket, paths] of byBucket)
      await supabase.storage.from(bucket).remove(paths);
    setSelected(new Set());
    setBulkBusy(false);
    await load();
  }

  // Двигает элемент строго между `prev` и `next`. Для сообщений/медиа дата
  // хранится только в timeline_elements — её и меняем напрямую. У
  // воспоминаний/скриншотов дата и позиция-якорь живут в исходной таблице
  // (memories/screenshots), а в timeline_elements её пересчитывает триггер —
  // поэтому для них обновляем исходную таблицу и сбрасываем старый якорь
  // «после сообщения», иначе триггер тут же вернёт элемент на старое место.
  async function moveElement(
    row: TimelineRow,
    prev: TimelineRow | null,
    next: TimelineRow | null,
  ) {
    const at = midpointIso(
      prev?.occurred_at ?? null,
      next?.occurred_at ?? null,
    );
    setBusyId(row.id);
    const result = row.memory_id
      ? await supabase
          .from("memories")
          .update({ occurred_at: at, place_after_message_id: null })
          .eq("id", row.memory_id)
      : row.screenshot_id
        ? await supabase
            .from("screenshots")
            .update({
              occurred_at: at,
              place_after_message_id: null,
              position: "custom",
            })
            .eq("id", row.screenshot_id)
        : await supabase
            .from("timeline_elements")
            .update({ occurred_at: at })
            .eq("id", row.id);
    setBusyId(null);
    if (result.error) window.alert(result.error.message);
    else await load();
  }

  function neighborsBefore(
    targetId: string | "end",
    excludeId: string,
  ): { prev: TimelineRow | null; next: TimelineRow | null } {
    const ordered = visible.filter((r) => r.id !== excludeId);
    if (targetId === "end")
      return { prev: ordered[ordered.length - 1] ?? null, next: null };
    const idx = ordered.findIndex((r) => r.id === targetId);
    return { prev: ordered[idx - 1] ?? null, next: ordered[idx] ?? null };
  }
  function onDrop(targetId: string | "end") {
    setDragOverId(null);
    if (!draggedId || draggedId === targetId) return;
    const dragged = rows.find((r) => r.id === draggedId);
    if (!dragged) return;
    if (dragged.type === "year_break" || dragged.type === "on_this_day") return;
    const { prev, next } = neighborsBefore(targetId, draggedId);
    void moveElement(dragged, prev, next);
  }

  function moveOne(row: TimelineRow, direction: -1 | 1) {
    const index = visible.findIndex((item) => item.id === row.id);
    if (index < 0) return;
    if (direction === -1) {
      if (index === 0) return;
      void moveElement(row, visible[index - 2] ?? null, visible[index - 1]);
    } else {
      if (index >= visible.length - 1) return;
      void moveElement(row, visible[index + 1], visible[index + 2] ?? null);
    }
  }

  async function saveDate(row: TimelineRow) {
    if (!dateValue) return;
    const at = `${dateValue}Z`;
    const result = row.memory_id
      ? await supabase.from("memories").update({ occurred_at: at, place_after_message_id: null }).eq("id", row.memory_id)
      : row.screenshot_id
        ? await supabase.from("screenshots").update({ occurred_at: at, place_after_message_id: null, position: "custom" }).eq("id", row.screenshot_id)
        : await supabase.from("timeline_elements").update({ occurred_at: at }).eq("id", row.id);
    if (result.error) window.alert(result.error.message);
    else { setDateEditing(null); await load(); }
  }

  function openInsert(prevId: string | null, nextId: string | null) {
    setInsertGap({ prevId, nextId });
    setInsertKind(null);
    setInsertTitle("");
    setInsertBody("");
    setInsertFile(null);
    setInsertError("");
  }
  async function submitInsert() {
    if (!insertGap || !insertKind) return;
    setInsertError("");
    const prevRow = rows.find((r) => r.id === insertGap.prevId) ?? null;
    const nextRow = rows.find((r) => r.id === insertGap.nextId) ?? null;
    const at = midpointIso(
      prevRow?.occurred_at ?? null,
      nextRow?.occurred_at ?? null,
    );
    try {
      setInsertBusy(true);
      const id = crypto.randomUUID();
      if (insertKind === "message") {
        // Обычная строка истории, набранная прямо в админке — ведёт себя как
        // импортированное сообщение (те же поля, тот же триггер
        // trg_sync_message_timeline на таблице messages сам создаёт запись в
        // timeline_elements), поэтому получает точно такое же оформление и
        // текстовый режим «письма» для длинных текстов, как обычные сообщения.
        if (!insertBody.trim()) throw new Error("Напиши текст сообщения.");
        const { error } = await supabase
          .from("messages")
          .insert({
            id,
            fingerprint: `manual-${id}`,
            sender_name: "Запись",
            sent_at: at,
            is_system_message: false,
            is_multiline: insertBody.includes("\n"),
            original_text: insertBody.trim(),
            display_text: insertBody.trim(),
            has_media: false,
          });
        if (error) throw error;
      } else if (insertKind === "chapter") {
        if (!insertTitle.trim()) throw new Error("Напиши название главы.");
        const { count } = await supabase.from("timeline_elements").select("*", { count: "exact", head: true }).eq("type", "chapter");
        const { error } = await supabase.from("timeline_elements").insert({
          id,
          type: "chapter",
          occurred_at: at,
          sort_tiebreak: -20,
          style: { zone: "romantic", spacing: "cinematic", dateStyle: "centered" },
          is_published: true,
          metadata: { title: insertTitle.trim(), subtitle: insertBody.trim() || null, number: Number(count ?? 0) + 1 },
        });
        if (error) throw error;
      } else if (insertKind === "screenshot") {
        if (!insertFile) throw new Error("Выбери изображение.");
        const safe = insertFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `manual/screenshots/${id}/${safe}`;
        const { error: upError } = await supabase.storage
          .from("screenshots")
          .upload(path, insertFile, {
            contentType: insertFile.type || "image/jpeg",
          });
        if (upError) throw upError;
        const { error } = await supabase
          .from("screenshots")
          .insert({
            id,
            storage_path: path,
            title: insertTitle.trim() || null,
            description: null,
            caption: insertBody.trim() || null,
            occurred_at: at,
            position: "custom",
            animation: "fade",
            style: { frame: "phone" },
          });
        if (error) throw error;
      } else {
        if (insertKind !== "gif" && !insertBody.trim())
          throw new Error("Напиши текст момента/воспоминания.");
        if (insertKind === "gif" && !insertFile) throw new Error("Выбери GIF-файл.");
        let photoPath: string | null = null;
        if (insertFile) {
          const safe = insertFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          photoPath = `manual/memories/${id}/${safe}`;
          const { error: upError } = await supabase.storage
            .from("screenshots")
            .upload(photoPath, insertFile, {
              contentType: insertFile.type || "image/jpeg",
            });
          if (upError) throw upError;
        }
        const interactive = interactionKinds.has(insertKind);
        const metadata =
          insertKind === "special"
            ? { kind: "special" }
            : insertKind === "gif"
              ? { kind: "gif" }
            : interactive
              ? { kind: "interactive", interaction: insertKind }
              : {};
        const style = insertKind === "gif"
          ? { zone: "gif", frame: "minimal", spacing: "cinematic", hideText: !insertBody.trim() }
          : interactive
          ? {
              zone: insertKind === "letter" ? "sepia" : "romantic",
              font: insertKind === "letter" ? "badscript" : "serif",
            }
          : {};
        const { error } = await supabase
          .from("memories")
          .insert({
            id,
            title: insertTitle.trim() || null,
            body: insertBody.trim() || "GIF",
            occurred_at: at,
            importance: 3,
            photo_storage_path: photoPath,
            style,
            metadata,
          });
        if (error) throw error;
      }
      setInsertGap(null);
      setInsertKind(null);
      await load();
    } catch (e) {
      setInsertError(e instanceof Error ? e.message : "Не удалось добавить.");
    } finally {
      setInsertBusy(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-black/5 bg-white/90 p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-burgundy">Единая история</h1>
          <p className="text-xs opacity-50">
            Выбирай элементы галочками, меняй оформление сразу у многих,
            перетаскивай и вставляй интерактивы через «+».
          </p>
        </div>
        <input
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
          placeholder="Поиск по тексту…"
          className="w-full max-w-xs rounded-xl border border-black/10 px-3 py-2 text-sm"
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-[#F6EFE0] p-3 text-xs">
        <button
          type="button"
          onClick={() => setSelected(new Set(visible.map((row) => row.id)))}
          className="rounded-lg border border-black/10 bg-white px-3 py-2"
        >
          <CheckSquare2 size={14} className="mr-1 inline" />
          Выбрать страницу
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          className="rounded-lg px-3 py-2 opacity-55"
        >
          Снять выбор
        </button>
        <span className="ml-auto font-medium text-burgundy">
          Выбрано: {selected.size}
        </span>
      </div>
      {selected.size > 0 && (
        <div className="sticky top-[108px] z-20 mt-3 rounded-2xl border border-burgundy/10 bg-white/95 p-3 shadow-xl backdrop-blur">
          <div className="flex flex-wrap gap-2">
            <button
              disabled={bulkBusy}
              onClick={() => setBulkOpen((value) => !value)}
              className="rounded-lg bg-burgundy px-3 py-2 text-xs text-white"
            >
              Общее оформление
            </button>
            <button
              disabled={bulkBusy}
              onClick={() => void bulkUpdate(null, true)}
              className="rounded-lg border px-3 py-2 text-xs"
            >
              Опубликовать
            </button>
            <button
              disabled={bulkBusy}
              onClick={() => void bulkUpdate(null, false)}
              className="rounded-lg border px-3 py-2 text-xs"
            >
              Скрыть
            </button>
            <button
              disabled={bulkBusy}
              onClick={() => void deleteElements(Array.from(selected))}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700"
            >
              <Trash2 size={13} className="mr-1 inline" />
              Удалить
            </button>
          </div>
          {bulkOpen && (
            <div className="mt-3">
              <p className="mb-2 text-xs opacity-50">
                Измени только нужные поля — они применятся ко всем выбранным,
                остальное сохранится.
              </p>
              <StyleEditor
                value={bulkStyle}
                onChange={setBulkStyle}
                hasMedia={false}
              />
              <button
                disabled={bulkBusy || Object.keys(bulkStyle).length === 0}
                onClick={() => void bulkUpdate(bulkStyle, null)}
                className="mt-2 rounded-lg bg-burgundy px-4 py-2 text-xs text-white disabled:opacity-40"
              >
                Применить к {selected.size}
              </button>
            </div>
          )}
        </div>
      )}
      {!reorderable && (
        <p className="mt-3 text-xs text-amber-700">
          Во время поиска перетаскивание и вставка «между» отключены — очисти
          поиск, чтобы менять порядок.
        </p>
      )}
      <div className="mt-5">
        <InsertGap
          prevId={null}
          nextId={visible[0]?.id ?? null}
          reorderable={reorderable}
          insertGap={insertGap}
          insertKind={insertKind}
          insertTitle={insertTitle}
          insertBody={insertBody}
          insertBusy={insertBusy}
          insertError={insertError}
          onOpen={openInsert}
          onClose={() => setInsertGap(null)}
          onPickKind={setInsertKind}
          onTitleChange={setInsertTitle}
          onBodyChange={setInsertBody}
          onFileChange={setInsertFile}
          onSubmit={() => void submitInsert()}
        />
        {visible.map((row, i) => {
          const m = row.message_id ? map.get(row.message_id) : null;
          const hasMedia = Boolean(
            row.media_id || row.screenshot_id || row.memory_id,
          );
          const draggableRow =
            reorderable &&
            row.type !== "year_break" &&
            row.type !== "on_this_day";
          return (
            <div key={row.id}>
              <article
                draggable={draggableRow}
                onDragStart={() => setDraggedId(row.id)}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                onDragOver={(e) => {
                  if (!reorderable || !draggedId || draggedId === row.id)
                    return;
                  e.preventDefault();
                  setDragOverId(row.id);
                }}
                onDrop={(e) => {
                  if (!reorderable) return;
                  e.preventDefault();
                  onDrop(row.id);
                }}
                className={`rounded-2xl border p-4 transition ${row.is_published ? "border-black/7 bg-[#FBF8F5]" : "border-dashed border-black/10 bg-black/[.02] opacity-55"} ${dragOverId === row.id ? "ring-2 ring-burgundy/50" : ""} ${draggedId === row.id ? "opacity-40" : ""} ${busyId === row.id ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[1.4px] opacity-55">
                  <input
                    type="checkbox"
                    aria-label="Выбрать элемент"
                    checked={selected.has(row.id)}
                    onChange={() => toggleSelected(row.id)}
                    className="h-4 w-4 accent-[#4A1B2F]"
                  />
                  {draggableRow && (
                    <GripVertical
                      size={13}
                      className="cursor-grab opacity-40"
                    />
                  )}
                  <span>{row.type}</span>
                  <span>·</span>
                  <span>{dateTime(row.occurred_at)}</span>
                  {row.mood && <span>· {row.mood}</span>}
                  <span className="ml-auto">важность {row.importance}</span>
                </div>
                {m && (
                  <div className="mt-3">
                    <div className="text-xs opacity-45">{m.sender_name}</div>
                    {textEditing === m.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={displayText}
                          onChange={(e) => setDisplayText(e.target.value)}
                          className="min-h-28 w-full rounded-xl border p-3 text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => void saveText(m.id)}
                            className="rounded-lg bg-burgundy px-3 py-2 text-xs text-white"
                          >
                            Сохранить текст
                          </button>
                          <button
                            onClick={() => setTextEditing(null)}
                            className="rounded-lg border px-3 py-2 text-xs"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap font-serif text-lg">
                        {m.display_text ??
                          m.original_text ??
                          "медиа без подписи"}
                      </p>
                    )}
                  </div>
                )}
                {row.memory_id &&
                  (() => {
                    const mem = memMap.get(row.memory_id);
                    if (!mem)
                      return (
                        <div className="mt-3 rounded-xl bg-white p-3 text-xs opacity-55">
                          Загрузка воспоминания…
                        </div>
                      );
                    return (
                      <div className="mt-3">
                        <div className="text-xs opacity-45">
                          {row.type === "special"
                            ? "Особенный момент"
                            : row.type === "interactive"
                              ? `Интерактив · ${String(mem.metadata?.interaction ?? "секрет")}`
                              : "Воспоминание"}
                          {mem.photo_storage_path && " · с фото"}
                        </div>
                        {memEditing === row.id ? (
                          <div className="mt-2 space-y-2">
                            <input
                              value={memForm.title}
                              onChange={(e) =>
                                setMemForm({
                                  ...memForm,
                                  title: e.target.value,
                                })
                              }
                              placeholder="Название (необязательно)"
                              className="w-full rounded-xl border p-3 text-sm"
                            />
                            <textarea
                              value={memForm.body}
                              onChange={(e) =>
                                setMemForm({ ...memForm, body: e.target.value })
                              }
                              className="min-h-28 w-full rounded-xl border p-3 text-sm"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => void saveMemory(row)}
                                className="rounded-lg bg-burgundy px-3 py-2 text-xs text-white"
                              >
                                Сохранить текст
                              </button>
                              <button
                                onClick={() => setMemEditing(null)}
                                className="rounded-lg border px-3 py-2 text-xs"
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {mem.title && (
                              <div className="mt-1 font-serif text-lg text-burgundy">
                                {mem.title}
                              </div>
                            )}
                            <p className="mt-1 whitespace-pre-wrap font-serif text-lg">
                              {mem.body || "Текст не заполнен"}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })()}
                {row.screenshot_id &&
                  (() => {
                    const shot = shotMap.get(row.screenshot_id);
                    if (!shot)
                      return (
                        <div className="mt-3 rounded-xl bg-white p-3 text-xs opacity-55">
                          Загрузка скриншота…
                        </div>
                      );
                    return (
                      <div className="mt-3">
                        <div className="text-xs opacity-45">
                          Скриншот · {shot.position} · {shot.animation}
                        </div>
                        {shotEditing === row.id ? (
                          <div className="mt-2 space-y-2">
                            <input
                              value={shotForm.title}
                              onChange={(e) =>
                                setShotForm({
                                  ...shotForm,
                                  title: e.target.value,
                                })
                              }
                              placeholder="Заголовок"
                              className="w-full rounded-xl border p-3 text-sm"
                            />
                            <textarea
                              value={shotForm.description}
                              onChange={(e) =>
                                setShotForm({
                                  ...shotForm,
                                  description: e.target.value,
                                })
                              }
                              placeholder="Описание"
                              className="min-h-20 w-full rounded-xl border p-3 text-sm"
                            />
                            <input
                              value={shotForm.caption}
                              onChange={(e) =>
                                setShotForm({
                                  ...shotForm,
                                  caption: e.target.value,
                                })
                              }
                              placeholder="Подпись"
                              className="w-full rounded-xl border p-3 text-sm"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => void saveShot(row)}
                                className="rounded-lg bg-burgundy px-3 py-2 text-xs text-white"
                              >
                                Сохранить текст
                              </button>
                              <button
                                onClick={() => setShotEditing(null)}
                                className="rounded-lg border px-3 py-2 text-xs"
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {shot.title && (
                              <div className="mt-1 font-serif text-lg text-burgundy">
                                {shot.title}
                              </div>
                            )}
                            <p className="mt-1 whitespace-pre-wrap text-sm opacity-70">
                              {shot.description || "Без описания"}
                            </p>
                            {shot.caption && (
                              <p className="mt-1 whitespace-pre-wrap font-serif text-lg">
                                {shot.caption}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                {row.type === "chapter" && <div className="mt-3 rounded-xl bg-white p-3"><div className="text-[10px] uppercase tracking-[1.6px] text-gold">глава {String(row.metadata?.number ?? "")}</div>{chapterEditing === row.id ? <div className="mt-2 space-y-2"><input value={chapterForm.title} onChange={(event) => setChapterForm({ ...chapterForm, title: event.target.value })} placeholder="Название главы" className="w-full rounded-xl border p-3 text-sm" /><textarea value={chapterForm.subtitle} onChange={(event) => setChapterForm({ ...chapterForm, subtitle: event.target.value })} placeholder="Подзаголовок" className="min-h-20 w-full rounded-xl border p-3 text-sm" /><input value={chapterForm.number} onChange={(event) => setChapterForm({ ...chapterForm, number: event.target.value })} placeholder="Номер" inputMode="numeric" className="w-full rounded-xl border p-3 text-sm" /><button type="button" onClick={() => void saveChapter(row)} className="rounded-lg bg-burgundy px-3 py-2 text-xs text-white">Сохранить главу</button></div> : <><div className="mt-1 font-serif text-2xl text-burgundy">{String(row.metadata?.title ?? "Новая глава")}</div>{row.metadata?.subtitle && <p className="mt-1 text-sm opacity-55">{String(row.metadata.subtitle)}</p>}</>}</div>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" aria-label="Переместить выше" title="Выше" disabled={!reorderable || i === 0 || busyId === row.id} onClick={() => moveOne(row, -1)} className="rounded-lg border px-2.5 py-2 text-xs disabled:opacity-25"><ArrowUp size={14} /></button>
                  <button type="button" aria-label="Переместить ниже" title="Ниже" disabled={!reorderable || i === visible.length - 1 || busyId === row.id} onClick={() => moveOne(row, 1)} className="rounded-lg border px-2.5 py-2 text-xs disabled:opacity-25"><ArrowDown size={14} /></button>
                  <button
                    onClick={() => {
                      if (m) {
                        setTextEditing(m.id);
                        setDisplayText(m.display_text ?? m.original_text ?? "");
                      } else if (row.memory_id) {
                        const mem = memMap.get(row.memory_id);
                        setMemEditing(row.id);
                        setMemForm({
                          title: mem?.title ?? "",
                          body: mem?.body ?? "",
                        });
                      } else if (row.screenshot_id) {
                        const shot = shotMap.get(row.screenshot_id);
                        setShotEditing(row.id);
                        setShotForm({
                          title: shot?.title ?? "",
                          description: shot?.description ?? "",
                          caption: shot?.caption ?? "",
                        });
                      } else if (row.type === "chapter") {
                        setChapterEditing(row.id);
                        setChapterForm({ title: String(row.metadata?.title ?? ""), subtitle: String(row.metadata?.subtitle ?? ""), number: String(row.metadata?.number ?? "") });
                      }
                    }}
                    disabled={!m && !row.memory_id && !row.screenshot_id && row.type !== "chapter"}
                    className="rounded-lg border px-3 py-2 text-xs disabled:opacity-30"
                  >
                    Текст
                  </button>
                  <button
                    onClick={() => { setDateEditing(dateEditing === row.id ? null : row.id); setDateValue(row.occurred_at.slice(0, 16)); }}
                    className="rounded-lg border px-3 py-2 text-xs"
                  >
                    <CalendarClock size={13} className="mr-1 inline" />Дата
                  </button>
                  <button
                    onClick={() => {
                      setEditing(editing === row.id ? null : row.id);
                      setStyleValue((row.style ?? {}) as StyleValue);
                    }}
                    className="rounded-lg border px-3 py-2 text-xs"
                  >
                    {editing === row.id ? "Скрыть оформление" : "Оформление"}
                  </button>
                  <button
                    onClick={() => void toggle(row)}
                    className="rounded-lg border px-3 py-2 text-xs"
                  >
                    {row.is_published ? "Скрыть" : "Опубликовать"}
                  </button>
                  <button
                    disabled={bulkBusy}
                    onClick={() => void deleteElements([row.id])}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700"
                  >
                    <Trash2 size={13} className="mr-1 inline" />
                    Удалить
                  </button>
                </div>
                {dateEditing === row.id && <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-black/5 bg-white p-3"><input type="datetime-local" value={dateValue} onChange={(event) => setDateValue(event.target.value)} className="min-w-0 flex-1 rounded-lg border p-2 text-sm" /><button type="button" onClick={() => void saveDate(row)} className="rounded-lg bg-burgundy px-3 py-2 text-xs text-white">Сохранить дату</button></div>}
                {editing === row.id && (
                  <div className="mt-3">
                    <StyleEditor
                      value={styleValue}
                      onChange={setStyleValue}
                      hasMedia={hasMedia}
                    />
                    <button
                      onClick={() => void saveStyle(row)}
                      className="mt-2 rounded-lg bg-burgundy px-3 py-2 text-xs text-white"
                    >
                      <Save size={13} className="mr-1 inline" />
                      Сохранить оформление
                    </button>
                  </div>
                )}
              </article>
              <InsertGap
                prevId={row.id}
                nextId={visible[i + 1]?.id ?? null}
                reorderable={reorderable}
                insertGap={insertGap}
                insertKind={insertKind}
                insertTitle={insertTitle}
                insertBody={insertBody}
                insertBusy={insertBusy}
                insertError={insertError}
                onOpen={openInsert}
                onClose={() => setInsertGap(null)}
                onPickKind={setInsertKind}
                onTitleChange={setInsertTitle}
                onBodyChange={setInsertBody}
                onFileChange={setInsertFile}
                onSubmit={() => void submitInsert()}
              />
            </div>
          );
        })}
        {reorderable && visible.length > 0 && (
          <div
            onDragOver={(e) => {
              if (!draggedId) return;
              e.preventDefault();
              setDragOverId("end");
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop("end");
            }}
            className={`mt-1 rounded-xl border border-dashed p-3 text-center text-[11px] opacity-35 ${dragOverId === "end" ? "border-burgundy/50 opacity-70" : "border-black/10"}`}
          >
            перетащи сюда, чтобы переместить в конец страницы
          </div>
        )}
      </div>
      <div className="mt-5 flex items-center justify-between text-xs">
        <button
          disabled={page === 0}
          onClick={() => setPage((x) => Math.max(0, x - 1))}
          className="rounded-lg border px-3 py-2 disabled:opacity-30"
        >
          Назад
        </button>
        <span className="opacity-45">страница {page + 1}</span>
        <button
          disabled={rows.length < pageSize}
          onClick={() => setPage((x) => x + 1)}
          className="rounded-lg border px-3 py-2 disabled:opacity-30"
        >
          Дальше
        </button>
      </div>
    </section>
  );
}

function MemoriesPanel({ specialOnly }: { specialOnly: boolean }) {
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const empty = {
    title: "",
    body: "",
    occurredAt: "",
    importance: 3,
    special: specialOnly,
    placeAfter: "",
    style: {} as StyleValue,
    photo: null as File | null,
  };
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabase
      .from("memories")
      .select(
        "id,title,body,occurred_at,importance,place_after_message_id,photo_storage_path,style,metadata",
      )
      .order("occurred_at", { ascending: false });
    const all = (data ?? []) as MemoryRow[];
    setRows(
      all.filter((r) =>
        specialOnly
          ? r.metadata?.kind === "special"
          : r.metadata?.kind !== "special" &&
            r.metadata?.kind !== "interactive",
      ),
    );
  }, [specialOnly]);
  useEffect(() => {
    void load();
  }, [load]);
  function reset() {
    setEditingId(null);
    setForm(empty);
    setMessage("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      if (!form.body.trim() || !form.occurredAt)
        throw new Error("Заполни текст и дату.");
      const id = editingId ?? crypto.randomUUID();
      let photoPath = rows.find((x) => x.id === id)?.photo_storage_path ?? null;
      if (form.photo) {
        const safe = form.photo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        photoPath = `manual/memories/${id}/${safe}`;
        const { error: upError } = await supabase.storage
          .from("screenshots")
          .upload(photoPath, form.photo, {
            upsert: true,
            contentType: form.photo.type || "image/jpeg",
          });
        if (upError) throw upError;
      }
      const payload = {
        title: form.title.trim() || null,
        body: form.body.trim(),
        occurred_at: `${form.occurredAt}Z`,
        importance: Number(form.importance),
        place_after_message_id: form.placeAfter || null,
        photo_storage_path: photoPath,
        style: form.style,
        metadata: form.special ? { kind: "special" } : {},
      };
      const result = editingId
        ? await supabase.from("memories").update(payload).eq("id", editingId)
        : await supabase.from("memories").insert({ id, ...payload });
      if (result.error) throw result.error;
      reset();
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Не удалось сохранить.");
    }
  }
  async function edit(row: MemoryRow) {
    setEditingId(row.id);
    setForm({
      title: row.title ?? "",
      body: row.body,
      occurredAt: row.occurred_at.slice(0, 16),
      importance: row.importance,
      special: row.metadata?.kind === "special",
      placeAfter: row.place_after_message_id ?? "",
      style: (row.style ?? {}) as StyleValue,
      photo: null,
    });
  }
  async function remove(row: MemoryRow) {
    if (!window.confirm(`Удалить «${row.title ?? "воспоминание"}»?`)) return;
    const { error } = await supabase.from("memories").delete().eq("id", row.id);
    if (error) window.alert(error.message);
    else {
      if (row.photo_storage_path)
        await supabase.storage
          .from("screenshots")
          .remove([row.photo_storage_path]);
      await load();
    }
  }
  return (
    <section className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
      <form
        onSubmit={(e) => void save(e)}
        className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
      >
        <h1 className="font-serif text-3xl text-burgundy">
          {specialOnly ? "Особенные моменты" : "Воспоминания"}
        </h1>
        <p className="mt-1 text-xs opacity-50">
          {specialOnly
            ? "Редкие главы, которые должны визуально выделяться."
            : "Ручные элементы книги поверх импортированной переписки."}
        </p>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Название"
          className="mt-5 w-full rounded-xl border p-3 text-sm"
        />
        <textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="Текст"
          className="mt-3 min-h-36 w-full rounded-xl border p-3 text-sm"
        />
        <input
          type="datetime-local"
          value={form.occurredAt}
          onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
          required
          className="mt-3 w-full rounded-xl border p-3 text-sm"
        />
        <label className="mt-3 block text-xs opacity-55">
          Важность: {form.importance}
          <input
            type="range"
            min="0"
            max="5"
            value={form.importance}
            onChange={(e) =>
              setForm({ ...form, importance: Number(e.target.value) })
            }
            className="mt-2 w-full"
          />
        </label>
        <label className="mt-3 block text-sm">
          Фото или своя гифка (.gif){" "}
          <input
            type="file"
            accept="image/*,.gif"
            onChange={(e) =>
              setForm({ ...form, photo: e.target.files?.[0] ?? null })
            }
            className="mt-2 block w-full rounded-xl border p-3 text-xs"
          />
          <span className="mt-1 block text-[11px] opacity-45">
            GIF воспроизводится сама, отдельно ничего включать не нужно.
          </span>
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.special}
            onChange={(e) => setForm({ ...form, special: e.target.checked })}
          />{" "}
          Особенный момент
        </label>
        <div className="mt-3">
          <MessageAnchorPicker
            value={form.placeAfter}
            onChange={(placeAfter) => setForm({ ...form, placeAfter })}
          />
        </div>
        <div className="mt-4">
          <StyleEditor
            value={form.style}
            onChange={(v) => setForm({ ...form, style: v })}
            hasMedia={Boolean(form.photo)}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <button className="rounded-xl bg-burgundy px-4 py-2 text-sm text-white">
            <Save size={14} className="mr-1 inline" />
            {editingId ? "Сохранить" : "Добавить"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border px-4 py-2 text-sm"
            >
              Отмена
            </button>
          )}
        </div>
        {message && <p className="mt-3 text-sm text-red-700">{message}</p>}
      </form>
      <div className="space-y-3">
        {rows.map((row) => (
          <article
            key={row.id}
            className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[2px] text-gold">
                  {row.metadata?.kind === "special"
                    ? "особенный"
                    : "воспоминание"}
                </div>
                <h2 className="mt-1 font-serif text-2xl text-burgundy">
                  {row.title ?? "Без названия"}
                </h2>
              </div>
              <div className="text-right text-xs opacity-45">
                {dateTime(row.occurred_at)}
                <br />
                важность {row.importance}
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap font-serif text-lg leading-relaxed">
              {row.body}
            </p>
            {row.photo_storage_path && (
              <div className="mt-3 text-xs opacity-45">Фото прикреплено</div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void edit(row)}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                Изменить
              </button>
              <button
                onClick={() => void remove(row)}
                className="rounded-lg border px-3 py-2 text-xs text-red-700"
              >
                <Trash2 size={13} className="mr-1 inline" />
                Удалить
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ScreenshotsPanel() {
  const [rows, setRows] = useState<ScreenshotRow[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    caption: "",
    occurredAt: "",
    position: "custom",
    animation: "fade",
    anchorMessageId: "",
    style: { frame: "phone" } as StyleValue,
    collectionLayout: "carousel",
    reactionEmoji: "❤",
    reactionText: "",
  });
  const [message, setMessage] = useState("");
  const load = async () => {
    const { data } = await supabase
      .from("screenshots")
      .select(
        "id,storage_path,title,description,caption,occurred_at,place_after_message_id,animation,position,style,collection_id,collection_order,collection_layout,reaction_emoji,reaction_text",
      )
      .order("occurred_at", { ascending: false });
    setRows((data ?? []) as ScreenshotRow[]);
  };
  useEffect(() => {
    void load();
  }, []);
  function reset() {
    setEditing(null);
    setFiles([]);
    setForm({
      title: "",
      description: "",
      caption: "",
      occurredAt: "",
      position: "custom",
      animation: "fade",
      anchorMessageId: "",
      style: { frame: "phone" },
      collectionLayout: "carousel",
      reactionEmoji: "❤",
      reactionText: "",
    });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      if (!form.occurredAt) throw new Error("Укажи дату.");
      const id = editing ?? crypto.randomUUID();
      let storagePath = rows.find((r) => r.id === id)?.storage_path ?? "";
      const file = files[0] ?? null;
      if (file) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        storagePath = `manual/screenshots/${id}/${safe}`;
        const { error } = await supabase.storage
          .from("screenshots")
          .upload(storagePath, file, {
            upsert: true,
            contentType: file.type || "image/jpeg",
          });
        if (error) throw error;
      }
      if (!editing && files.length === 0) throw new Error("Выбери изображение.");
      if (files.length > 12) throw new Error("Максимум 12 скриншотов в одном альбоме.");
      if (editing && !storagePath) throw new Error("Выбери изображение.");
      const baseTime = new Date(`${form.occurredAt}Z`).getTime();
      const placementTime =
        form.anchorMessageId &&
        (form.position === "after_message" ||
          form.position === "before_message")
          ? baseTime + (form.position === "before_message" ? -1 : 1)
          : baseTime;
      const collectionId = !editing && files.length > 1 ? crypto.randomUUID() : rows.find((r) => r.id === id)?.collection_id ?? null;
      const payload = {
        storage_path: storagePath,
        title: form.title.trim() || null,
        description: form.description.trim() || null,
        caption: form.caption.trim() || null,
        occurred_at: new Date(placementTime).toISOString(),
        place_after_message_id: form.anchorMessageId || null,
        position: form.position,
        animation: form.animation,
        style: form.style,
        collection_id: collectionId,
        collection_order: rows.find((r) => r.id === id)?.collection_order ?? 0,
        collection_layout: form.collectionLayout,
        reaction_emoji: form.reactionEmoji || null,
        reaction_text: form.reactionText.trim() || null,
      };
      if (editing) {
        const result = await supabase.from("screenshots").update(payload).eq("id", id);
        if (result.error) throw result.error;
        if (payload.collection_id) {
          const { error: groupError } = await supabase.from("screenshots").update({
            occurred_at: payload.occurred_at,
            place_after_message_id: payload.place_after_message_id,
            position: payload.position,
            animation: payload.animation,
            style: payload.style,
            collection_layout: payload.collection_layout,
          }).eq("collection_id", payload.collection_id).neq("id", id);
          if (groupError) throw groupError;
        }
      } else {
        for (let index = 0; index < files.length; index += 1) {
          const shotId = index === 0 ? id : crypto.randomUUID();
          let path = storagePath;
          if (index > 0) {
            const current = files[index];
            const safe = current.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            path = `manual/screenshots/${shotId}/${safe}`;
            const { error: uploadError } = await supabase.storage.from("screenshots").upload(path, current, { contentType: current.type || "image/jpeg" });
            if (uploadError) throw uploadError;
          }
          const result = await supabase.from("screenshots").insert({
            ...payload,
            id: shotId,
            storage_path: path,
            title: index === 0 ? payload.title : null,
            description: index === 0 ? payload.description : null,
            caption: index === 0 ? payload.caption : null,
            collection_order: index,
            reaction_emoji: index === 0 ? payload.reaction_emoji : null,
            reaction_text: index === 0 ? payload.reaction_text : null,
          });
          if (result.error) throw result.error;
        }
      }
      reset();
      setMessage("Сохранено.");
      await load();
    } catch (e2) {
      setMessage(e2 instanceof Error ? e2.message : "Ошибка сохранения.");
    }
  }
  async function remove(row: ScreenshotRow) {
    const groupRows = row.collection_id ? rows.filter((item) => item.collection_id === row.collection_id) : [row];
    if (!window.confirm(`Удалить ${groupRows.length > 1 ? `весь альбом (${groupRows.length} файлов)` : `«${row.title ?? row.caption ?? "скриншот"}»`}?`))
      return;
    const ids = groupRows.map((item) => item.id);
    const { error } = await supabase.from("screenshots").delete().in("id", ids);
    if (error) window.alert(error.message);
    else {
      await supabase.storage.from("screenshots").remove(groupRows.map((item) => item.storage_path));
      await load();
    }
  }
  return (
    <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <form
        onSubmit={(e) => void save(e)}
        className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <ImagePlus className="text-burgundy" />
          <h1 className="font-serif text-3xl text-burgundy">Скриншоты</h1>
        </div>
        <input
          type="file"
          accept="image/*,.gif"
          multiple={!editing}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="mt-5 block w-full rounded-xl border border-dashed p-3 text-sm"
        />
        <p className="mt-1 text-[11px] opacity-45">
          Можно выбрать до 12 файлов сразу — они станут одним красивым альбомом.
          Принимает фото и .gif.
        </p>
        {files.length > 0 && <div className="mt-2 rounded-xl bg-burgundy/5 p-2 text-xs text-burgundy">Выбрано файлов: {files.length}</div>}
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Заголовок"
          className="mt-3 w-full rounded-xl border p-3 text-sm"
        />
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Описание"
          className="mt-3 min-h-24 w-full rounded-xl border p-3 text-sm"
        />
        <input
          value={form.caption}
          onChange={(e) => setForm({ ...form, caption: e.target.value })}
          placeholder="Подпись"
          className="mt-3 w-full rounded-xl border p-3 text-sm"
        />
        <input
          type="datetime-local"
          value={form.occurredAt}
          onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
          className="mt-3 w-full rounded-xl border p-3 text-sm"
          required
        />
        <select
          value={form.position}
          onChange={(e) => setForm({ ...form, position: e.target.value })}
          className="mt-3 w-full rounded-xl border p-3 text-sm"
        >
          <option value="after_message">После сообщения</option>
          <option value="after_date">После даты</option>
          <option value="before_message">Перед сообщением</option>
          <option value="custom">Свободная позиция</option>
        </select>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Вид альбома<select value={form.collectionLayout} onChange={(e) => setForm({ ...form, collectionLayout: e.target.value })} className="mt-2 w-full rounded-xl border p-3 text-sm"><option value="carousel">Карусель</option><option value="stack">Стопка снимков</option><option value="collage">Коллаж</option></select></label>
          <label className="text-sm">Реакция на скриншоты<div className="mt-2 flex gap-2"><select value={form.reactionEmoji} onChange={(e) => setForm({ ...form, reactionEmoji: e.target.value })} className="w-20 rounded-xl border p-3"><option>❤</option><option>🥹</option><option>😂</option><option>✨</option><option>💔</option></select><input value={form.reactionText} onChange={(e) => setForm({ ...form, reactionText: e.target.value })} placeholder="Твоя подпись" className="min-w-0 flex-1 rounded-xl border p-3" /></div></label>
        </div>
        <div className="mt-3">
          <MessageAnchorPicker
            value={form.anchorMessageId}
            onChange={(anchorMessageId) =>
              setForm({ ...form, anchorMessageId })
            }
            label="Сообщение-якорь для размещения до/после"
          />
        </div>
        <select
          value={form.animation}
          onChange={(e) => setForm({ ...form, animation: e.target.value })}
          className="mt-3 w-full rounded-xl border p-3 text-sm"
        >
          <option value="fade">Fade</option>
          <option value="float">Float</option>
          <option value="none">Без анимации</option>
        </select>
        <div className="mt-4">
          <StyleEditor
            value={form.style}
            onChange={(v) => setForm({ ...form, style: v })}
            hasMedia
          />
        </div>
        <div className="mt-4 flex gap-2">
          <button className="rounded-xl bg-burgundy px-4 py-2 text-sm text-white">
            <Save size={14} className="mr-1 inline" />
            {editing ? "Сохранить" : "Добавить"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border px-4 py-2 text-sm"
            >
              Отмена
            </button>
          )}
        </div>
        {message && <p className="mt-3 text-sm opacity-60">{message}</p>}
      </form>
      <div className="space-y-3">
        {rows.filter((row) => !row.collection_id || row.collection_order === 0).map((row) => (
          <article
            key={row.id}
            className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
          >
            <div className="text-xs opacity-45">
              {dateTime(row.occurred_at)} · {row.position} · {row.animation}
              {row.collection_id && <> · альбом {rows.filter((item) => item.collection_id === row.collection_id).length} кадров</>}
            </div>
            <h2 className="mt-1 font-serif text-xl text-burgundy">
              {row.title ?? row.caption ?? "Без заголовка"}
            </h2>
            <p className="mt-1 text-sm opacity-60">
              {row.description ?? "Без описания"}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setEditing(row.id);
                  setForm({
                    title: row.title ?? "",
                    description: row.description ?? "",
                    caption: row.caption ?? "",
                    occurredAt: row.occurred_at.slice(0, 16),
                    position: row.position,
                    animation: row.animation,
                    anchorMessageId: row.place_after_message_id ?? "",
                    style: (row.style ?? {}) as StyleValue,
                    collectionLayout: row.collection_layout ?? "carousel",
                    reactionEmoji: row.reaction_emoji ?? "❤",
                    reactionText: row.reaction_text ?? "",
                  });
                }}
                className="rounded-lg border px-3 py-2 text-xs"
              >
                Изменить
              </button>
              <button
                onClick={() => void remove(row)}
                className="rounded-lg border px-3 py-2 text-xs text-red-700"
              >
                Удалить
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MediaPanel() {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    let q = supabase
      .from("media")
      .select(
        "id,original_filename,kind,status,size_bytes,created_at,storage_path,message_id",
      )
      .order("created_at", { ascending: false })
      .limit(250);
    if (status) q = q.eq("status", status);
    const { data } = await q;
    setRows((data ?? []) as MediaRow[]);
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-burgundy">Media manager</h1>
          <p className="text-xs opacity-50">
            Проверка оригиналов, типов и проблемных вложений.
          </p>
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border p-2 text-sm"
        >
          <option value="">Все статусы</option>
          <option value="stored">stored</option>
          <option value="missing">missing</option>
          <option value="failed">failed</option>
        </select>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-black/10 uppercase tracking-[1px] opacity-45">
            <tr>
              <th className="p-3">Файл</th>
              <th className="p-3">Тип</th>
              <th className="p-3">Статус</th>
              <th className="p-3">Размер</th>
              <th className="p-3">Storage</th>
              <th className="p-3">Дата</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-black/5">
                <td className="p-3">{r.original_filename}</td>
                <td className="p-3">{r.kind}</td>
                <td
                  className={`p-3 ${r.status === "stored" ? "text-emerald-700" : r.status === "missing" ? "text-amber-700" : "text-red-700"}`}
                >
                  {r.status}
                </td>
                <td className="p-3">
                  {r.size_bytes
                    ? `${(r.size_bytes / 1024 / 1024).toFixed(1)} MB`
                    : "—"}
                </td>
                <td className="max-w-[220px] truncate p-3">
                  {r.storage_path ?? "—"}
                </td>
                <td className="p-3 opacity-55">{dateTime(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SettingsPanel() {
  const [title, setTitle] = useState("Для тебя");
  const [name, setName] = useState("");
  const [colors, setColors] = useState(themeDefaults);
  const [advanced, setAdvanced] = useState("{}");
  const [password, setPassword] = useState("");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [initialPasswordEnabled, setInitialPasswordEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [specialMomentLabel, setSpecialMomentLabel] = useState(
    DEFAULT_SPECIAL_MOMENT_LABEL,
  );
  const [timeFormat, setTimeFormat] =
    useState<TimeFormatId>(DEFAULT_TIME_FORMAT);
  const [readerFont, setReaderFont] = useState("serif");
  const [dateStyle, setDateStyle] = useState("line");
  const [dateAlign, setDateAlign] = useState("left");
  const [dateFont, setDateFont] = useState("sans");
  const [hideTime, setHideTime] = useState(false);
  const [coverSubtitle, setCoverSubtitle] = useState("история впереди");
  const [closingMessage, setClosingMessage] = useState("история продолжается");
  const [coverBackgroundUrl, setCoverBackgroundUrl] = useState("");
  useEffect(() => {
    supabase
      .from("history_settings")
      .select(
        "reader_title,contact_display_name,theme,reader_requires_password",
      )
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTitle(data.reader_title);
          setName(data.contact_display_name ?? "");
          const t = { ...themeDefaults, ...(data.theme ?? {}) } as Record<
            string,
            string
          >;
          setColors(t);
          setAdvanced(JSON.stringify(data.theme ?? {}, null, 2));
          setPasswordEnabled(Boolean(data.reader_requires_password));
          setInitialPasswordEnabled(Boolean(data.reader_requires_password));
          const theme = (data.theme ?? {}) as Record<string, unknown>;
          if (
            typeof theme.specialMomentLabel === "string" &&
            theme.specialMomentLabel.trim()
          )
            setSpecialMomentLabel(theme.specialMomentLabel);
          if (
            typeof theme.timeFormat === "string" &&
            TIME_FORMAT_OPTIONS.some((o) => o.id === theme.timeFormat)
          )
            setTimeFormat(theme.timeFormat as TimeFormatId);
          if (typeof theme.readerFont === "string") setReaderFont(theme.readerFont);
          if (typeof theme.dateStyle === "string") setDateStyle(theme.dateStyle);
          if (typeof theme.dateAlign === "string") setDateAlign(theme.dateAlign);
          if (typeof theme.dateFont === "string") setDateFont(theme.dateFont);
          setHideTime(theme.hideTime === true);
          if (typeof theme.coverSubtitle === "string") setCoverSubtitle(theme.coverSubtitle);
          if (typeof theme.closingMessage === "string") setClosingMessage(theme.closingMessage);
          if (typeof theme.coverBackgroundUrl === "string") setCoverBackgroundUrl(theme.coverBackgroundUrl);
        }
      });
  }, []);
  async function save() {
    try {
      if (passwordEnabled && !initialPasswordEnabled && !password)
        throw new Error("Укажи пароль перед включением защиты.");
      if (coverBackgroundUrl.trim() && !safeRemoteUrl(coverBackgroundUrl))
        throw new Error("Фон обложки должен быть полной ссылкой https://…");
      let parsed: Record<string, unknown> = JSON.parse(advanced || "{}");
      parsed = {
        ...parsed,
        ...colors,
        specialMomentLabel:
          specialMomentLabel.trim() || DEFAULT_SPECIAL_MOMENT_LABEL,
        timeFormat,
        readerFont,
        dateStyle,
        dateAlign,
        dateFont,
        hideTime,
        coverSubtitle: coverSubtitle.trim() || "история впереди",
        closingMessage: closingMessage.trim() || "история продолжается",
        coverBackgroundUrl: coverBackgroundUrl.trim(),
      };
      const { error } = await supabase.rpc("update_history_settings", {
        p_reader_title: title,
        p_contact_display_name: name,
        p_theme: parsed,
      });
      if (error) throw error;
      if (password || passwordEnabled === false) {
        const { error: pError } = await supabase.rpc("set_reader_password", {
          p_password: passwordEnabled ? password : "",
        });
        if (pError) throw pError;
      }
      setPassword("");
      setInitialPasswordEnabled(passwordEnabled);
      setAdvanced(JSON.stringify(parsed, null, 2));
      setMessage("Настройки сохранены.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка сохранения.");
    }
  }
  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Settings2 className="text-burgundy" />
        <div>
          <h1 className="font-serif text-3xl text-burgundy">
            Настройки истории
          </h1>
          <p className="text-xs opacity-50">
            Визуальная тема reader и доступ к публичной странице.
          </p>
        </div>
      </div>
      <label className="mt-6 block text-sm">
        Название
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-2 w-full rounded-xl border p-3"
        />
      </label>
      <label className="mt-4 block text-sm">
        Имя контакта, только для админки
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-2 w-full rounded-xl border p-3"
        />
      </label>
      <label className="mt-4 block text-sm">
        Название для «особых моментов»
        <input
          value={specialMomentLabel}
          onChange={(e) => setSpecialMomentLabel(e.target.value)}
          placeholder={DEFAULT_SPECIAL_MOMENT_LABEL}
          className="mt-2 w-full rounded-xl border p-3"
        />
        <span className="mt-1 block text-xs opacity-45">
          Подпись над элементами, отмеченными как «Особенный момент» — например
          «наш момент», «важная страница», «навсегда».
        </span>
      </label>
      <label className="mt-4 block text-sm">
        Формат даты и времени
        <select
          value={timeFormat}
          onChange={(e) => setTimeFormat(e.target.value as TimeFormatId)}
          className="mt-2 w-full rounded-xl border p-3 text-sm"
        >
          {TIME_FORMAT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} — {o.hint}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-4 block text-sm">
        Главный шрифт всей истории
        <select value={readerFont} onChange={(event) => setReaderFont(event.target.value)} className="mt-2 w-full rounded-xl border p-3 text-sm">
          {FONT_OPTIONS.filter((option) => option.id).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <span className="mt-1 block text-xs opacity-45">Отдельные элементы по-прежнему можно переопределить в «Оформлении».</span>
      </label>
      <div className="mt-5 rounded-2xl border border-black/5 bg-[#FBF8F5] p-4">
        <div className="text-sm font-medium text-burgundy">Дата во всей истории</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs">Дизайн<select value={dateStyle} onChange={(event) => setDateStyle(event.target.value)} className="mt-2 w-full rounded-xl border p-3 text-sm">{DATE_STYLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label className="text-xs">Расположение<select value={dateAlign} onChange={(event) => setDateAlign(event.target.value)} className="mt-2 w-full rounded-xl border p-3 text-sm">{ALIGN_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label className="text-xs">Шрифт<select value={dateFont} onChange={(event) => setDateFont(event.target.value)} className="mt-2 w-full rounded-xl border p-3 text-sm">{FONT_OPTIONS.filter((option) => ['sans','serif','script','literata','badscript','marck','neucha','comfort'].includes(option.id)).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          <label className="flex items-center gap-2 self-end rounded-xl border p-3 text-sm"><input type="checkbox" checked={hideTime} onChange={(event) => setHideTime(event.target.checked)} />Скрыть время везде</label>
        </div>
        <p className="mt-2 text-[11px] opacity-45">Для отдельной страницы эти параметры можно переопределить в её «Оформлении».</p>
      </div>
      <div className="mt-5 rounded-2xl border border-black/5 bg-[#FBF8F5] p-4">
        <div className="text-sm font-medium text-burgundy">Обложка и финальная фраза</div>
        <input value={coverSubtitle} onChange={(event) => setCoverSubtitle(event.target.value)} placeholder="история впереди" className="mt-3 w-full rounded-xl border p-3" />
        <input value={closingMessage} onChange={(event) => setClosingMessage(event.target.value)} placeholder="история продолжается" className="mt-3 w-full rounded-xl border p-3" />
        <input value={coverBackgroundUrl} onChange={(event) => setCoverBackgroundUrl(event.target.value)} inputMode="url" placeholder="Ссылка на картинку для обложки: https://…" className="mt-3 w-full rounded-xl border p-3" />
        {coverBackgroundUrl && !safeRemoteUrl(coverBackgroundUrl) && <p className="mt-1 text-xs text-red-700">Нужна полная ссылка http:// или https://</p>}
      </div>
      <div className="mt-5">
        <div className="text-sm">Палитра reader</div>
        <div className="mt-3 flex flex-wrap gap-2">{themePresets.map((preset) => <button key={preset.name} type="button" onClick={() => setColors(preset.colors)} className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs hover:border-burgundy/30">{preset.name}</button>)}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(themeDefaults).map(([key]) => (
            <label
              key={key}
              className="rounded-xl border p-2 text-[11px] capitalize"
            >
              <div className="opacity-45">{key}</div>
              <input
                type="color"
                value={colors[key] ?? themeDefaults[key]}
                onChange={(e) =>
                  setColors({ ...colors, [key]: e.target.value })
                }
                className="mt-2 h-9 w-full cursor-pointer rounded"
              />
            </label>
          ))}
        </div>
      </div>
      <label className="mt-5 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={passwordEnabled}
          onChange={(e) => setPasswordEnabled(e.target.checked)}
        />{" "}
        Защитить reader паролем
      </label>
      {passwordEnabled && (
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Новый пароль"
          className="mt-3 w-full rounded-xl border p-3"
        />
      )}
      <details className="mt-5 rounded-xl border border-black/5 bg-black/[.02] p-3"><summary className="cursor-pointer text-xs opacity-55">Технические настройки темы (JSON)</summary><textarea value={advanced} onChange={(e) => setAdvanced(e.target.value)} className="mt-3 h-32 w-full rounded-xl border p-3 font-mono text-xs" /></details>
      <button
        onClick={() => void save()}
        className="mt-5 rounded-xl bg-burgundy px-5 py-3 text-sm text-white"
      >
        <Save size={14} className="mr-1 inline" />
        Сохранить
      </button>
      {message && <p className="mt-3 text-sm opacity-60">{message}</p>}
    </section>
  );
}

function PreviewPanel() {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-burgundy">
            Preview как reader
          </h1>
          <p className="text-xs opacity-50">
            Администратор получает тот же публичный интерфейс. Пароль reader
            здесь безопасно обходится через admin-only preview token.
          </p>
        </div>
        <a
          href="/?preview=1"
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-burgundy px-4 py-2 text-sm text-white"
        >
          <Eye size={14} className="mr-1 inline" />
          Открыть отдельно
        </a>
      </div>
      <div className="flex justify-center">
        <div className="overflow-hidden rounded-[36px] border-[10px] border-[#222] bg-black shadow-2xl">
          <iframe
            title="Reader mobile preview"
            src="/?preview=1"
            className="h-[844px] w-[390px] bg-cream"
          />
        </div>
      </div>
    </section>
  );
}
