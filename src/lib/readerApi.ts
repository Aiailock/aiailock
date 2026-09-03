import { supabase } from './supabaseClient';

function activeAiPreviewBatchId(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('aiBatch');
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export interface PublicTimelineCursor {
  displayOrder: number;
  occurredAt: string;
  sortTiebreak: number;
  id: string;
}

export interface PublicChapterSummary {
  elementId: string;
  displayOrder: number;
  storyPosition: number;
  title: string;
}

export interface PublicTimelineRow {
  element_id: string;
  type: string;
  occurred_at: string;
  sort_tiebreak: number;
  display_order: number;
  style: Record<string, unknown> | null;
  mood: string | null;
  is_published: boolean;
  visible_from: string | null;
  message_id: string | null;
  media_id: string | null;
  memory_id: string | null;
  screenshot_id: string | null;
  sender_name: string | null;
  message_sent_at: string | null;
  original_text: string | null;
  display_text: string | null;
  has_media: boolean | null;
  reaction_emoji: string | null;
  reaction_by: string | null;
  media_kind: string | null;
  media_filename: string | null;
  thumbnail_path: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  media_status: string | null;
  memory_title: string | null;
  memory_body: string | null;
  memory_occurred_at: string | null;
  memory_style: Record<string, unknown> | null;
  screenshot_storage_path: string | null;
  screenshot_caption: string | null;
  screenshot_occurred_at: string | null;
  screenshot_style: Record<string, unknown> | null;
  screenshot_title: string | null;
  screenshot_description: string | null;
  screenshot_animation: string | null;
  screenshot_position: string | null;
  screenshot_collection_id: string | null;
  screenshot_collection_order: number | null;
  screenshot_collection_layout: string | null;
  screenshot_reaction_emoji: string | null;
  screenshot_reaction_text: string | null;
  memory_importance: number | null;
  memory_photo_storage_path: string | null;
  memory_metadata: Record<string, unknown> | null;
  importance: number;
  metadata: Record<string, unknown> | null;
}

export interface ReaderSettings {
  reader_title: string;
  reader_requires_password: boolean;
  theme?: Record<string, unknown>;
  configured: boolean;
}

export async function fetchReaderSettings(): Promise<ReaderSettings> {
  const { data, error } = await supabase
    .from('public_settings')
    .select('reader_title,reader_requires_password,theme')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { reader_title: 'Для тебя', reader_requires_password: false, theme: {}, configured: false };
  return { ...(data as Omit<ReaderSettings, 'configured'>), configured: true };
}

export async function requestReaderAccess(password = '', preview = false): Promise<string> {
  const { data, error } = await supabase.functions.invoke('reader-access', { body: { password, preview } });
  if (error || !data?.token) throw new Error(error?.message ?? data?.error ?? 'Не удалось открыть историю.');
  return String(data.token);
}

export async function fetchPublicTimeline(cursor: PublicTimelineCursor | null, token: string): Promise<{
  elements: PublicTimelineRow[];
  hasMore: boolean;
  nextCursor: PublicTimelineCursor | null;
  chapters: PublicChapterSummary[];
  total: number | null;
}> {
  const { data, error } = await supabase.functions.invoke('public-timeline', {
    body: { cursor, previewBatchId: activeAiPreviewBatchId() },
    headers: token ? { 'x-reader-access-token': token } : undefined,
  });
  if (error || data?.error) throw new Error(error?.message ?? data?.error ?? 'Не удалось загрузить историю.');
  return {
    elements: (data?.elements ?? []) as PublicTimelineRow[],
    hasMore: Boolean(data?.hasMore),
    nextCursor: data?.nextCursor ?? null,
    chapters: (data?.chapters ?? []) as PublicChapterSummary[],
    total: typeof data?.total === 'number' ? data.total : null,
  };
}

export function comparePublicTimelineRows(a: PublicTimelineRow, b: PublicTimelineRow): number {
  const order = Number(a.display_order ?? 0) - Number(b.display_order ?? 0);
  return order || a.element_id.localeCompare(b.element_id);
}

export async function fetchResumeTimeline(elementId: string, token: string): Promise<{
  elements: PublicTimelineRow[];
  hasMore: boolean;
  nextCursor: PublicTimelineCursor | null;
  chapters: PublicChapterSummary[];
  total: number | null;
}> {
  const { data, error } = await supabase.functions.invoke('public-timeline', {
    body: { resumeElementId: elementId, previewBatchId: activeAiPreviewBatchId() },
    headers: token ? { 'x-reader-access-token': token } : undefined,
  });
  if (error || data?.error) throw new Error(error?.message ?? data?.error ?? 'Не удалось продолжить историю.');
  return {
    elements: (data?.elements ?? []) as PublicTimelineRow[],
    hasMore: Boolean(data?.hasMore),
    nextCursor: data?.nextCursor ?? null,
    chapters: (data?.chapters ?? []) as PublicChapterSummary[],
    total: typeof data?.total === 'number' ? data.total : null,
  };
}

export type ReaderAnalyticsAction = 'open' | 'progress' | 'complete';

interface NavigatorConnection {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
}

interface NavigatorWithDeviceHints extends Navigator {
  deviceMemory?: number;
  connection?: NavigatorConnection;
  mozConnection?: NavigatorConnection;
  webkitConnection?: NavigatorConnection;
  standalone?: boolean;
}

function versioned(label: string, match: RegExpMatchArray | null): string | null {
  return match?.[1] ? `${label} ${match[1].replace(/_/g, '.')}` : null;
}

function browserName(userAgent: string): string {
  return versioned('Edge', userAgent.match(/Edg(?:A|iOS)?\/([\d.]+)/i))
    ?? versioned('Samsung Internet', userAgent.match(/SamsungBrowser\/([\d.]+)/i))
    ?? versioned('Яндекс Браузер', userAgent.match(/YaBrowser\/([\d.]+)/i))
    ?? versioned('Opera', userAgent.match(/(?:OPR|Opera)\/([\d.]+)/i))
    ?? versioned('Firefox', userAgent.match(/(?:Firefox|FxiOS)\/([\d.]+)/i))
    ?? versioned('Chrome', userAgent.match(/(?:Chrome|CriOS)\/([\d.]+)/i))
    ?? (userAgent.includes('Safari/') ? versioned('Safari', userAgent.match(/Version\/([\d.]+)/i)) : null)
    ?? 'Не определён';
}

function osName(userAgent: string): string {
  return versioned('Android', userAgent.match(/Android\s([\d.]+)/i))
    ?? versioned('iOS', userAgent.match(/(?:iPhone OS|CPU OS)\s([\d_]+)/i))
    ?? versioned('Windows', userAgent.match(/Windows NT\s([\d.]+)/i))
    ?? versioned('macOS', userAgent.match(/Mac OS X\s([\d_]+)/i))
    ?? (userAgent.includes('Linux') ? 'Linux' : 'Не определена');
}

function deviceModel(userAgent: string): string {
  if (/iPad/i.test(userAgent)) return 'Apple iPad';
  if (/iPhone/i.test(userAgent)) return 'Apple iPhone';
  const android = userAgent.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/[^;)]+)?[;)]/i)?.[1]?.trim();
  if (android && !/^(wv|[a-z]{2}-[A-Z]{2})$/.test(android)) return android;
  return /Mobile|Android/i.test(userAgent) ? 'Мобильное устройство' : 'Компьютер';
}

function collectDeviceInfo(): Record<string, unknown> {
  const extended = navigator as NavigatorWithDeviceHints;
  const connection = extended.connection ?? extended.mozConnection ?? extended.webkitConnection;
  const userAgent = navigator.userAgent;
  const isTablet = /iPad|Tablet/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent));
  const isMobile = /Mobile|iPhone|Android/i.test(userAgent);
  return {
    deviceType: isTablet ? 'Планшет' : isMobile ? 'Телефон' : 'Компьютер',
    browser: browserName(userAgent),
    os: osName(userAgent),
    model: deviceModel(userAgent),
    platform: navigator.platform || null,
    language: navigator.language || null,
    languages: navigator.languages ? Array.from(navigator.languages) : [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    timezoneOffset: new Date().getTimezoneOffset(),
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio,
    touchPoints: navigator.maxTouchPoints,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: extended.deviceMemory,
    connectionType: connection?.type,
    effectiveConnectionType: connection?.effectiveType,
    downlinkMbps: connection?.downlink,
    saveData: connection?.saveData,
    colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Тёмная' : 'Светлая',
    displayMode: window.matchMedia('(display-mode: standalone)').matches || extended.standalone ? 'Приложение/PWA' : 'Браузер',
    referrer: document.referrer || null,
  };
}

export async function recordReaderAnalytics(input: {
  action: ReaderAnalyticsAction;
  visitorId: string;
  visitId: string;
  elementId?: string;
  position?: number;
  progress?: number;
  chapter?: string;
}, token: string): Promise<{ total: number | null }> {
  const { data, error } = await supabase.functions.invoke('reader-analytics', {
    body: {
      ...input,
      userAgent: input.action === 'open' ? navigator.userAgent : undefined,
      viewportWidth: input.action === 'open' ? window.innerWidth : undefined,
      deviceInfo: input.action === 'open' ? collectDeviceInfo() : undefined,
    },
    headers: { 'x-reader-access-token': token },
  });
  // Analytics must never interrupt the story. It is intentionally best-effort.
  if (error && import.meta.env.DEV) console.warn('Reader analytics:', error.message);
  return { total: typeof data?.total === 'number' ? data.total : null };
}

export async function recordReaderReaction(input: {
  visitorId: string;
  elementId: string;
  emoji: string;
  note?: string;
}, token: string): Promise<{ emoji: string; count: number }> {
  const { data, error } = await supabase.functions.invoke('reader-reaction', {
    body: input,
    headers: { 'x-reader-access-token': token },
  });
  if (error || data?.error) throw new Error(error?.message ?? data?.error ?? 'Не удалось сохранить реакцию.');
  return { emoji: String(data.emoji), count: Number(data.count ?? 1) };
}

export function getOrCreateReaderVisitorId(): string {
  const key = 'for-you-reader-id';
  let value = localStorage.getItem(key);
  if (!value || !/^[0-9a-f-]{36}$/i.test(value)) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

export async function recordReaderInteractionAnswer(input: {
  visitorId: string;
  elementId: string;
  answerIndex: number;
}, token: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('reader-interaction', {
    body: input,
    headers: { 'x-reader-access-token': token },
  });
  if (error || data?.error) throw new Error(error?.message ?? data?.error ?? 'Не удалось сохранить ответ.');
}

export type ReaderMediaInput = { mediaId?: string; screenshotId?: string; memoryId?: string };
export interface ReaderMediaUrl { url: string; thumbnailUrl: string | null }

const mediaUrlCache = new Map<string, ReaderMediaUrl>();
const mediaUrlRequests = new Map<string, Promise<ReaderMediaUrl>>();

function mediaInputKey(input: ReaderMediaInput) {
  if (input.mediaId) return `media:${input.mediaId}`;
  if (input.screenshotId) return `screenshot:${input.screenshotId}`;
  return `memory:${input.memoryId ?? ''}`;
}

export function readerMediaInput(row: PublicTimelineRow): ReaderMediaInput | null {
  if (row.media_id) return { mediaId: row.media_id };
  if (row.screenshot_id) return { screenshotId: row.screenshot_id };
  if (row.memory_id && row.memory_photo_storage_path) return { memoryId: row.memory_id };
  return null;
}

export function peekMediaUrl(input: ReaderMediaInput | null): ReaderMediaUrl | null {
  return input ? mediaUrlCache.get(mediaInputKey(input)) ?? null : null;
}

export async function fetchMediaUrl(input: ReaderMediaInput, token: string): Promise<ReaderMediaUrl> {
  const key = mediaInputKey(input);
  const cached = mediaUrlCache.get(key);
  if (cached) return cached;
  const pending = mediaUrlRequests.get(key);
  if (pending) return pending;

  const request = supabase.functions.invoke('get-media-url', {
    body: input,
    headers: token ? { 'x-reader-access-token': token } : undefined,
  }).then(({ data, error }) => {
    if (error || data?.error || !data?.url) throw new Error(error?.message ?? data?.error ?? 'Не удалось открыть медиа.');
    const result = { url: String(data.url), thumbnailUrl: data.thumbnailUrl ? String(data.thumbnailUrl) : null };
    mediaUrlCache.set(key, result);
    return result;
  }).finally(() => mediaUrlRequests.delete(key));

  mediaUrlRequests.set(key, request);
  return request;
}

export async function fetchBackgroundMusicUrl(token: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('get-media-url', {
    body: { backgroundMusic: true },
    headers: token ? { 'x-reader-access-token': token } : undefined,
  });
  if (error || data?.error || !data?.url) throw new Error(error?.message ?? data?.error ?? 'Фоновая музыка недоступна.');
  return String(data.url);
}

function warmImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve();
    };
    const timeout = window.setTimeout(done, 5500);
    image.onload = done;
    image.onerror = done;
    image.decoding = 'async';
    image.src = url;
    if (image.complete) done();
  });
}

export async function preloadTimelineMedia(
  rows: PublicTimelineRow[],
  token: string,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  const tasks = new Map<string, () => Promise<void>>();

  for (const row of rows) {
    const external = typeof row.style?.externalMediaUrl === 'string' ? row.style.externalMediaUrl : '';
    const externalKind = typeof row.style?.externalMediaKind === 'string' ? row.style.externalMediaKind : '';
    if (/^https?:\/\//i.test(external) && ['image', 'photo', 'gif'].includes(externalKind)) {
      tasks.set(`external:${external}`, () => warmImage(external));
    }
    const externalCover = typeof row.metadata?.coverUrl === 'string' ? row.metadata.coverUrl : '';
    if (/^https?:\/\//i.test(externalCover)) tasks.set(`cover:${externalCover}`, () => warmImage(externalCover));

    const input = readerMediaInput(row);
    if (!input) continue;
    const kind = row.media_kind ?? ((row.screenshot_id || row.memory_photo_storage_path) ? 'photo' : 'document');
    // Video/audio/document URLs are intentionally requested only when they
    // approach the viewport: their private signed links should not expire
    // while the reader is still near the beginning of a long story.
    if (kind !== 'photo' && kind !== 'sticker' && !row.screenshot_id) continue;
    const key = mediaInputKey(input);
    tasks.set(key, async () => {
      const result = await fetchMediaUrl(input, token);
      if (kind === 'photo' || kind === 'sticker' || row.screenshot_id) await warmImage(result.url);
      else if (result.thumbnailUrl) await warmImage(result.thumbnailUrl);
    });
  }

  const queue = Array.from(tasks.values());
  const total = queue.length;
  let index = 0;
  let completed = 0;
  onProgress?.(0, total);

  async function worker() {
    while (index < queue.length) {
      const task = queue[index++];
      try { await task(); } catch { /* one broken file must not block the book */ }
      completed += 1;
      onProgress?.(completed, total);
    }
  }

  await Promise.all(Array.from({ length: Math.min(2, Math.max(1, total)) }, () => worker()));
}
