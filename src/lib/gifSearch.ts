export interface CuratedGifAsset {
  id: string;
  title: string;
  url: string;
  sourceUrl: string;
  tags: string[];
  provider?: string;
}

// A small always-available starter shelf. These are real GIF files hosted by
// Wikimedia Commons, not search pages, so the Admin never opens on an empty
// library while a network search is still running or temporarily unavailable.
export const CURATED_ROMANTIC_GIFS: CuratedGifAsset[] = [
  {
    id: 'curated-giphy-hug',
    title: 'Крепко обнять',
    url: 'https://media.giphy.com/media/od5H3PmEG5EVq/giphy.gif',
    sourceUrl: 'https://giphy.com/gifs/hug-cute-od5H3PmEG5EVq',
    tags: ['объятия', 'любовь', 'поддержка', 'hug', 'comfort'],
    provider: 'GIPHY',
  },
  {
    id: 'curated-giphy-virtual-hug',
    title: 'Объятие через экран',
    url: 'https://media.giphy.com/media/ZBQhoZC0nqknSviPqT/giphy.gif',
    sourceUrl: 'https://giphy.com/gifs/hug-virtual-ZBQhoZC0nqknSviPqT',
    tags: ['объятия', 'скучаю', 'поддержка', 'hug', 'miss'],
    provider: 'GIPHY',
  },
  {
    id: 'curated-giphy-cat-kiss',
    title: 'Котик целует',
    url: 'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif',
    sourceUrl: 'https://giphy.com/gifs/cat-kiss-hugs-MDJ9IbxxvDUQM',
    tags: ['котик', 'поцелуй', 'объятия', 'cat', 'kiss'],
    provider: 'GIPHY',
  },
  {
    id: 'curated-giphy-cat',
    title: 'Милый котик',
    url: 'https://media.giphy.com/media/vFKqnCdLPNOKc/giphy.gif',
    sourceUrl: 'https://giphy.com/gifs/cat-funny-vFKqnCdLPNOKc',
    tags: ['котик', 'милое', 'смешное', 'cat', 'funny'],
    provider: 'GIPHY',
  },
  {
    id: 'curated-hugs-kisses',
    title: 'Объятия и поцелуи',
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/52/Movicons2-hugsandkisses.gif',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Movicons2-hugsandkisses.gif',
    tags: ['объятия', 'поцелуй', 'любовь', 'hug', 'kiss'],
  },
  {
    id: 'curated-hugs-kisses-three',
    title: 'Милые объятия',
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Movicons2-hugsandkisses%283%29.gif',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Movicons2-hugsandkisses(3).gif',
    tags: ['объятия', 'милое', 'любовь', 'hug'],
  },
  {
    id: 'curated-hugs-pixel',
    title: 'Пиксельные объятия',
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/94/Hugsnkisses2x_pix.gif',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Hugsnkisses2x_pix.gif',
    tags: ['объятия', 'пиксель', 'поцелуй', 'hug', 'kiss'],
  },
  {
    id: 'curated-heart',
    title: 'Живое сердечко',
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/62/Animated_Heart.gif',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Animated_Heart.gif',
    tags: ['сердце', 'сердечки', 'любовь', 'heart', 'love'],
  },
  {
    id: 'curated-heart-rotate',
    title: 'Кружащееся сердце',
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/3e/Heart_rotating_near_mid.gif',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Heart_rotating_near_mid.gif',
    tags: ['сердце', 'сердечки', 'романтика', 'heart'],
  },
  {
    id: 'curated-love',
    title: 'Анимация любви',
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/f3/Animation_love.gif',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Animation_love.gif',
    tags: ['любовь', 'романтика', 'love'],
  },
  {
    id: 'curated-wiki-love',
    title: 'Послать немного любви',
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/fe/Send_wiki_love_animation.gif',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Send_wiki_love_animation.gif',
    tags: ['любовь', 'поддержка', 'love', 'comfort'],
  },
  {
    id: 'curated-dragons-love',
    title: 'Дракончики влюбились',
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Wikimania_2024_Dragons_in_love_animation_1.gif',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Wikimania_2024_Dragons_in_love_animation_1.gif',
    tags: ['любовь', 'милое', 'смешное', 'love', 'funny'],
  },
  {
    id: 'curated-good-night',
    title: 'Доброй ночи',
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/53/Good_night%21.gif',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Good_night!.gif',
    tags: ['ночь', 'сон', 'доброй ночи', 'night'],
  },
  {
    id: 'curated-sleeping-cat',
    title: 'Спящий котик',
    url: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Sleeping-cat.gif',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sleeping-cat.gif',
    tags: ['котик', 'сон', 'ночь', 'cat', 'night'],
  },
  {
    id: 'curated-funny-cat',
    title: 'Смешной котик',
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/81/Cat_funny_gif.gif',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cat_funny_gif.gif',
    tags: ['котик', 'смешное', 'улыбка', 'cat', 'funny'],
  },
  {
    id: 'curated-running-cat',
    title: 'Бегущий мультяшный котик',
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/93/Transparent_Cartoon_Running_Cat.gif',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Transparent_Cartoon_Running_Cat.gif',
    tags: ['котик', 'смешное', 'поддержка', 'cat', 'funny'],
  },
];

function includesAny(source: string, expressions: RegExp[]) {
  return expressions.some((expression) => expression.test(source));
}

export function gifSearchTerms(query: string): string[] {
  const source = query.trim().toLocaleLowerCase('ru');
  const terms: string[] = [];
  const add = (...values: string[]) => values.forEach((value) => terms.push(value));

  if (includesAny(source, [/обним/, /hug/])) add('hug', 'Movicons hug');
  if (includesAny(source, [/поцел/, /kiss/])) add('kiss', 'Movicons kiss');
  if (includesAny(source, [/люб/, /роман/, /влюб/, /love/, /romantic/])) add('love animation', 'heart animation');
  if (includesAny(source, [/серд/, /heart/])) add('animated heart', 'heart animation');
  if (includesAny(source, [/ноч/, /сон/, /спи/, /night/, /sleep/])) add('good night', 'sleeping cat');
  if (includesAny(source, [/скуч/, /miss/])) add('miss you', 'hug');
  if (includesAny(source, [/смеш/, /улыб/, /хаха/, /funny/, /smile/])) add('funny cat', 'smiley animation');
  if (includesAny(source, [/груст/, /поддерж/, /боле/, /comfort/, /support/])) add('hug', 'heart animation');
  if (includesAny(source, [/кот/, /кош/, /cat/])) add('cute cat', 'funny cat');
  if (includesAny(source, [/цвет/, /flower/])) add('animated flower', 'flower animation');
  if (includesAny(source, [/подар/, /сюрпр/, /gift/])) add('gift animation', 'surprise animation');
  if (includesAny(source, [/танц/, /dance/])) add('dance animation');

  // Commons search uses AND semantics. Keep every request short instead of
  // sending one impossible "cute warm romantic hug love" query.
  if (terms.length === 0 && /^[a-z0-9 '-]{2,40}$/i.test(source)) add(source.split(/\s+/).slice(0, 2).join(' '));
  if (terms.length === 0) add('love animation', 'hug', 'animated heart');
  return Array.from(new Set(terms)).slice(0, 4);
}

export function curatedGifMatches(query: string, limit = 8): CuratedGifAsset[] {
  const source = query.trim().toLocaleLowerCase('ru');
  const words = source.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2);
  const ranked = CURATED_ROMANTIC_GIFS.map((asset, index) => {
    const haystack = `${asset.title} ${asset.tags.join(' ')}`.toLocaleLowerCase('ru');
    const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 3 : 0), 0) - index * 0.001;
    return { asset, score };
  }).sort((a, b) => b.score - a.score);
  const matching = ranked.filter((item) => item.score > 0);
  return (matching.length ? matching : ranked).slice(0, limit).map((item) => item.asset);
}
