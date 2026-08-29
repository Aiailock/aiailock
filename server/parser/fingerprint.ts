// ============================================================================
// fingerprint — the dedup key decided in Stage 1 (see HANDOFF.md §2):
//   sha256(sender + '|' + iso_timestamp + '|' + original_text + '|' + media_filename)
// NOT a sequence number, so re-importing an overlapping export (or the exact
// same file twice) never creates duplicate rows — the same logical message
// always hashes to the same value.
//
// Uses the standard Web Crypto API (`crypto.subtle`), which is available
// natively in both the Deno edge function runtime and modern Node.js — no
// external dependency, and it's the same code path exercised by
// selfTest.ts, so this file is genuinely tested, not just written.
// ============================================================================

import type { RawParsedMessage } from './types.ts';

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeFingerprint(msg: RawParsedMessage): Promise<string> {
  const raw = [
    msg.senderName,
    msg.sentAtIso,
    msg.originalText ?? '',
    msg.mediaFilename ?? '',
  ].join('|');

  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}
