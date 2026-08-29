import { supabase } from './supabaseClient';

export interface PublicTimelineCursor {
  occurredAt: string;
  sortTiebreak: number;
  id: string;
}

export interface PublicTimelineRow {
  element_id: string;
  type: string;
  occurred_at: string;
  sort_tiebreak: number;
  style: Record<string, unknown> | null;
  mood: string | null;
  is_published: boolean;
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
}> {
  const { data, error } = await supabase.functions.invoke('public-timeline', {
    body: { cursor },
    headers: token ? { 'x-reader-access-token': token } : undefined,
  });
  if (error || data?.error) throw new Error(error?.message ?? data?.error ?? 'Не удалось загрузить историю.');
  return {
    elements: (data?.elements ?? []) as PublicTimelineRow[],
    hasMore: Boolean(data?.hasMore),
    nextCursor: data?.nextCursor ?? null,
  };
}

export async function fetchMediaUrl(input: { mediaId?: string; screenshotId?: string; memoryId?: string }, token: string): Promise<{ url: string; thumbnailUrl: string | null }> {
  const { data, error } = await supabase.functions.invoke('get-media-url', {
    body: input,
    headers: token ? { 'x-reader-access-token': token } : undefined,
  });
  if (error || data?.error || !data?.url) throw new Error(error?.message ?? data?.error ?? 'Не удалось открыть медиа.');
  return { url: String(data.url), thumbnailUrl: data.thumbnailUrl ? String(data.thumbnailUrl) : null };
}
