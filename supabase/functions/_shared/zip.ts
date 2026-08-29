// ============================================================================
// zip — unzips a WhatsApp chat export archive using fflate (pure JS, no
// native deps, works identically in Deno and browsers). Only reads what's
// needed for parsing: the chat .txt contents and the set of media filenames
// actually present in the archive (used to tell "matched" from "missing").
//
// Stage 3 adds `getMediaBytes()` so the media engine can pull the actual file
// bytes for a matched filename straight out of the already-decompressed
// in-memory archive, without re-fetching or re-unzipping anything.
// ============================================================================

import { unzipSync } from 'npm:fflate@0.8.2';

export interface UnzippedArchive {
  chatText: string;
  chatFileName: string;
  /** Basenames (no path) of every non-txt file in the archive. */
  mediaFileNames: Set<string>;
  /** Raw bytes for a given basename, or null if it isn't in the archive. */
  getMediaBytes(basename: string): Uint8Array | null;
}

/**
 * Wraps a plain .txt chat export (no media, no ZIP) in the same
 * UnzippedArchive shape as readWhatsAppZip(), so the rest of the import
 * pipeline (parser, dedup, save, "missing media" placeholders) doesn't need
 * to know or care which input format was used. Every media reference the
 * parser finds in the text will simply have no matching filename in
 * `mediaFileNames`, which the existing pipeline already turns into a
 * `status: 'missing'` media row (a placeholder the admin can fill in later
 * from Media manager / Screenshots / Memories — see README §5).
 */
export function readWhatsAppTxt(bytes: Uint8Array, fileName: string): UnzippedArchive {
  const chatText = new TextDecoder('utf-8').decode(bytes);
  return {
    chatText,
    chatFileName: fileName,
    mediaFileNames: new Set<string>(),
    getMediaBytes: () => null,
  };
}

/**
 * Accepts either a ZIP export (with media) or a plain .txt export (text
 * only — every media reference becomes a "missing" placeholder to fill in
 * manually later). Detected by file extension first, falling back to the
 * ZIP magic number so a mislabeled/renamed file still works.
 */
export function readWhatsAppExport(bytes: Uint8Array, fileName: string): UnzippedArchive {
  const lower = fileName.toLowerCase();
  const looksLikeZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  if (lower.endsWith('.txt') && !looksLikeZip) {
    return readWhatsAppTxt(bytes, fileName);
  }
  return readWhatsAppZip(bytes);
}

export function readWhatsAppZip(bytes: Uint8Array): UnzippedArchive {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (err) {
    throw new Error(`Не удалось распаковать архив — файл повреждён или не является ZIP, и не .txt переписки (${String(err)}).`);
  }

  const names = Object.keys(entries).filter(
    (n) => !n.endsWith('/') && !n.startsWith('__MACOSX/') && !n.includes('/__MACOSX/'),
  );

  const txtNames = names.filter((n) => n.toLowerCase().endsWith('.txt'));
  if (txtNames.length === 0) {
    throw new Error('В архиве не найден текстовый файл переписки (.txt).');
  }

  // The chat log is virtually always far larger than any stray notes/readme
  // file that might be bundled alongside it.
  const chatFileName = txtNames.reduce((best, n) =>
    entries[n].byteLength > entries[best].byteLength ? n : best, txtNames[0]);

  const chatText = new TextDecoder('utf-8').decode(entries[chatFileName]);

  const mediaFileNames = new Set<string>();
  // Basename -> full path within the zip. WhatsApp exports are flat (no
  // subfolders) in practice, but this stays correct even if a specific
  // export tool nests media in a folder, since matching against the parser
  // is always by basename (that's all the chat .txt ever references).
  const bytesByBasename = new Map<string, Uint8Array>();
  for (const n of names) {
    if (n === chatFileName) continue;
    const base = n.split('/').pop();
    if (!base) continue;
    mediaFileNames.add(base);
    bytesByBasename.set(base, entries[n]);
  }

  return {
    chatText,
    chatFileName,
    mediaFileNames,
    getMediaBytes: (basename: string) => bytesByBasename.get(basename) ?? null,
  };
}
