import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, searchLab, readPage } from '../lib/lab.mjs';
import { readDataset } from '../lib/artifacts.mjs';
import { users } from '../lib/dataset.mjs';

// F01/A01: empty keyword isolates exact filtering from engine-specific text semantics.
// Oracle is the published fixture, not another search engine or the search implementation.
for (const engine of ['sqlite', 'minisearch', 'orama']) {
  test(`F01/A01 ${engine}: complete paginated set matches fixture for roles, spaces and tags`, async () => {
    const fixture = await readDataset('v1');
    for (const user of ['alice', 'bob', 'admin', 'guest']) {
      for (const spaceId of ['', 'ops', 'restricted']) {
        for (const tagIds of [[], ['database'], ['database', 'runbook']]) {
          const state = newState(); state.user = user;
          const expected = fixture.pages.filter(p => users[user].spaces.includes(p.spaceId)
            && (!spaceId || p.spaceId === spaceId) && tagIds.every(t => p.tagIds.includes(t))).map(p => p.id).sort();
          const q = { keyword: '', spaceId, tagIds, pageSize: 7 };
          const first = await searchLab(state, engine, q);
          assert.equal(first.total, expected.length, `${user}/${spaceId}/${tagIds}: count`);
          const actual = first.hits.map(h => h.id);
          for (let page = 2; page <= Math.ceil(first.total / q.pageSize); page++) {
            const next = await searchLab(state, engine, { ...q, page });
            assert.equal(next.total, expected.length);
            actual.push(...next.hits.map(h => h.id));
          }
          assert.equal(new Set(actual).size, actual.length, 'pagination must not duplicate IDs');
          assert.deepEqual(actual.sort(), expected, `${user}/${spaceId}/${tagIds}: complete set`);
          const beyond = await searchLab(state, engine, { ...q, page: Math.ceil(first.total / q.pageSize) + 1 });
          assert.equal(beyond.hits.length, 0);
        }
      }
    }
  });
}

test('A02: ReBAC outage fails closed for reading AND media, not only search', async () => {
  const state = newState(); state.rebacDown = true;
  await assert.rejects(readPage(state, 'p01'), e => e.status === 503);
  await assert.rejects(readPage(state, 'p01', 'm-p01'), e => e.status === 503);
});

test('A01/A03: known page ID cannot bypass current snapshot ownership', async () => {
  const state = newState(); state.version = 'v2';
  await assert.rejects(readPage(state, 'p09'), e => e.status === 404);
  await assert.rejects(readPage(state, 'p09', 'm-p09'), e => e.status === 404);
  state.user = 'admin';
  assert.equal((await readPage(state, 'p09')).spaceId, 'restricted');
  assert.match((await readPage(state, 'p09', 'm-p09')).content, /Version v2/);
});
