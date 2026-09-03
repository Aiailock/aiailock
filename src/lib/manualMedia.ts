import { supabase } from './supabaseClient';

export const MAX_MANUAL_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_MANUAL_AUDIO_BYTES = 60 * 1024 * 1024;
export const MAX_AUDIO_COVER_BYTES = 5 * 1024 * 1024;

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|flac|webm)$/i.test(file.name);
}

interface ManualVideoInput {
  file: File;
  title?: string;
  caption?: string;
  occurredAt: string;
  style?: Record<string, unknown>;
  published?: boolean;
  visibleFrom?: string | null;
}

interface ManualAudioInput {
  file: File;
  coverFile?: File | null;
  coverUrl?: string | null;
  sourceUrl?: string | null;
  title?: string;
  artist?: string;
  album?: string;
  caption?: string;
  occurredAt: string;
  style?: Record<string, unknown>;
  published?: boolean;
  visibleFrom?: string | null;
  audioPurpose?: 'music' | 'voice';
}

/**
 * Creates a manually uploaded video using the same message/media model as a
 * WhatsApp import. That keeps private Storage signing, deletion and the reader
 * video player working without introducing a second media pipeline.
 */
export async function createManualVideo(input: ManualVideoInput): Promise<string> {
  if (!input.file.type.startsWith('video/')) throw new Error('Выбери видеофайл.');
  if (input.file.size > MAX_MANUAL_VIDEO_BYTES) throw new Error('Видео должно быть не больше 200 МБ.');

  const messageId = crypto.randomUUID();
  const mediaId = crypto.randomUUID();
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'video.mp4';
  const storagePath = `manual/videos/${messageId}/${mediaId}-${safeName}`;
  let uploaded = false;
  let messageCreated = false;
  let mediaCreated = false;

  try {
    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(storagePath, input.file, {
        contentType: input.file.type || 'video/mp4',
        cacheControl: '3600',
      });
    if (uploadError) throw uploadError;
    uploaded = true;

    const caption = input.caption?.trim() || null;
    const { error: messageError } = await supabase.from('messages').insert({
      id: messageId,
      fingerprint: `manual-video-${messageId}`,
      sender_name: input.title?.trim() || 'Видео',
      sent_at: input.occurredAt,
      is_system_message: false,
      is_multiline: Boolean(caption?.includes('\n')),
      original_text: caption,
      display_text: caption,
      has_media: false,
    });
    if (messageError) throw messageError;
    messageCreated = true;

    const { error: mediaError } = await supabase.from('media').insert({
      id: mediaId,
      message_id: messageId,
      kind: 'video',
      original_filename: input.file.name || safeName,
      storage_path: storagePath,
      mime_type: input.file.type || 'video/mp4',
      size_bytes: input.file.size,
      status: 'stored',
    });
    if (mediaError) throw mediaError;
    mediaCreated = true;

    const { error: attachError } = await supabase
      .from('messages')
      .update({ has_media: true, media_id: mediaId })
      .eq('id', messageId);
    if (attachError) throw attachError;

    const { data: timeline, error: timelineError } = await supabase
      .from('timeline_elements')
      .select('id')
      .eq('message_id', messageId)
      .single();
    if (timelineError || !timeline?.id) throw timelineError ?? new Error('Видео не появилось в истории.');

    const visibleFrom = input.visibleFrom || null;
    const { error: styleError } = await supabase
      .from('timeline_elements')
      .update({
        style: input.style ?? {},
        is_published: visibleFrom ? true : input.published ?? true,
        visible_from: visibleFrom,
        metadata: { title: input.title?.trim() || null },
      })
      .eq('id', timeline.id);
    if (styleError) throw styleError;

    return String(timeline.id);
  } catch (error) {
    if (messageCreated) await supabase.from('messages').delete().eq('id', messageId);
    if (mediaCreated) await supabase.from('media').delete().eq('id', mediaId);
    if (uploaded) await supabase.storage.from('videos').remove([storagePath]);
    throw error;
  }
}

/** Uploads an owner-provided track and optional square cover privately. */
export async function createManualAudio(input: ManualAudioInput): Promise<string> {
  if (!isAudioFile(input.file)) throw new Error('Выбери аудиофайл.');
  if (input.file.size > MAX_MANUAL_AUDIO_BYTES) throw new Error('Аудиофайл должен быть не больше 60 МБ.');
  if (input.coverFile && (!input.coverFile.type.startsWith('image/') || input.coverFile.size > MAX_AUDIO_COVER_BYTES)) {
    throw new Error('Обложка должна быть изображением не больше 5 МБ.');
  }

  const messageId = crypto.randomUUID();
  const mediaId = crypto.randomUUID();
  const safeAudioName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'audio.mp3';
  const audioPath = `manual/audio/${messageId}/${mediaId}-${safeAudioName}`;
  const safeCoverName = input.coverFile?.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'cover.jpg';
  const coverPath = input.coverFile ? `manual/audio-covers/${messageId}/${mediaId}-${safeCoverName}` : null;
  let audioUploaded = false;
  let coverUploaded = false;
  let messageCreated = false;
  let mediaCreated = false;

  try {
    const { error: audioError } = await supabase.storage.from('audio').upload(audioPath, input.file, {
      contentType: input.file.type || 'audio/mpeg',
      cacheControl: '3600',
    });
    if (audioError) throw audioError;
    audioUploaded = true;

    if (input.coverFile && coverPath) {
      const { error: coverError } = await supabase.storage.from('thumbnails').upload(coverPath, input.coverFile, {
        contentType: input.coverFile.type || 'image/jpeg',
        cacheControl: '3600',
      });
      if (coverError) throw coverError;
      coverUploaded = true;
    }

    const title = input.title?.trim() || input.file.name.replace(/\.[^.]+$/, '') || 'Аудиозапись';
    const caption = input.caption?.trim() || null;
    const { error: messageError } = await supabase.from('messages').insert({
      id: messageId,
      fingerprint: `manual-audio-${messageId}`,
      sender_name: title,
      sent_at: input.occurredAt,
      is_system_message: false,
      is_multiline: Boolean(caption?.includes('\n')),
      original_text: caption,
      display_text: caption,
      has_media: false,
    });
    if (messageError) throw messageError;
    messageCreated = true;

    const { error: mediaError } = await supabase.from('media').insert({
      id: mediaId,
      message_id: messageId,
      kind: 'audio',
      original_filename: input.file.name || safeAudioName,
      storage_path: audioPath,
      thumbnail_path: coverPath,
      mime_type: input.file.type || 'audio/mpeg',
      size_bytes: input.file.size,
      status: 'stored',
    });
    if (mediaError) throw mediaError;
    mediaCreated = true;

    const { error: attachError } = await supabase.from('messages').update({ has_media: true, media_id: mediaId }).eq('id', messageId);
    if (attachError) throw attachError;

    const { data: timeline, error: timelineError } = await supabase.from('timeline_elements').select('id').eq('message_id', messageId).single();
    if (timelineError || !timeline?.id) throw timelineError ?? new Error('Аудио не появилось в истории.');

    const visibleFrom = input.visibleFrom || null;
    const { error: styleError } = await supabase.from('timeline_elements').update({
      style: input.style ?? {},
      is_published: visibleFrom ? true : input.published ?? true,
      visible_from: visibleFrom,
      metadata: {
        title,
        artist: input.artist?.trim() || null,
        album: input.album?.trim() || null,
        coverUrl: input.coverUrl || null,
        sourceUrl: input.sourceUrl || null,
        musicSource: 'upload',
        audioPurpose: input.audioPurpose ?? 'music',
      },
    }).eq('id', timeline.id);
    if (styleError) throw styleError;

    return String(timeline.id);
  } catch (error) {
    if (messageCreated) await supabase.from('messages').delete().eq('id', messageId);
    if (mediaCreated) await supabase.from('media').delete().eq('id', mediaId);
    if (audioUploaded) await supabase.storage.from('audio').remove([audioPath]);
    if (coverUploaded && coverPath) await supabase.storage.from('thumbnails').remove([coverPath]);
    throw error;
  }
}
