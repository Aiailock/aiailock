// ============================================================================
// server/media/types.ts — shared types for Stage 3's media engine.
// Kept dependency-free (no Deno/Node-specific imports) so it can be used both
// from the Deno edge functions and from Node-based self-tests.
// ============================================================================

import type { MediaKind } from '../parser/types.ts';

export type { MediaKind };

/** Storage bucket ids created in supabase/migrations/0003_storage.sql + 0004. */
export type MediaBucket = 'photos' | 'videos' | 'audio' | 'stickers' | 'documents' | 'thumbnails';

export interface PreparedUpload {
  bucket: MediaBucket;
  path: string;
  mimeType: string;
}

/** Result of trying to process one matched media file. */
export interface MediaProcessResult {
  status: 'stored' | 'failed';
  storagePath?: string;
  thumbnailPath?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  error?: string;
}
