import { strict as assert } from 'node:assert';
import { splitBookText } from '../../src/lib/bookPagination.ts';
import { curatedGifMatches, gifSearchTerms } from '../../src/lib/gifSearch.ts';

let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

check('длинный текст делится на несколько книжных листов', () => {
  const source = Array.from({ length: 24 }, (_, index) => `Это настоящее предложение номер ${index + 1}.`).join(' ');
  const pages = splitBookText(source, 180);
  assert.ok(pages.length >= 4);
  assert.ok(pages.every((page) => page.length > 0 && page.length <= 181));
  assert.equal(pages.join(' ').replace(/\s+/g, ' '), source.replace(/\s+/g, ' '));
});

check('короткое сообщение остаётся одной страницей', () => {
  assert.deepEqual(splitBookText('Спи сладко, солнышко.'), ['Спи сладко, солнышко.']);
});

check('запрос объятий превращается в короткие запросы Wikimedia', () => {
  const terms = gifSearchTerms('милые объятия');
  assert.ok(terms.includes('hug'));
  assert.ok(terms.every((term) => term.split(/\s+/).length <= 2));
});

check('неизвестный русский запрос всё равно получает рабочий fallback', () => {
  assert.ok(gifSearchTerms('нежность').length >= 2);
});

check('встроенная GIF-полка никогда не пустая', () => {
  const results = curatedGifMatches('объятия');
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.url.endsWith('.gif')));
});

console.log(`Book + GIF self-test: ${passed}/5 passed`);
