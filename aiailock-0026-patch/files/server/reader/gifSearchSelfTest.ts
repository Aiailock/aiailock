import { strict as assert } from 'node:assert';
import { curatedGifMatches, gifSearchTerms } from '../../src/lib/gifSearch.ts';

let passed = 0;
function check(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

check('запрос объятий превращается в короткие запросы Wikimedia', () => {
  const terms = gifSearchTerms('милые объятия');
  assert.ok(terms.includes('hug'));
  assert.ok(terms.every((term) => term.split(/\s+/).length <= 3));
});

check('страх превращается в понятный GIF-поиску запрос', () => {
  assert.ok(gifSearchTerms('страх').some((term) => /fear|scared/.test(term)));
});

check('неизвестный русский запрос всё равно получает рабочий fallback', () => {
  assert.ok(gifSearchTerms('нежность').length >= 2);
});

check('встроенная GIF-полка никогда не пустая', () => {
  const results = curatedGifMatches('объятия');
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.url.endsWith('.gif')));
});

console.log(`GIF search self-test: ${passed}/4 passed`);
