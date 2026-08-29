// ============================================================================
// server/media/thumbnail.ts
//
// DENO-ONLY.
// Creates a small JPEG thumbnail and returns the original image dimensions.
//
// IMPORTANT:
// Do NOT use ImageScript here. ImageScript 1.3.0 loads Node-specific codecs
// inside Supabase Edge Runtime and causes:
//
//   unsupported arch/platform: Not supported
//
// This implementation uses ImageMagick WASM, which is compatible with the
// Supabase/Deno Edge Runtime.
// ============================================================================

import {
  ImageMagick,
  MagickFormat,
  MagickGeometry,
} from "npm:@imagemagick/magick-wasm@0.0.31";

export interface ThumbnailResult {
  width: number;
  height: number;
  thumbnailBytes: Uint8Array;
}

const THUMBNAIL_MAX_WIDTH = 480;

export async function makeThumbnail(
  bytes: Uint8Array,
): Promise<ThumbnailResult> {
  let result: ThumbnailResult | null = null;

  await ImageMagick.read(bytes, (image) => {
    const width = image.width;
    const height = image.height;

    // Keep aspect ratio.
    if (width > THUMBNAIL_MAX_WIDTH) {
      const scaledHeight = Math.round(
        (height / width) * THUMBNAIL_MAX_WIDTH,
      );

      image.resize(
        new MagickGeometry(
          THUMBNAIL_MAX_WIDTH,
          scaledHeight,
        ),
      );
    }

    image.format = MagickFormat.Jpeg;
    image.quality = 80;

    image.write((thumbnailBytes) => {
      result = {
        width,
        height,
        thumbnailBytes: new Uint8Array(thumbnailBytes),
      };
    });
  });

  if (!result) {
    throw new Error("Failed to create image thumbnail");
  }

  return result;
}
