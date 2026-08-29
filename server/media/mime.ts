// ============================================================================
// server/media/mime.ts — best-effort MIME type from a filename extension.
// WhatsApp exports never include real Content-Type metadata (it's a ZIP of
// plain files), so this is the only signal we have. Pure function, no deps.
// ============================================================================

const EXTENSION_MAP: Record<string, string> = {
  // photos
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  // video
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  '3gp': 'video/3gpp',
  mkv: 'video/x-matroska',
  // audio (WhatsApp voice notes are usually .opus inside an .ogg container)
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  // stickers
  webp_sticker: 'image/webp', // not a real extension; kept for clarity, unused
  // documents (fallback bucket for anything else WhatsApp might export)
  pdf: 'application/pdf',
};

export function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MAP[ext] ?? 'application/octet-stream';
}

/** True for extensions we can decode with imagescript (see thumbnail.ts). */
export function isDecodableImage(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'jpg' || ext === 'jpeg' || ext === 'png';
  // Deliberately excludes webp/gif/heic: imagescript's decoder covers
  // jpeg/png reliably; webp stickers and heic photos are still stored and
  // served fine, they just don't get a generated thumbnail in this stage
  // (see MEDIA_ENGINE_NOTES in import-zip/index.ts).
}
