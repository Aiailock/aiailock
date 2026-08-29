export type MediaKind = 'photo' | 'video' | 'audio' | 'sticker' | 'document';

/** One parsed chat entry, before it's checked against the DB for duplicates. */
export interface RawParsedMessage {
  senderName: string; // '' for global system notices with no sender
  sentAtIso: string;
  isSystemMessage: boolean;
  isMultiline: boolean;
  originalText: string | null; // null for pure-media messages with no caption
  hasMedia: boolean;
  mediaFilename: string | null; // filename referenced in the export, if any
  mediaOmittedKind: string | null; // e.g. "image" when the file itself wasn't exported
  mediaKind: MediaKind | null;
}

/** A RawParsedMessage plus its computed dedup fingerprint. */
export interface FingerprintedMessage extends RawParsedMessage {
  fingerprint: string;
}

export interface ParseWarning {
  line: number; // 1-based line number in the normalized text
  message: string;
}

export interface ParseResult {
  messages: RawParsedMessage[];
  warnings: ParseWarning[];
}
