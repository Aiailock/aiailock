export type SuggestedSceneKind = 'note' | 'memory' | 'special' | 'chapter' | 'quote' | 'pause' | 'album' | 'gif' | 'video' | 'voice' | 'music' | 'link' | 'interactive';

export interface NextSceneSuggestion {
  id: string;
  kind: SuggestedSceneKind;
  title: string;
  body: string;
  query?: string;
  reason: string;
  confidence: number;
  style: Record<string, unknown>;
  interaction?: string;
}

interface Signal {
  id: string;
  patterns: RegExp[];
  suggestions: NextSceneSuggestion[];
}

const suggestion = (
  id: string,
  kind: SuggestedSceneKind,
  title: string,
  body: string,
  reason: string,
  confidence: number,
  style: Record<string, unknown>,
  query?: string,
  interaction?: string,
): NextSceneSuggestion => ({ id, kind, title, body, reason, confidence, style, query, interaction });

const SIGNALS: Signal[] = [
  {
    id: 'fear',
    patterns: [/страш/i, /боюсь/i, /испуг/i, /тревож/i, /кошмар/i, /fear/i, /scared/i],
    suggestions: [
      suggestion('fear-gif', 'gif', 'Живая реакция', '', 'В тексте есть страх или тревога — короткая реакция передаст эмоцию без лишних слов.', .93, { zone: 'night', frame: 'minimal', spacing: 'normal', animation: 'zoom' }, 'scared reaction cute animated gif'),
      suggestion('fear-pause', 'pause', '', 'Здесь можно на секунду выдохнуть. Я рядом.', 'После напряжённой фразы истории полезна тихая пауза.', .86, { zone: 'dusk', font: 'badscript', decoration: ['candles'], spacing: 'cinematic' }),
      suggestion('fear-voice', 'voice', 'Я рядом', '', 'Живой голос может мягче всего поддержать после тревожного момента.', .74, { zone: 'night', audioPlayerStyle: 'voice', spacing: 'normal' }),
    ],
  },
  {
    id: 'sad',
    patterns: [/груст/i, /плак/i, /слез/i, /слёз/i, /больно/i, /тяжел/i, /одинок/i, /sad/i, /cry/i],
    suggestions: [
      suggestion('sad-pause', 'pause', '', 'Не торопись листать дальше. Этот момент тоже важен.', 'Грустной сцене нужен воздух, чтобы не перебить её следующей записью.', .92, { zone: 'rain', font: 'literata', decoration: ['rain'], spacing: 'cinematic' }),
      suggestion('sad-music', 'music', 'Музыка этого момента', '', 'Спокойная музыка может продолжить настроение без выдуманного текста.', .78, { zone: 'night', audioPlayerStyle: 'vinyl', spacing: 'cinematic' }, 'gentle comforting instrumental'),
      suggestion('sad-gif', 'gif', 'Обнимаю', '', 'Небольшая GIF-поддержка смягчит тяжёлый фрагмент.', .73, { zone: 'romantic', frame: 'polaroid', spacing: 'normal' }, 'comfort hug cute animated gif'),
    ],
  },
  {
    id: 'love',
    patterns: [/люб/i, /скуча/i, /обним/i, /целу/i, /нежн/i, /сердц/i, /love/i, /miss you/i, /hug/i],
    suggestions: [
      suggestion('love-gif', 'gif', 'Маленькая эмоция', '', 'Тёплая фраза естественно продолжается объятием или сердечком.', .91, { zone: 'romantic', frame: 'polaroid', decoration: ['petals'], spacing: 'normal' }, 'cute warm hug love animated gif'),
      suggestion('love-special', 'special', 'Особенный момент', '', 'Сильную настоящую фразу можно выделить отдельной сценой.', .83, { zone: 'romantic', frame: 'heart', font: 'badscript', decoration: ['petals'], textAlign: 'center', spacing: 'cinematic' }),
      suggestion('love-voice', 'voice', 'Сказать это голосом', '', 'После признания хорошо работает короткое личное голосовое.', .69, { zone: 'romantic', audioPlayerStyle: 'voice', spacing: 'normal' }),
    ],
  },
  {
    id: 'funny',
    patterns: [/смеш/i, /ахах/i, /хаха/i, /лол/i, /угар/i, /шут/i, /😂|🤣/, /funny/i, /laugh/i],
    suggestions: [
      suggestion('funny-gif', 'gif', 'Та самая реакция', '', 'Смешной эпизод просит короткую визуальную реакцию.', .94, { zone: 'gif', frame: 'ticket', decoration: ['confetti'], spacing: 'normal', animation: 'zoom' }, 'funny laughing reaction cute animated gif'),
      suggestion('funny-quote', 'quote', 'из нашей истории', '', 'Самую смешную настоящую фразу можно вынести в большую цитату.', .78, { zone: 'burgundy', font: 'badscript', textAlign: 'center', spacing: 'cinematic' }),
      suggestion('funny-album', 'album', 'Как это было', '', 'Если сохранились кадры, мини-альбом продолжит эпизод лучше пересказа.', .63, { zone: 'day', frame: 'washi', spacing: 'normal' }),
    ],
  },
  {
    id: 'night',
    patterns: [/спокойной ночи/i, /не спи/i, /ноч/i, /сон/i, /лун/i, /звезд/i, /звёзд/i, /night/i, /sleep/i],
    suggestions: [
      suggestion('night-music', 'music', 'Ночная мелодия', '', 'Ночная сцена может плавно перейти в тихую музыку.', .86, { zone: 'night', frame: 'moonlit', decoration: ['stardust'], audioPlayerStyle: 'glass', spacing: 'cinematic' }, 'soft night romantic instrumental'),
      suggestion('night-pause', 'pause', '', 'И пусть эта ночь ещё немного останется здесь.', 'Короткая пауза сохраняет ощущение завершённого вечера.', .81, { zone: 'night', font: 'badscript', decoration: ['stardust'], spacing: 'cinematic' }),
      suggestion('night-gif', 'gif', 'Спокойной ночи', '', 'Небольшая ночная GIF добавит движение, не перегружая сцену.', .67, { zone: 'night', frame: 'moonlit', spacing: 'normal' }, 'cute good night stars moon animated gif'),
    ],
  },
  {
    id: 'travel',
    patterns: [/поезд/i, /путеше/i, /дорог/i, /самолет/i, /самолёт/i, /море/i, /город/i, /вокзал/i, /travel/i, /trip/i],
    suggestions: [
      suggestion('travel-album', 'album', 'Кадры этой поездки', '', 'Упоминание места или дороги лучше всего поддержать несколькими настоящими фото.', .91, { zone: 'travel', frame: 'postcard', spacing: 'cinematic' }),
      suggestion('travel-chapter', 'chapter', 'Новая точка на карте', '', 'Если здесь начался новый период, глава сделает переход понятнее.', .72, { zone: 'travel', font: 'yeseva', decoration: ['leaves'], spacing: 'cinematic' }),
      suggestion('travel-music', 'music', 'Музыка дороги', '', 'Трек может соединить разрозненные кадры поездки.', .62, { zone: 'travel', audioPlayerStyle: 'cassette', spacing: 'normal' }, 'road trip memory song'),
    ],
  },
  {
    id: 'celebration',
    patterns: [/праздн/i, /день рождения/i, /годовщ/i, /ура/i, /поздрав/i, /подар/i, /🎉|🥳/, /birthday/i],
    suggestions: [
      suggestion('party-gif', 'gif', 'Ура!', '', 'Праздничной фразе подойдёт яркая GIF-реакция.', .93, { zone: 'gif', frame: 'garland', decoration: ['confetti'], spacing: 'cinematic' }, 'cute celebration confetti happy animated gif'),
      suggestion('party-album', 'album', 'Этот день в кадрах', '', 'Несколько фотографий соберут событие в одну цельную сцену.', .84, { zone: 'evening', frame: 'polaroid', decoration: ['confetti'], spacing: 'cinematic' }),
      suggestion('party-special', 'special', 'День, который хочется сохранить', '', 'Важную дату можно подчеркнуть отдельным особенным моментом.', .72, { zone: 'burgundy', frame: 'gold', decoration: ['stardust'], spacing: 'cinematic' }),
    ],
  },
  {
    id: 'question',
    patterns: [/\?/, /как думаешь/i, /помнишь/i, /выбери/i, /угадай/i, /хочешь/i],
    suggestions: [
      suggestion('question-interactive', 'interactive', 'А теперь маленький вопрос', '', 'В тексте есть вопрос — его можно продолжить настоящим интерактивным выбором.', .89, { zone: 'romantic', frame: 'heart', spacing: 'cinematic' }, undefined, 'question'),
      suggestion('question-voice', 'voice', 'Ответ голосом', '', 'Вопрос можно продолжить личным голосовым сообщением.', .64, { zone: 'default', audioPlayerStyle: 'voice', spacing: 'normal' }),
    ],
  },
  {
    id: 'memory',
    patterns: [/помнишь/i, /фото/i, /скрин/i, /кадр/i, /тогда/i, /в тот день/i, /раньше/i, /remember/i, /photo/i],
    suggestions: [
      suggestion('memory-album', 'album', 'Несколько кадров', '', 'Текст ссылается на прошлый момент — настоящие фото или скриншоты добавят контекст.', .88, { zone: 'sepia', frame: 'polaroid', spacing: 'cinematic' }),
      suggestion('memory-quote', 'quote', 'та самая фраза', '', 'Можно выделить одну реальную фразу из воспоминания, не переписывая историю.', .71, { zone: 'burgundy', frame: 'wax-seal', font: 'badscript', textAlign: 'center', spacing: 'cinematic' }),
    ],
  },
];

const DEFAULT_SUGGESTIONS: NextSceneSuggestion[] = [
  suggestion('default-pause', 'pause', '', 'И ещё одна маленькая пауза между нашими страницами.', 'Пауза мягко разделит сцены и не перегрузит ленту.', .58, { zone: 'dusk', font: 'literata', decoration: ['candles'], spacing: 'cinematic' }),
  suggestion('default-gif', 'gif', 'Живая эмоция', '', 'GIF добавит движение, если следующей сцене не нужен новый длинный текст.', .55, { zone: 'gif', frame: 'minimal', spacing: 'normal' }, 'cute warm reaction animated gif'),
  suggestion('default-quote', 'quote', 'из нашей истории', '', 'Можно выбрать одну настоящую фразу из только что написанного текста.', .51, { zone: 'burgundy', font: 'badscript', textAlign: 'center', spacing: 'cinematic' }),
];

function normalize(value: string) {
  return value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

export function suggestNextScenes(text: string, limit = 3): NextSceneSuggestion[] {
  const normalized = normalize(text);
  if (!normalized) return DEFAULT_SUGGESTIONS.slice(0, limit);
  const ranked = SIGNALS
    .map((signal) => ({
      signal,
      hits: signal.patterns.reduce((count, pattern) => count + (pattern.test(normalized) ? 1 : 0), 0),
    }))
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  const candidates = ranked.flatMap(({ signal, hits }, signalIndex) => signal.suggestions.map((item, itemIndex) => ({
    ...item,
    confidence: Math.min(.99, item.confidence + Math.min(.05, (hits - 1) * .025) - signalIndex * .015 - itemIndex * .002),
  })));
  if (normalized.length > 480) {
    candidates.push(suggestion('long-pause', 'pause', '', 'Здесь хочется остановиться и просто дать этим словам прозвучать.', 'После длинной записи короткая пауза улучшит ритм чтения.', .9, { zone: 'dusk', font: 'literata', spacing: 'cinematic' }));
  }
  const unique = new Map<SuggestedSceneKind, NextSceneSuggestion>();
  [...candidates, ...DEFAULT_SUGGESTIONS].forEach((item) => {
    const current = unique.get(item.kind);
    if (!current || item.confidence > current.confidence) unique.set(item.kind, item);
  });
  return Array.from(unique.values()).sort((a, b) => b.confidence - a.confidence).slice(0, Math.max(1, limit));
}

export function recommendedStyleForText(text: string): Record<string, unknown> {
  return suggestNextScenes(text, 1)[0]?.style ?? DEFAULT_SUGGESTIONS[0].style;
}
