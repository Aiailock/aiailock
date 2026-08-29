// Domain types mirroring supabase/migrations/0001_init.sql.
// Kept hand-written (not generated) for stage 1 so the shape is easy to read;
// swap for `supabase gen types typescript` output once the project is linked
// (see README → "Генерация типов из Supabase").

export type Mood =
  | 'normal'
  | 'romantic'
  | 'sad'
  | 'funny'
  | 'deep'
  | 'night'
  | 'memory'
  | 'important'
  | 'hopeful'
  | 'neutral';

export type MediaKind = 'photo' | 'video' | 'audio' | 'sticker' | 'document';
export type MediaStatus = 'pending' | 'stored' | 'missing' | 'failed';

export interface Media {
  id: string;
  importId: string | null;
  messageId: string | null;
  kind: MediaKind;
  originalFilename: string;
  storagePath: string | null;
  thumbnailPath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  status: MediaStatus;
  createdAt: string;
}

export interface Message {
  id: string;
  importId: string | null;
  fingerprint: string;
  senderName: string;
  sentAt: string; // ISO
  isSystemMessage: boolean;
  isMultiline: boolean;
  originalText: string | null;
  displayText: string | null;
  hasMedia: boolean;
  mediaId: string | null;
  reactionEmoji: string | null;
  reactionBy: string | null;
}

// Suggested/applied visual treatment for a timeline element. `frame` values
// correspond to the frame-* renderers in StoryElement.tsx: the original
// approved set (polaroid, gold, flowers, branches, stars, ribbon, minimal,
// washi, ticket, film, heart, sepia, wood, neon, pixel) plus newer ideas
// (hearts, garland, postcard, wax-seal, torn).
//
// `decoration` drives EffectsLayer.tsx and can combine any of: petals,
// confetti, snow, rain, pixel-hearts, fireflies, stardust.
export interface ElementStyle {
  frame?: string;
  background?: string;
  decoration?: string[];
  animation?: string;
  zone?: 'default' | 'night' | 'burgundy' | 'pixel' | 'gif' | 'travel' | 'winter' | 'sepia' | 'rain' | 'romantic';
}

export type TimelineElementType =
  | 'message'
  | 'photo'
  | 'video'
  | 'audio'
  | 'sticker'
  | 'memory'
  | 'special'
  | 'screenshot'
  | 'year_break'
  | 'on_this_day'
  | 'milestone';

export interface TimelineElement {
  id: string;
  type: TimelineElementType;
  occurredAt: string;
  sortTiebreak: number;
  messageId: string | null;
  mediaId: string | null;
  memoryId: string | null;
  screenshotId: string | null;
  style: ElementStyle;
  isPublished: boolean;
  importance: number;
  metadata: Record<string, unknown>;

  // Hydrated on the client after joining — not columns on the table itself.
  message?: Message;
  media?: Media;
  mood?: Mood;
}

export interface Memory {
  id: string;
  title: string | null;
  body: string;
  occurredAt: string;
  placeAfterMessageId: string | null;
  importance: number;
  photoStoragePath: string | null;
  metadata: Record<string, unknown>;
  style: ElementStyle;
}

export interface Screenshot {
  id: string;
  storagePath: string;
  title: string | null;
  description: string | null;
  caption: string | null;
  occurredAt: string;
  placeAfterMessageId: string | null;
  position: string;
  animation: string;
  style: ElementStyle;
}

export type ImportStatus = 'pending' | 'processing' | 'completed' | 'completed_with_warnings' | 'failed';

export interface ImportLogStep {
  step: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  at: string;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  fileSizeBytes: number | null;
  status: ImportStatus;
  startedAt: string;
  finishedAt: string | null;
  messagesFound: number;
  messagesNew: number;
  messagesDuplicate: number;
  mediaFound: number;
  mediaMatched: number;
  mediaMissing: number;
  photosCount: number;
  videosCount: number;
  audioCount: number;
  stickersCount: number;
  errorMessage: string | null;
  log: ImportLogStep[];
}

export interface HistorySettings {
  readerStartsAt: string;
  lastImportedAt: string | null;
  contactDisplayName: string | null;
  readerTitle: string;
  readerRequiresPassword: boolean;
  theme: Record<string, unknown>;
}
