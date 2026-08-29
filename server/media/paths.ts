// ============================================================================
// server/media/paths.ts — pure, dependency-free helpers for mapping a media
// row (kind + filename) onto a Storage bucket + object path. No Deno/Node
// APIs used here, so this file runs identically in the edge function (Deno)
// and in `npx tsx server/media/selfTest.ts` (Node) — same code, same result,
// no risk of the two drifting apart.
// ============================================================================

import type { MediaBucket, MediaKind } from './types.ts';

/** One bucket per content kind, matching supabase/migrations/0003 + 0004. */
export function bucketForKind(kind: MediaKind): MediaBucket {
  switch (kind) {
    case 'photo':
      return 'photos';
    case 'video':
      return 'videos';
    case 'audio':
      return 'audio';
    case 'sticker':
      return 'stickers';
    case 'document':
      return 'documents';
  }
}

/**
 * Strip path separators and anything outside a conservative safe set, so a
 * crafted filename inside a ZIP can never escape its folder or collide with
 * Storage's own path parsing. WhatsApp filenames are already simple
 * (`IMG-20260412-WA0013.jpg`) — this is a defensive floor, not the common
 * case.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split('/').pop() ?? name;
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned.length > 0 ? cleaned.slice(0, 180) : 'file';
}

/**
 * Storage object path for an original media file:
 *   {kind_bucket}/{import_id}/{media_id}_{safe_original_filename}
 * Prefixing with media_id (not just filename) guarantees uniqueness even
 * when WhatsApp reuses filenames across exports/devices, and `upsert: true`
 * on the actual upload call makes re-running the same import idempotent.
 */
export function buildStoragePath(importId: string, mediaId: string, originalFilename: string): string {
  return `${importId}/${mediaId}_${sanitizeFilename(originalFilename)}`;
}

/** Thumbnail is always a small jpeg keyed only by media id — one per media row. */
export function buildThumbnailPath(mediaId: string): string {
  return `${mediaId}.jpg`;
}
