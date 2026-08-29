// ============================================================================
// server/media/thumbnail.ts — decodes a photo and produces a small jpeg
// thumbnail + real width/height, using imagescript (pure WASM, no native
// deps — the same reason fflate was chosen for zip: it works unmodified
// under Deno's edge function runtime, no system libraries to install).
//
// DENO-ONLY. Uses a top-level `npm:` specifier, so this file can only be
// imported from supabase/functions/import-zip/index.ts (Deno), never from
// Node/Vite. Kept in server/media/ (not supabase/functions/_shared/) purely
// so it sits next to the rest of the media engine's logic; the npm: import
// still resolves fine from there since Deno resolves specifiers by string,
// not by directory.
//
// Only jpg/jpeg/png are decoded (see mime.ts -> isDecodableImage). webp
// stickers and heic photos are stored as-is without a generated thumbnail —
// an honest, documented gap for this stage (see MEDIA_ENGINE_NOTES in
// import-zip/index.ts), not a silent failure: the reader can always fall
// back to the full image when thumbnail_path is null.
// ============================================================================

import { Image } from 'npm:imagescript@1.3.0';

export interface ThumbnailResult {
  width: number;
  height: number;
  thumbnailBytes: Uint8Array;
}

const THUMBNAIL_MAX_WIDTH = 480;

export async function makeThumbnail(bytes: Uint8Array): Promise<ThumbnailResult> {
  const image = await Image.decode(bytes);
  const width = image.width;
  const height = image.height;

  if (width > THUMBNAIL_MAX_WIDTH) {
    const scaledHeight = Math.round((height / width) * THUMBNAIL_MAX_WIDTH);
    image.resize(THUMBNAIL_MAX_WIDTH, scaledHeight);
  }

  const thumbnailBytes = await image.encodeJPEG(80);
  return { width, height, thumbnailBytes };
}
