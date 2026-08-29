// ============================================================================
// import-zip — Stage 2 core: admin uploads a WhatsApp export ZIP, this
// function unzips it, parses the chat text (server/parser), filters to the
// reader's history window, deduplicates against already-imported messages
// by fingerprint, saves new messages (+ media reference rows),Ф advances the
// import watermark, and returns a full report. Every step is written to the
// `imports.log` column as it happens, so a failure partway through still
// leaves a readable trail instead of a stuck "processing" row.
//
// Stage 3 (media engine) added actual Storage upload + photo thumbnails,
// right after each matched media row is created — see MEDIA_ENGINE_NOTES
// below for exactly what is and isn't covered yet.
//
// AI processing remains a separate explicit admin action (`process-ai`) so a
// large import never blocks on a third-party model. Timeline source rows are
// synchronized by database triggers and generated chapter markers are rebuilt
// after each import.

// MEDIA_ENGINE_NOTES (Stage 3, honest scope):
//   - Photos (jpg/jpeg/png): uploaded to Storage AND a real thumbnail is
//     generated (imagescript, max 480px wide, jpeg) with true width/height.
//   - Photos in other formats (webp/heic/gif), video, audio, stickers:
//     uploaded to Storage as-is (status 'stored', mime_type, size_bytes
//     filled in), but WITHOUT a generated thumbnail/poster-frame — that
//     needs a real video/image decoder beyond what a pure-JS/WASM edge
//     function can do for arbitrary formats. thumbnail_path stays null;
//     the architecture (the column, the reader's "no thumbnail -> fall
//     back to a placeholder" contract) is in place for a later pass to
//     fill in without another schema change.
//   - `get-media-url` (new in this stage) is how the reader will actually
//     fetch a playable/viewable URL — buckets are private, so nothing here
//     is reachable without going through it.
//   - NOT independently run in this sandbox (no Deno here — see HANDOFF.md
//     §3): reviewed by hand, but run a real import against a test Supabase
//     project before relying on it (README → "Как проверить медиа-движок").
//
// Deploy: `supabase functions deploy import-zip`
// Invoke (from the authenticated admin session):
//   const form = new FormData();
//   form.append('file', zipFile);
//   form.append('reader_starts_at', isoDateString); // only needed on the very first import
//   const { data, error } = await supabase.functions.invoke('import-zip', { body: form });
// ============================================================================

// deno-lint-ignore-file no-explicit-any
declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): void };
// Supabase Edge Runtime global used to keep a worker alive after the HTTP
// response has already been sent, so long-running work (unzip + parse +
// hundreds of Storage uploads for a large export) is not bound by the
// platform's ~150s request wall-clock limit. See processImportInBackground().
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

import { corsHeaders } from '../_shared/cors.ts';
import { assertAdmin, serviceClient, HttpError } from '../_shared/db.ts';
import { readWhatsAppZip } from '../_shared/zip.ts';
import { parseAndFingerprint } from '../../../server/parser/index.ts';
import type { FingerprintedMessage, MediaKind } from '../../../server/parser/types.ts';
import { bucketForKind, buildStoragePath, buildThumbnailPath } from '../../../server/media/paths.ts';
import { guessMimeType, isDecodableImage } from '../../../server/media/mime.ts';
// NOTE: thumbnail.ts pulls in npm:@imagemagick/magick-wasm at module load.
// It is imported dynamically (see loadThumbnailer() below) instead of
// statically here, so that if the WASM module fails to initialize in the
// Edge Runtime, only thumbnail generation degrades — the whole function
// (including plain ZIP/message import with no photos) does not crash at
// boot with a 502 for every request.
type Thumbnailer = typeof import('../../../server/media/thumbnail.ts')['makeThumbnail'];
let thumbnailerPromise: Promise<Thumbnailer | null> | null = null;
function loadThumbnailer(): Promise<Thumbnailer | null> {
  if (!thumbnailerPromise) {
    thumbnailerPromise = import('../../../server/media/thumbnail.ts')
      .then((mod) => mod.makeThumbnail)
      .catch(() => null);
  }
  return thumbnailerPromise;
}

interface LogStep {
  step: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  at: string;
}

function logStep(step: string, status: LogStep['status'], message: string): LogStep {
  return { step, status, message, at: new Date().toISOString() };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Best-guess media kind when the export marks media as present but the
 *  file itself wasn't included ("image omitted") — no filename to classify. */
function kindFromOmitted(omittedKind: string | null): MediaKind {
  switch (omittedKind) {
    case 'image':
    case 'gif':
      return 'photo';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'sticker':
      return 'sticker';
    default:
      return 'document';
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function insertMessagesResilient(
  db: ReturnType<typeof serviceClient>,
  importId: string,
  batch: FingerprintedMessage[],
): Promise<{ inserted: { id: string; fingerprint: string }[]; errors: string[] }> {
  const rows = batch.map((m) => ({
    import_id: importId,
    fingerprint: m.fingerprint,
    sender_name: m.senderName,
    sent_at: m.sentAtIso,
    is_system_message: m.isSystemMessage,
    is_multiline: m.isMultiline,
    original_text: m.originalText,
    display_text: m.originalText, // Stage 4 (AI) overwrites this; safe fallback until then.
    has_media: m.hasMedia,
  }));

  const inserted: { id: string; fingerprint: string }[] = [];
  const errors: string[] = [];

  for (const chunk of chunkArray(rows, 200)) {
    const { data, error } = await db.from('messages').insert(chunk).select('id, fingerprint');
    if (!error && data) {
      inserted.push(...data);
      continue;
    }
    // A whole-chunk failure (e.g. one malformed row) must not drop the other
    // ~199 good ones in it — retry that chunk one row at a time so a single
    // bad record never sinks the rest of the import.
    for (const row of chunk) {
      const { data: single, error: singleError } = await db
        .from('messages')
        .insert(row)
        .select('id, fingerprint')
        .single();
      if (singleError || !single) {
        errors.push(`${row.fingerprint.slice(0, 10)}…: ${singleError?.message ?? 'unknown error'}`);
      } else {
        inserted.push(single);
      }
    }
  }

  return { inserted, errors };
}

/**
 * Does all the heavy lifting (unzip, parse, dedup, save, media upload,
 * thumbnails, watermark advance, chapter rebuild) for one import. Runs
 * inside EdgeRuntime.waitUntil() *after* the HTTP response has already
 * been sent back to the admin — so it is not bound by the platform's
 * request wall-clock limit (150s Free / up to 400s Pro), only by the
 * background-task limit, which is generous enough for large exports.
 * Every outcome (success, partial success, failure) is written to the
 * `imports` row; the admin UI polls that row instead of waiting on this
 * HTTP call to resolve.
 */
async function processImport(
  db: ReturnType<typeof serviceClient>,
  importId: string,
  file: File,
  bytes: Uint8Array,
  startDateRaw: FormDataEntryValue | null,
  log: LogStep[],
): Promise<void> {
  try {
    // Keep the raw archive so Stage 3 (media engine) or a future re-parse
    // doesn't require the admin to re-upload it.
    const originalPath = `imports/${importId}/${file.name}`;
    const { error: uploadError } = await db.storage
      .from('originals')
      .upload(originalPath, bytes, { contentType: 'application/zip', upsert: true });
    log.push(
      uploadError
        ? logStep('store-original', 'warning', `Не удалось сохранить копию архива: ${uploadError.message}`)
        : logStep('store-original', 'ok', `Архив сохранён в Storage: ${originalPath}.`),
    );

    const archive = readWhatsAppZip(bytes);
    log.push(logStep('unzip', 'ok', `Архив распакован, файл переписки: ${archive.chatFileName}.`));

    const { messages: allMessages, warnings, format } = await parseAndFingerprint(archive.chatText);
    if (format.format === 'unknown' || allMessages.length === 0) {
      throw new HttpError(400, 'Unsupported export format: не удалось распознать chat.txt как экспорт WhatsApp.');
    }
    log.push(
      logStep(
        'parse',
        warnings.length > 0 ? 'warning' : 'ok',
        `Распарсено ${allMessages.length} записей, предупреждений: ${warnings.length}.`,
      ),
    );

    // ---------------------- history_settings / start date ----------------------
    const { data: settings } = await db.from('history_settings').select('*').eq('id', true).maybeSingle();

    let readerStartsAt: string;
    if (!settings) {
      if (typeof startDateRaw !== 'string' || !startDateRaw) {
        throw new HttpError(
          400,
          'Это первый импорт истории — нужно передать дату начала (reader_starts_at), с которой начинается история.',
        );
      }
      const parsedStart = new Date(startDateRaw);
      if (Number.isNaN(parsedStart.getTime())) {
        throw new HttpError(400, `Некорректная дата начала истории: "${startDateRaw}".`);
      }
      readerStartsAt = parsedStart.toISOString();
      const { error: settingsInsertError } = await db
        .from('history_settings')
        .insert({ id: true, reader_starts_at: readerStartsAt });
      if (settingsInsertError) {
        throw new Error(`Не удалось сохранить дату начала истории: ${settingsInsertError.message}`);
      }
      log.push(logStep('history-settings', 'ok', `Дата начала истории установлена: ${readerStartsAt}.`));
    } else {
      readerStartsAt = settings.reader_starts_at;
    }

    // ---------------------- filter to the reader's history window ----------------------
    const startMs = new Date(readerStartsAt).getTime();
    const filtered = allMessages.filter((m) => new Date(m.sentAtIso).getTime() >= startMs);

    // ---------------------- dedup ----------------------
    const fingerprints = filtered.map((m) => m.fingerprint);
    const existing = new Set<string>();
    for (const chunk of chunkArray(fingerprints, 300)) {
      if (chunk.length === 0) continue;
      const { data, error } = await db.from('messages').select('fingerprint').in('fingerprint', chunk);
      if (error) throw new Error(`Не удалось проверить дубликаты: ${error.message}`);
      for (const row of data ?? []) existing.add(row.fingerprint);
    }
    const newMessages = filtered.filter((m) => !existing.has(m.fingerprint));
    log.push(
      logStep(
        'dedup',
        'ok',
        `Из ${filtered.length} сообщений в пределах истории: новых ${newMessages.length}, дублей ${
          filtered.length - newMessages.length
        }.`,
      ),
    );

    // ---------------------- media stats over the whole filtered window ----------------------
    const mediaFoundMsgs = filtered.filter((m) => m.hasMedia);
    const mediaMatchedMsgs = mediaFoundMsgs.filter(
      (m) => m.mediaFilename && archive.mediaFileNames.has(m.mediaFilename),
    );
    const mediaMissingCount = mediaFoundMsgs.length - mediaMatchedMsgs.length;
    const photosCount = filtered.filter((m) => m.mediaKind === 'photo').length;
    const videosCount = filtered.filter((m) => m.mediaKind === 'video').length;
    const audioCount = filtered.filter((m) => m.mediaKind === 'audio').length;
    const stickersCount = filtered.filter((m) => m.mediaKind === 'sticker').length;

    let insertErrors: string[] = [];
    let mediaUploadFailedTotal = 0;

    // If an earlier export contained the message but not its media, a later
    // export may contain the real file. Repair those rows without creating a
    // duplicate message.
    let repairedMedia = 0;
    for (const duplicate of filtered) {
      if (!duplicate.hasMedia || !duplicate.mediaFilename || !archive.mediaFileNames.has(duplicate.mediaFilename)) continue;
      if (!existing.has(duplicate.fingerprint)) continue;
      const { data: existingMessage } = await db.from('messages').select('id,media_id').eq('fingerprint', duplicate.fingerprint).maybeSingle();
      if (!existingMessage) continue;
      const { data: missingMedia } = await db.from('media').select('id,kind,status').eq('message_id', existingMessage.id).eq('status', 'missing').maybeSingle();
      if (!missingMedia) continue;
      const bytes = archive.getMediaBytes(duplicate.mediaFilename);
      if (!bytes) continue;
      try {
        const kind = duplicate.mediaKind as MediaKind;
        const bucket = bucketForKind(kind);
        const storagePath = buildStoragePath(importId, missingMedia.id, duplicate.mediaFilename);
        const mimeType = guessMimeType(duplicate.mediaFilename);
        const { error: uploadError } = await db.storage.from(bucket).upload(storagePath, bytes, { contentType: mimeType, upsert: true });
        if (uploadError) continue;
        const update: Record<string, unknown> = { status: 'stored', storage_path: storagePath, mime_type: mimeType, size_bytes: bytes.byteLength };
        if (kind === 'photo' && isDecodableImage(duplicate.mediaFilename)) {
          try {
            const makeThumbnail = await loadThumbnailer();
            if (makeThumbnail) {
              const { width, height, thumbnailBytes } = await makeThumbnail(bytes);
              const thumbPath = buildThumbnailPath(missingMedia.id);
              const { error: thumbError } = await db.storage.from('thumbnails').upload(thumbPath, thumbnailBytes, { contentType: 'image/jpeg', upsert: true });
              if (!thumbError) { update.thumbnail_path = thumbPath; update.width = width; update.height = height; }
            }
          } catch { /* original upload is still useful */ }
        }
        await db.from('media').update(update).eq('id', missingMedia.id);
        repairedMedia++;
      } catch { /* one repair must never abort the whole import */ }
    }
    if (repairedMedia > 0) log.push(logStep('media-repair', 'ok', `Восстановлено ранее отсутствовавших медиафайлов: ${repairedMedia}.`));

    if (newMessages.length > 0) {
      const { inserted, errors } = await insertMessagesResilient(db, importId, newMessages);
      insertErrors = errors;
      log.push(
        logStep(
          'save',
          errors.length > 0 ? 'warning' : 'ok',
          `Сохранено ${inserted.length} из ${newMessages.length} новых сообщений${
            errors.length > 0 ? `, ошибок: ${errors.length}` : ''
          }.`,
        ),
      );

      const byFingerprint = new Map(inserted.map((r) => [r.fingerprint, r.id]));
      const mediaToCreate: { messageId: string; row: Record<string, unknown> }[] = [];

      for (const m of newMessages) {
        if (!m.hasMedia) continue;
        const messageId = byFingerprint.get(m.fingerprint);
        if (!messageId) continue; // this message failed to insert; already logged above
        const kind = m.mediaFilename ? (m.mediaKind as MediaKind) : kindFromOmitted(m.mediaOmittedKind);
        const filename = m.mediaFilename ?? `(не экспортирован: ${m.mediaOmittedKind ?? 'файл'})`;
        const status = m.mediaFilename && archive.mediaFileNames.has(m.mediaFilename) ? 'pending' : 'missing';
        mediaToCreate.push({
          messageId,
          row: { import_id: importId, message_id: messageId, kind, original_filename: filename, status },
        });
      }

      let mediaSaveErrors = 0;
      let mediaStored = 0;
      let mediaUploadFailed = 0;
      for (const { messageId, row } of mediaToCreate) {
        const { data: mediaInserted, error: mediaError } = await db.from('media').insert(row).select('id').single();
        if (mediaError || !mediaInserted) {
          mediaSaveErrors++;
          continue;
        }
        await db.from('messages').update({ media_id: mediaInserted.id }).eq('id', messageId);

        // Only 'pending' rows (matched to a real file in the archive) have
        // bytes to upload — 'missing' rows stay exactly as inserted above.
        if (row.status !== 'pending') continue;

        const filename = row.original_filename as string;
        const bytes = archive.getMediaBytes(filename);
        if (!bytes) {
          // Should not happen (status was set from the same matched-set
          // check above), but never trust that invariant blindly mid-loop.
          mediaUploadFailed++;
          await db.from('media').update({ status: 'failed' }).eq('id', mediaInserted.id);
          continue;
        }

        try {
          const kind = row.kind as MediaKind;
          const bucket = bucketForKind(kind);
          const storagePath = buildStoragePath(importId, mediaInserted.id, filename);
          const mimeType = guessMimeType(filename);

          const { error: fileUploadError } = await db.storage
            .from(bucket)
            .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
          if (fileUploadError) throw new Error(fileUploadError.message);

          const update: Record<string, unknown> = {
            status: 'stored',
            storage_path: storagePath,
            mime_type: mimeType,
            size_bytes: bytes.byteLength,
          };

          if (kind === 'photo' && isDecodableImage(filename)) {
            try {
              const makeThumbnail = await loadThumbnailer();
              if (!makeThumbnail) throw new Error('thumbnailer unavailable');
              const { width, height, thumbnailBytes } = await makeThumbnail(bytes);
              const thumbPath = buildThumbnailPath(mediaInserted.id);
              const { error: thumbUploadError } = await db.storage
                .from('thumbnails')
                .upload(thumbPath, thumbnailBytes, { contentType: 'image/jpeg', upsert: true });
              if (!thumbUploadError) {
                update.thumbnail_path = thumbPath;
                update.width = width;
                update.height = height;
              }
              // A thumbnail failure never blocks storing the original photo
              // itself — the reader can always fall back to the full image.
            } catch {
              // Decode failure (corrupt/unsupported despite the extension)
              // — original is already stored above, just skip the thumbnail.
            }
          }

          await db.from('media').update(update).eq('id', mediaInserted.id);
          mediaStored++;
        } catch {
          mediaUploadFailed++;
          await db.from('media').update({ status: 'failed' }).eq('id', mediaInserted.id);
        }
      }
      if (mediaToCreate.length > 0) {
        mediaUploadFailedTotal = mediaUploadFailed;
        log.push(
          logStep(
            'media',
            mediaSaveErrors > 0 ? 'warning' : 'ok',
            `Создано записей медиа: ${mediaToCreate.length - mediaSaveErrors} из ${mediaToCreate.length}.`,
          ),
        );
        log.push(
          logStep(
            'media-upload',
            mediaUploadFailed > 0 ? 'warning' : 'ok',
            `Загружено в Storage: ${mediaStored}, ошибок загрузки: ${mediaUploadFailed}.`,
          ),
        );
      }
    } else {
      log.push(logStep('save', 'ok', 'Новых сообщений не найдено.'));
    }

    // ---------------------- advance watermark (never backwards) ----------------------
    if (filtered.length > 0) {
      const maxSentAt = filtered.reduce((max, m) => (m.sentAtIso > max ? m.sentAtIso : max), filtered[0].sentAtIso);
      const currentWatermark = settings?.last_imported_at ?? null;
      if (!currentWatermark || maxSentAt > currentWatermark) {
        await db
          .from('history_settings')
          .update({ last_imported_at: maxSentAt, updated_at: new Date().toISOString() })
          .eq('id', true);
      }
    }

    // Rebuild visual chapter markers after every successful import. The function is
    // idempotent and only touches generated year/anniversary elements.
    const { error: specialError } = await db.rpc('rebuild_special_timeline_internal');
    if (specialError) {
      log.push(logStep('timeline-specials', 'warning', `Не удалось обновить специальные элементы: ${specialError.message}`));
    } else {
      log.push(logStep('timeline-specials', 'ok', 'Обновлены переходы между годами и элементы «в этот день».'));
    }

    // ---------------------- finalize ----------------------
    const finalStatus: string =
      insertErrors.length > 0 || mediaMissingCount > 0 || mediaUploadFailedTotal > 0 || warnings.length > 0
        ? 'completed_with_warnings'
        : 'completed';

    await db
      .from('imports')
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        messages_found: filtered.length,
        messages_new: newMessages.length,
        messages_duplicate: filtered.length - newMessages.length,
        media_found: mediaFoundMsgs.length,
        media_matched: mediaMatchedMsgs.length,
        media_missing: mediaMissingCount,
        photos_count: photosCount,
        videos_count: videosCount,
        audio_count: audioCount,
        stickers_count: stickersCount,
        error_message: insertErrors.length > 0 ? insertErrors.slice(0, 20).join('; ') : null,
        log,
      })
      .eq('id', importId);
  } catch (err) {
    // A failure anywhere in background processing must still leave the
    // `imports` row in a terminal, readable state — never stuck on
    // "processing" forever with no explanation.
    const message = err instanceof Error ? err.message : String(err);
    log.push(logStep('error', 'error', message));
    await db
      .from('imports')
      .update({ status: 'failed', finished_at: new Date().toISOString(), error_message: message, log })
      .eq('id', importId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const db = serviceClient();

  try {
    await assertAdmin(req);

    const form = await req.formData();
    const file = form.get('file');
    const startDateRaw = form.get('reader_starts_at');

    if (!(file instanceof File)) {
      throw new HttpError(400, 'Не передан файл архива (поле "file").');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const log: LogStep[] = [logStep('received', 'ok', `Получен файл ${file.name} (${bytes.byteLength} байт).`)];

    const { data: importRow, error: importInsertError } = await db
      .from('imports')
      .insert({ file_name: file.name, file_size_bytes: bytes.byteLength, status: 'processing', log })
      .select('id')
      .single();
    if (importInsertError || !importRow) {
      throw new Error(`Не удалось создать запись импорта: ${importInsertError?.message}`);
    }
    const importId: string = importRow.id;

    // Respond immediately — the admin UI polls the `imports` row for
    // progress/completion instead of waiting on this HTTP call, which
    // would otherwise be killed by the platform's request wall-clock
    // limit on any sufficiently large export (many photos/videos).
    EdgeRuntime.waitUntil(processImport(db, importId, file, bytes, startDateRaw, log));

    return json({ importId, status: 'processing', async: true, log });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof HttpError ? err.status : 500;
    return json({ error: message }, status);
  }
});
