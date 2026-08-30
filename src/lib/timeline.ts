import type { TimelineElement, Message, Media, ElementStyle, Mood } from '@/types/timeline';
import { fetchPublicTimeline, type PublicTimelineCursor } from './readerApi';

function styleOf(value: unknown): ElementStyle {
  return value && typeof value === 'object' ? (value as ElementStyle) : {};
}

function mapElement(row: Awaited<ReturnType<typeof fetchPublicTimeline>>['elements'][number]): TimelineElement {
  const message: Message | undefined = row.message_id && row.original_text !== undefined ? {
    id: row.message_id,
    importId: null,
    fingerprint: '',
    senderName: row.sender_name ?? '',
    sentAt: row.message_sent_at ?? row.occurred_at,
    isSystemMessage: false,
    isMultiline: false,
    originalText: row.original_text,
    displayText: row.display_text,
    hasMedia: Boolean(row.has_media),
    mediaId: row.media_id,
    reactionEmoji: row.reaction_emoji,
    reactionBy: row.reaction_by,
  } : undefined;

  const media: Media | undefined = row.media_id && row.media_kind ? {
    id: row.media_id,
    importId: null,
    messageId: row.message_id,
    kind: row.media_kind as Media['kind'],
    originalFilename: row.media_filename ?? '',
    storagePath: row.storage_path,
    thumbnailPath: row.thumbnail_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    status: row.media_status as Media['status'],
    createdAt: row.occurred_at,
  } : undefined;

  return {
    id: row.element_id,
    type: row.type as TimelineElement['type'],
    occurredAt: row.occurred_at,
    sortTiebreak: Number(row.sort_tiebreak ?? 0),
    messageId: row.message_id,
    mediaId: row.media_id,
    memoryId: row.memory_id,
    screenshotId: row.screenshot_id,
    style: styleOf(row.style),
    isPublished: Boolean(row.is_published),
    visibleFrom: row.visible_from,
    importance: Number(row.importance ?? row.memory_importance ?? 0),
    metadata: row.metadata ?? {},
    message,
    media,
    mood: row.mood as Mood | undefined,
  };
}

export async function fetchTimelinePage(
  cursor?: PublicTimelineCursor,
  token = '',
): Promise<{ elements: TimelineElement[]; hasMore: boolean; nextCursor: PublicTimelineCursor | null }> {
  const result = await fetchPublicTimeline(cursor ?? null, token);
  return {
    elements: result.elements.map(mapElement),
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  };
}
