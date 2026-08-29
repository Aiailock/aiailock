// ============================================================================
// selfTest — a runnable (not just theoretical) proof that the parser works,
// covering every format variation the product spec calls out. This is not a
// test framework, just plain assertions with clear output, so it can run
// with zero dependencies via `npx tsx server/parser/selfTest.ts`.
// ============================================================================

import { parseAndFingerprint } from './index.ts';

let failures = 0;
let checks = 0;

function assert(condition: boolean, description: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`✗ FAIL: ${description}`);
  } else {
    console.log(`✓ ${description}`);
  }
}

async function run() {
  // --------------------------------------------------------------------
  // 1. Android, Russian locale, dot dates, old-style media line, multiline
  //    message, encryption banner, deleted message.
  // --------------------------------------------------------------------
  const androidRu = [
    '12.04.2026, 09:00 - Сообщения и звонки защищены сквозным шифрованием. Никто posторонний, даже WhatsApp, не может их прочитать или прослушать.',
    '12.04.2026, 14:23 - Аня: Привет!',
    'Как ты?',
    'Соскучилась',
    '12.04.2026, 14:25 - Я: IMG-20260412-WA0013.jpg (файл добавлен)',
    '12.04.2026, 14:26 - Аня: Это сообщение удалено.',
    '12.04.2026, 20:10 - Я: PTT-20260412-WA0007.opus (файл добавлен)',
  ].join('\n');

  const { messages: r1, warnings: w1 } = await parseAndFingerprint(androidRu);

  assert(r1.length === 5, `Android/RU: разобрано 5 записей (получено ${r1.length})`);
  assert(r1[0].isSystemMessage === true && r1[0].senderName === '', 'Android/RU: баннер шифрования распознан как системное сообщение');
  assert(
    r1[1].senderName === 'Аня' && r1[1].originalText === 'Привет!\nКак ты?\nСоскучилась',
    'Android/RU: многострочное сообщение склеено в одно',
  );
  assert(r1[1].isMultiline === true, 'Android/RU: multiline-флаг выставлен');
  assert(
    r1[2].hasMedia === true && r1[2].mediaFilename === 'IMG-20260412-WA0013.jpg' && r1[2].mediaKind === 'photo',
    'Android/RU: фото распознано (старый формат "файл добавлен")',
  );
  assert(r1[3].isSystemMessage === true, 'Android/RU: "Это сообщение удалено" помечено системным');
  assert(r1[4].mediaKind === 'audio', 'Android/RU: голосовое (PTT-) распознано как audio');
  assert(w1.length === 0, `Android/RU: нет предупреждений парсинга (получено ${w1.length})`);

  // --------------------------------------------------------------------
  // 2. iOS, English locale, bracket headers, 12-hour AM/PM, seconds,
  //    new-style <attached: ...> media, "omitted" placeholder.
  // --------------------------------------------------------------------
  const iosEn = [
    '[4/12/26, 2:23:07 PM] Anya: Hey!',
    '[4/12/26, 2:23:45 PM] Me: <attached: IMG-0099.jpg>',
    '[4/12/26, 11:58:00 PM] Anya: image omitted',
    '[4/13/26, 9:05:00 AM] Anya: Good morning',
  ].join('\n');

  const { messages: r2 } = await parseAndFingerprint(iosEn);

  assert(r2.length === 4, `iOS/EN: разобрано 4 записи (получено ${r2.length})`);
  assert(r2[0].sentAtIso === '2026-04-12T14:23:07.000Z', `iOS/EN: 12-часовой формат с PM разобран верно (получено ${r2[0].sentAtIso})`);
  assert(r2[1].mediaFilename === 'IMG-0099.jpg', 'iOS/EN: новый формат <attached: ...> распознан');
  assert(r2[2].hasMedia === true && r2[2].mediaFilename === null && r2[2].mediaOmittedKind === 'image', 'iOS/EN: "image omitted" — медиа есть, файла нет');
  assert(r2[3].sentAtIso === '2026-04-13T09:05:00.000Z', 'iOS/EN: 9:05 AM разобран как 09:05, не 21:05');

  // --------------------------------------------------------------------
  // 3. Deduplication: parsing the exact same export twice must yield
  //    IDENTICAL fingerprints for every message, in order.
  // --------------------------------------------------------------------
  const { messages: dupRun1 } = await parseAndFingerprint(androidRu);
  const { messages: dupRun2 } = await parseAndFingerprint(androidRu);
  const sameFingerprints = dupRun1.every((m, i) => m.fingerprint === dupRun2[i].fingerprint);
  assert(sameFingerprints, 'Дедупликация: повторный парсинг того же текста даёт идентичные fingerprint');
  const uniqueFingerprints = new Set(dupRun1.map((m) => m.fingerprint));
  assert(uniqueFingerprints.size === dupRun1.length, 'Дедупликация: у разных сообщений разные fingerprint (коллизий нет)');

  // --------------------------------------------------------------------
  // 4. Overlapping re-import scenario from the spec: first import covers
  //    days 1, second covers days 1+2 — the day-1 messages must fingerprint
  //    identically across both parses so they're detected as duplicates.
  // --------------------------------------------------------------------
  const day1 = '20.08.2026, 10:00 - Аня: День первый';
  const day1and2 = [day1, '21.08.2026, 10:00 - Аня: День второй'].join('\n');
  const { messages: firstImport } = await parseAndFingerprint(day1);
  const { messages: secondImport } = await parseAndFingerprint(day1and2);
  assert(
    firstImport[0].fingerprint !== undefined && firstImport[0].fingerprint === secondImport[0].fingerprint,
    'Повторный импорт с перекрытием: пересекающееся сообщение имеет тот же fingerprint',
  );
  assert(secondImport[1].fingerprint !== secondImport[0].fingerprint, 'Повторный импорт с перекрытием: новое сообщение имеет другой fingerprint');

  // --------------------------------------------------------------------
  // 5. Malformed header line doesn't crash the whole import, and content
  //    isn't silently dropped — it's kept as part of the surrounding
  //    message with a warning.
  // --------------------------------------------------------------------
  const malformed = [
    '12.04.2026, 14:23 - Аня: Начало сообщения',
    '99.99.9999, 99:99 - на самом деле это просто текст, а не заголовок',
    '12.04.2026, 14:25 - Я: Следующее нормальное сообщение',
  ].join('\n');
  const { messages: r5, warnings: w5 } = await parseAndFingerprint(malformed);
  assert(r5.length === 2, `Битый заголовок: не создаёт лишнюю запись, итого 2 сообщения (получено ${r5.length})`);
  assert(r5[0].originalText?.includes('99.99.9999') ?? false, 'Битый заголовок: строка не потеряна, присоединена как продолжение');
  assert(w5.length === 1, `Битый заголовок: зафиксировано предупреждение (получено ${w5.length})`);

  // --------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------
  console.log(`\n${checks - failures}/${checks} проверок пройдено.`);
  if (failures > 0) {
    console.error(`${failures} проверок провалено.`);
    process.exit(1);
  }
}

run();
