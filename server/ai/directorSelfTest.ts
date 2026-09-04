import {
  completeSuggestionSet,
  fallbackSuggestions,
  parseDirectorResponse,
  selectCandidateGaps,
  type StoryContextRow,
} from '../../src/lib/localStoryDirector.ts';

let passed = 0;
function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`Director self-test failed: ${message}`);
  passed += 1;
}

const rows: StoryContextRow[] = Array.from({ length: 8 }, (_, index) => ({
  element_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  type: 'message',
  occurred_at: new Date(Date.UTC(2026, 7, 1, index)).toISOString(),
  display_order: index,
  mood: index < 4 ? 'normal' : 'romantic',
  importance: index === 4 ? 5 : 2,
  style: {},
  metadata: {},
  content_text: `Настоящая фраза номер ${index}, которую можно бережно сохранить в нашей истории.`,
  content_title: '',
  media_kind: null,
}));

const gaps = selectCandidateGaps(rows, 'cinematic');
check(gaps.length > 0, 'dense text must produce at least one candidate gap');

const fallback = fallbackSuggestions(gaps.slice(0, 1), 'balanced');
check(fallback.length === 3, 'balanced fallback must return three alternatives');
check(new Set(fallback.map((item) => item.type)).size === fallback.length, 'fallback alternatives must use different types');
check(fallback.some((item) => item.type === 'gif' && item.assetQuery?.includes('animated gif')), 'fallback must include a searchable GIF idea');

const parsed = parseDirectorResponse(`text before [{"gapId":"${gaps[0].id}","type":"pause","variant":"tender","body":"Тихая строка","confidence":0.8}] text after`);
check(parsed.length === 1 && parsed[0].variant === 'tender', 'parser must preserve the variant label');

const completed = completeSuggestionSet(gaps.slice(0, 1), [
  { gapId: gaps[0].id, type: 'pause', body: 'Первый вариант', confidence: .9 },
  { gapId: gaps[0].id, type: 'pause', body: 'Повтор', confidence: .8 },
], 'balanced');
check(completed.length === 3, 'incomplete model output must be filled to three alternatives');
check(new Set(completed.map((item) => item.type)).size === completed.length, 'filled alternatives must remain diverse');

console.log(`Romantic director self-test: ${passed}/7 passed`);
