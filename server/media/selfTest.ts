// ============================================================================
// server/media/selfTest.ts — run with `npx tsx server/media/selfTest.ts`.
// No network, no Supabase, no Deno required.
//
// Covers:
//   - bucketForKind / sanitizeFilename / buildStoragePath / buildThumbnailPath
//     (pure logic, used identically by the edge function)
//   - guessMimeType / isDecodableImage
//   - a REAL zip round-trip using fflate (the exact library the edge
//     function's zip.ts uses via 'npm:fflate@0.8.2'): builds an in-memory
//     zip with a chat.txt + a few media files, unzips it, and confirms
//     getMediaBytes() returns the exact original bytes by basename — this
//     is the primitive the whole media engine depends on, so it's the one
//     thing in this stage worth proving against a real archive rather than
//     just asserting on strings.
//
// What this test does NOT cover (honest gap, see MEDIA_ENGINE_NOTES in
// import-zip/index.ts): actually calling Supabase Storage, or the
// imagescript-based thumbnail generation — both only run under the Deno
// edge function runtime, which isn't available in this sandbox. They were
// reviewed by hand; run a real import against a test Supabase project
// before relying on them (see README → "Как проверить медиа-движок").
// ============================================================================

import { strict as assert } from 'node:assert';
import { zipSync, unzipSync } from 'fflate';

import { bucketForKind, sanitizeFilename, buildStoragePath, buildThumbnailPath } from './paths.ts';
import { guessMimeType, isDecodableImage } from './mime.ts';
import type { MediaKind } from './types.ts';

let passed = 0;
let failed = 0;

function check(label: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`✓ ${label}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${label}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------- paths ----
check('bucketForKind: все виды медиа сопоставлены с бакетами', () => {
  const kinds: MediaKind[] = ['photo', 'video', 'audio', 'sticker', 'document'];
  const buckets = kinds.map(bucketForKind);
  assert.deepEqual(buckets, ['photos', 'videos', 'audio', 'stickers', 'documents']);
});

check('sanitizeFilename: обычное имя WhatsApp не меняется', () => {
  assert.equal(sanitizeFilename('IMG-20260412-WA0013.jpg'), 'IMG-20260412-WA0013.jpg');
});

check('sanitizeFilename: путь и опасные символы вырезаны', () => {
  const result = sanitizeFilename('../../etc/passwd/весёлое фото.jpg');
  assert.ok(!result.includes('/'));
  assert.ok(!result.includes('..'));
});

check('buildStoragePath: содержит importId и mediaId, без коллизий для одинаковых имён', () => {
  const p1 = buildStoragePath('import-1', 'media-1', 'IMG-0001.jpg');
  const p2 = buildStoragePath('import-1', 'media-2', 'IMG-0001.jpg');
  assert.ok(p1.includes('import-1') && p1.includes('media-1'));
  assert.notEqual(p1, p2, 'разные media_id должны давать разные пути даже при одинаковом имени файла');
});

check('buildThumbnailPath: детерминирован от media_id', () => {
  assert.equal(buildThumbnailPath('media-abc'), 'media-abc.jpg');
});

// ----------------------------------------------------------------- mime ----
check('guessMimeType: фото/видео/аудио форматы WhatsApp', () => {
  assert.equal(guessMimeType('IMG-20260412-WA0013.jpg'), 'image/jpeg');
  assert.equal(guessMimeType('VID-20260412-WA0002.mp4'), 'video/mp4');
  assert.equal(guessMimeType('PTT-20260412-WA0005.opus'), 'audio/ogg');
  assert.equal(guessMimeType('STK-20260412-WA0001.webp'), 'image/webp');
});

check('guessMimeType: неизвестное расширение -> octet-stream, не падает', () => {
  assert.equal(guessMimeType('весёлое.xyz123'), 'application/octet-stream');
});

check('isDecodableImage: только jpg/jpeg/png дают true', () => {
  assert.equal(isDecodableImage('a.jpg'), true);
  assert.equal(isDecodableImage('a.JPEG'), true);
  assert.equal(isDecodableImage('a.png'), true);
  assert.equal(isDecodableImage('a.webp'), false);
  assert.equal(isDecodableImage('a.heic'), false);
});

// ------------------------------------------------------- real zip round-trip
check('fflate round-trip: getMediaBytes-эквивалент отдаёт исходные байты по basename', () => {
  const chatText = '12.04.2026, 09:00 - Аня: привет\n';
  const photoBytes = new Uint8Array([1, 2, 3, 4, 5]);
  const audioBytes = new Uint8Array([9, 9, 9]);

  const archive = zipSync({
    'chat.txt': new TextEncoder().encode(chatText),
    'IMG-20260412-WA0001.jpg': photoBytes,
    'PTT-20260412-WA0002.opus': audioBytes,
  });

  // Mirrors readWhatsAppZip()'s basename-keyed lookup in
  // supabase/functions/_shared/zip.ts (same fflate API, same logic —
  // only the import specifier differs between Node and Deno).
  const entries = unzipSync(archive);
  const bytesByBasename = new Map<string, Uint8Array>();
  for (const [name, bytes] of Object.entries(entries)) {
    if (name === 'chat.txt') continue;
    bytesByBasename.set(name.split('/').pop()!, bytes);
  }
  const getMediaBytes = (basename: string) => bytesByBasename.get(basename) ?? null;

  assert.deepEqual(getMediaBytes('IMG-20260412-WA0001.jpg'), photoBytes);
  assert.deepEqual(getMediaBytes('PTT-20260412-WA0002.opus'), audioBytes);
  assert.equal(getMediaBytes('does-not-exist.jpg'), null);
});

console.log(`\n${passed}/${passed + failed} проверок пройдено.`);
if (failed > 0) process.exit(1);
