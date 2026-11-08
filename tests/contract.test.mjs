import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { newState, searchLab, control, readPage, validateQuery } from '../lib/lab.mjs';
import { readManifest } from '../lib/artifacts.mjs';
before(async () => { await readManifest(); });

for (const engine of ['sqlite', 'minisearch', 'orama']) {
  test(`${engine}: Space + all Tags, and no unauthorized metadata`, async () => {
    const r = await searchLab(newState(), engine, { keyword: 'backup', spaceId: 'ops', tagIds: ['database', 'runbook'], pageSize: 100 });
    assert(r.hits.some(p => p.id === 'p01'));
    assert(!r.hits.some(p => ['p02', 'p03', 'p04', 'p11'].includes(p.id)));
    assert(r.hits.every(p => p.spaceId === 'ops' && ['database', 'runbook'].every(t => p.tagIds.includes(t))));
  });
  test(`${engine}: authorization precedes paging; no duplicates`, async () => {
    const state = newState();
    const a = await searchLab(state, engine, { keyword: 'backup', pageSize: 3 });
    const b = await searchLab(state, engine, { keyword: 'backup', pageSize: 3, page: 2 });
    assert.equal(a.hits.length, 3); assert.equal(b.hits.length, 3);
    assert(a.hits.every(h => !b.hits.some(x => x.id === h.id)));
    assert.equal(a.total, b.total);
  });
  test(`${engine}: guest and revoked space yield zero authorized results`, async () => {
    const state = newState(); state.user = 'guest';
    assert.equal((await searchLab(state, engine, { keyword: 'backup' })).total, 0);
    state.user = 'alice'; await control(state, { action: 'revoke', spaceId: 'ops' });
    assert.equal((await searchLab(state, engine, { keyword: 'backup' })).total, 0);
  });
  test(`${engine}: explicit ReBAC failure, never fall back to allow`, async () => {
    const state = newState(); state.rebacDown = true;
    await assert.rejects(searchLab(state, engine, { keyword: 'backup' }), e => e.status === 503);
  });
  test(`${engine}: attachment text can be included without conflating parser`, async () => {
    assert.equal((await searchLab(newState(), engine, { keyword: 'quartzfalcon' })).total, 0);
    const r = await searchLab(newState(), engine, { keyword: 'quartzfalcon', includeAttachments: true });
    assert.deepEqual(r.hits.map(h => h.id), ['p06']);
  });
  test(`${engine}: stale lineage is demonstrated, v2 corrects the relation`, async () => {
    const state = newState();
    assert.deepEqual((await searchLab(state, engine, { keyword: 'transfermarker' })).hits.map(h => h.id), ['p09']);
    await control(state, { action: 'publish', version: 'v2' });
    assert.equal((await searchLab(state, engine, { keyword: 'transfermarker' })).total, 0);
    assert.deepEqual((await searchLab(state, engine, { keyword: 'freshmarker' })).hits.map(h => h.id), ['p-new']);
  });
}
test('media requires both page permission and membership; revocation applies on download', async () => {
  const state = newState();
  assert.match((await readPage(state, 'p01', 'm-p01')).content, /Synthetic media/);
  await assert.rejects(readPage(state, 'p01', 'm-p04'), e => e.status === 403);
  await assert.rejects(readPage(state, 'p04', 'm-p04'), e => e.status === 404);
  await control(state, { action: 'revoke', spaceId: 'ops' });
  await assert.rejects(readPage(state, 'p01', 'm-p01'), e => e.status === 404);
});
test('failed publish does not advance active version', async () => {
  const state = newState();
  await assert.rejects(control(state, { action: 'publish', version: 'v2', simulateFailure: true }), e => e.status === 409);
  assert.equal(state.version, 'v1');
});
test('untrusted filters and pagination are rejected', () => {
  for (const q of [{ tagIds: 'database' }, { tagIds: ['x OR true'] }, { spaceId: 'ops || true' }, { page: 0 }, { pageSize: 101 }, { keyword: [] }, { includeAttachments: 'false' }]) assert.throws(() => validateQuery(q));
});
test('sessions use independent state objects', async () => {
  const a = newState(), b = newState(); await control(a, { action: 'revoke', spaceId: 'ops' }); assert.deepEqual(b.revoked, []);
});
