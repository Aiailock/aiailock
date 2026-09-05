import assert from 'node:assert/strict';
import { refreshReaderWindow } from '../src/lib/refreshReaderWindow.ts';
import type { PublicTimelineRow } from '../src/lib/readerApi.ts';
const row = (id: string) => ({ element_id: id } as PublicTimelineRow);
const page = (ids: string[], more = false, offset = 0) => ({ elements: ids.map(row), hasMore: more, positionOffset: offset, nextCursor: more ? { id: ids.at(-1)!, displayOrder: ids.length, occurredAt: '', sortTiebreak: 0 } : null });
const never = () => false;
let calls = 0;
const fresh = await refreshReaderWindow({ rows: [row('removed'), row('kept')], positionOffset: 0 }, {
  first: async () => page(['new','kept'], true),
  resume: async () => { throw new Error('should not resume'); },
  next: async () => { calls++; return page(['kept','last']); },
}, never);
assert.deepEqual(fresh.elements.map((r) => r.element_id), ['new','kept','last']);
assert.equal(calls, 1); assert.equal(fresh.hasMore, false);
const resumed: string[] = [];
const window = await refreshReaderWindow({ rows: [row('deleted-anchor'), row('survivor')], positionOffset: 9000 }, {
  first: async () => { throw new Error('must not download whole story'); },
  resume: async (id) => { resumed.push(id); if (id === 'deleted-anchor') throw new Error('404'); return page(['survivor'], true, 8999); },
  next: async () => page(['following'], false, 0),
}, never);
assert.deepEqual(resumed, ['deleted-anchor','survivor']);
assert.equal(window.positionOffset, 8999);
assert.deepEqual(window.elements.map((r) => r.element_id), ['survivor','following']);
await assert.rejects(refreshReaderWindow({ rows: [row('x')], positionOffset: 1 }, {
  first: async () => page([]), resume: async () => page([]), next: async () => page([]),
}, () => true), /cancelled/);
console.log('PASS: replacement removes deleted rows, includes new rows, deduplicates pages, retains resumed offset and cancels obsolete work.');
