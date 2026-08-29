// ============================================================================
// systemPatterns — explicit signals for lines that ARE "Sender: text" shaped
// but whose text is a client-generated notice, not something the person
// actually typed. Must never be shown to the reader as a real message.
//
// This is a secondary signal. The PRIMARY signal (used in lineParser.ts) is
// structural: real chat lines from group/global notices (encryption banner,
// group-created/added/left/subject-changed, etc.) almost never carry a
// "Name: " prefix at all, so they're already caught before reaching here.
// This file only covers the case where a notice DOES look like "Name: ...",
// most commonly "message deleted", which is per-sender.
// ============================================================================

const DELETED_MESSAGE_PATTERNS: RegExp[] = [
  /^you deleted this message\.?$/i,
  /^this message was deleted\.?$/i,
  /^это сообщение (?:было )?удалено\.?$/i,
];

export function isDeletedMessageText(text: string): boolean {
  const trimmed = text.trim();
  return DELETED_MESSAGE_PATTERNS.some((re) => re.test(trimmed));
}

// Lines with no "Name: " prefix at all are already treated as system
// messages structurally (see lineParser.ts). These patterns exist only to
// give the import log a friendlier, more specific message than "no sender
// found" for the two or three notice types every export contains.
const GLOBAL_NOTICE_PATTERNS: RegExp[] = [
  /messages and calls are end-to-end encrypted/i,
  /сообщения и звонки защищены сквозным шифрованием/i,
  /created group/i,
  /создал(?:а)? группу/i,
  /changed the subject/i,
  /изменил(?:а)? название группы/i,
  /changed this group'?s icon/i,
  /changed the group description/i,
  /added you/i,
  /добавил(?:а)? вас/i,
  /left$/i,
  /вышел из группы|вышла из группы/i,
  /removed .+$/i,
  /security code (?:with .* )?changed/i,
  /changed their phone number/i,
];

export function matchesGlobalNoticePattern(text: string): boolean {
  const trimmed = text.trim();
  return GLOBAL_NOTICE_PATTERNS.some((re) => re.test(trimmed));
}
