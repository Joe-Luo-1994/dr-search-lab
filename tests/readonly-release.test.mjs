import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exportRelease } from '../lib/release-export.mjs';
import { openRelease, releaseDocuments, documentDigest } from '../lib/readonly-release.mjs';

// Unit fault injection complements the real-ES experiment; this adapter is a stub.
async function fixture(t) {
  await mkdir('.lab/test-runs', { recursive: true });
  const root = await mkdtemp(path.resolve('.lab/test-runs/release-'));
  const pages = [
    { id: 'allowed', spaceId: 'ops', tagIds: ['runbook'], mediaIds: ['shared'] },
    { id: 'secret', spaceId: 'restricted', tagIds: ['runbook'], mediaIds: ['shared'] },
    { id: 'wrong-tag', spaceId: 'ops', tagIds: [], mediaIds: [] },
  ].map(p => ({ version: 'v1', title: p.id, bodyText: 'backup', attachmentText: '', ...p }));
  await mkdir(path.join(root, 'source/media'), { recursive: true });
  await writeFile(path.join(root, 'source/pages.json'), JSON.stringify({ version: 'v1', pages }));
  await writeFile(path.join(root, 'source/media/shared.bin'), Buffer.from([0, 255, 127, 13, 10]));
  const exported = await exportRelease(path.join(root, 'source'), path.join(root, 'dr'), 'drlab-unit-');
  const state = { decision: ['ops'], hits: [{ id: 'allowed', score: 1 }], searches: 0 };
  const es = {
    async inspect(index) {
      const attachments = index.endsWith('-attachments'), documents = releaseDocuments(pages, attachments);
      return { version: 'v1', attachments, documents, digest: documentDigest(documents), writeBlocked: true };
    },
    async search(_index, query) {
      state.searches++;
      assert.deepEqual(query.allowedSpaces, ['ops']);
      return { total: state.hits.length, hits: state.hits };
    }
  };
  const release = await openRelease(path.join(root, 'dr'), exported.manifestHash, { es, authorize: async () => state.decision });
  return { release, state, exported };
}

test('readonly package rejects unauthorized, missing, duplicate and wrong-tag ES hits', async t => {
  const { release, state } = await fixture(t);
  for (const ids of [['secret'], ['missing'], ['allowed', 'allowed'], ['wrong-tag']]) {
    state.hits = ids.map(id => ({ id, score: 1 }));
    await assert.rejects(release.search('alice', { tagIds: ['runbook'] }), e => e.status === 503);
  }
});

test('readonly package refuses unknown decisions before contacting ES or delivering content', async t => {
  const { release, state } = await fixture(t);
  for (const decision of [undefined, null, true, { allowed: true }, ['ops', 'ops']]) {
    state.decision = decision;
    for (const action of [() => release.search('alice'), () => release.page('alice', 'allowed'), () => release.download('alice', 'allowed', 'shared')]) {
      await assert.rejects(action, e => e.status === 503);
    }
  }
  assert.equal(state.searches, 0);
});

test('readonly package stores shared binary once; returned page mutation cannot grant access', async t => {
  const { release, exported } = await fixture(t);
  assert.deepEqual(Object.keys(exported.manifest.media), ['shared']);
  assert.deepEqual((await release.download('alice', 'allowed', 'shared')).bytes, Buffer.from([0, 255, 127, 13, 10]));
  const page = await release.page('alice', 'allowed');
  page.mediaIds.push('unrelated');
  await assert.rejects(release.download('alice', 'allowed', 'unrelated'), e => e.status === 403);
  await assert.rejects(release.download('alice', 'secret', 'shared'), e => e.status === 404);
});
