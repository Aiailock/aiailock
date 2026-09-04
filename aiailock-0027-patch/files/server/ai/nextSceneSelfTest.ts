import { recommendedStyleForText, suggestNextScenes } from '../../src/lib/nextSceneAdvisor.ts';

let passed = 0;
function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`Next-scene advisor self-test failed: ${message}`);
  passed += 1;
}

const fear = suggestNextScenes('Мне было очень страшно, я испугалась и долго не могла уснуть');
check(fear[0]?.kind === 'gif', 'fear context must prioritize a GIF reaction');
check(fear[0]?.query?.includes('scared'), 'fear GIF must include a useful search query');
check(new Set(fear.map((item) => item.kind)).size === fear.length, 'suggestions must not repeat a scene kind');

const sad = suggestNextScenes('Мне грустно и больно, я плакала');
check(sad.some((item) => item.kind === 'pause'), 'sad context must include a pause');
check(sad.some((item) => item.kind === 'music'), 'sad context must include music');

const travel = suggestNextScenes('Помнишь нашу поездку к морю и тот город?');
check(travel.some((item) => item.kind === 'album'), 'travel context must suggest an album');

const question = suggestNextScenes('А ты помнишь, как всё начиналось?');
check(question.some((item) => item.kind === 'interactive'), 'a question must suggest an interactive scene');

const long = suggestNextScenes('Это очень длинная запись. '.repeat(30));
check(long[0]?.kind === 'pause', 'long text must prioritize breathing room');

const generic = suggestNextScenes('Обычный спокойный день');
check(generic.length === 3, 'generic context must still return three useful ideas');
check(Boolean(recommendedStyleForText('спокойной ночи').zone), 'style recommendation must return a usable zone');

console.log(`Next-scene advisor self-test: ${passed}/10 passed`);
