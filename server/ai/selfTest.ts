import { fallback } from './fallback.ts';

const cases: Array<[string, string]> = [
  ['Я люблю тебя', 'romantic'],
  ['Мне очень грустно', 'sad'],
  ['Спокойной ночи', 'night'],
  ['Я помню этот день', 'memory'],
  ['Это важно', 'important'],
  ['Я верю в нас', 'hopeful'],
  ['Хаха, смешно', 'funny'],
  ['Обычный текст', 'normal'],
];

let ok = 0;
for (const [text, mood] of cases) {
  const result = fallback(text);
  if (result.mood !== mood) throw new Error(`${text}: ${result.mood} != ${mood}`);
  if (result.displayText !== text) throw new Error('fallback changed source');
  if (!result.suggestedStyle.frame || !result.suggestedStyle.background) throw new Error('fallback style incomplete');
  ok++;
}
console.log(`AI fallback self-test: ${ok}/${cases.length} passed`);
