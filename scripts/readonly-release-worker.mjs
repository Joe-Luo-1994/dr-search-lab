// Fresh consumer process: no import of dataset generator, old lab service or exporter.
import assert from 'node:assert/strict';
import { readFile, writeFile, cp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { openRelease, sha256 } from '../lib/readonly-release.mjs';
import { releaseES } from '../lib/release-es.mjs';

const [runRoot, esURL] = process.argv.slice(2);
const plan = JSON.parse(await readFile(path.join(runRoot, 'plan.json'), 'utf8'));
const report = { at: new Date().toISOString(), platform: process.platform, node: process.version, passed: false, checks: [], esRequests: [], scope: 'Synthetic filesystem release; mock Space authorization; loopback ES. Not company API/DB isolation, MinIO or production security.' };
const es = releaseES(esURL, report.esRequests);
let revoked = false, rebacDown = false;
const roles = { alice: ['ops'], bob: ['ops', 'eng'], admin: ['ops', 'eng', 'restricted'], guest: [] };
const authorize = async user => { if (rebacDown) throw Error('injected outage'); return revoked ? [] : roles[user]; };
const options = { es, authorize };
const roots = v => path.join(runRoot, 'dr', v);
const mark = name => report.checks.push(name);
async function reject(operation, status) {
  await assert.rejects(operation, status ? error => error.status === status : undefined);
}
try {
  await assert.rejects(stat(path.join(runRoot, 'producer')), { code: 'ENOENT' });
  mark('Producer path unavailable before fresh consumer starts');
  const releases = {};
  for (const v of ['v1', 'v2']) releases[v] = await openRelease(roots(v), plan[v].manifestHash, options);
  mark('Both packages validate complete metadata, all media bytes and two sealed ES variants');
  for (const item of plan.queries) {
    const actual = await releases[item.version].search(item.user, item.query);
    assert.deepEqual(actual.hits, item.expected.hits);
    assert.equal(actual.total, item.expected.total);
  }
  report.searchComparisons = plan.queries.length;
  mark('Search IDs/order/metadata/scores/totals match captured reference queries');
  let reads = 0, downloads = 0;
  for (const v of ['v1', 'v2']) {
    const release = releases[v];
    // Exhaustive catalog read/download oracle, independently recorded before export.
    for (const user of Object.keys(roles)) for (const page of plan[v].pages) {
      if (!roles[user].includes(page.spaceId)) {
        await reject(() => release.page(user, page.id), 404);
        for (const media of page.mediaIds) await reject(() => release.download(user, page.id, media), 404);
      } else {
        assert.deepEqual(await release.page(user, page.id), page); reads++;
        for (const media of page.mediaIds) {
          const result = await release.download(user, page.id, media);
          assert.equal(sha256(result.bytes), plan[v].mediaHashes[media]);
          assert.equal(result.mime, 'application/octet-stream'); downloads++;
        }
      }
    }
  }
  report.pageReads = reads; report.downloads = downloads;
  mark('Every user/page read and every page/media relation matches independent access/byte oracle');
  const release = releases.v1;
  await reject(() => release.download('alice', 'p01', 'm-p11'), 403);
  await reject(() => release.download('alice', 'p01', '../m-p01'), 403);
  await reject(() => release.download('alice', 'missing', 'm-p01'), 404);
  mark('Forged page/media association and traversal-like IDs rejected');
  const shared = await release.download('alice', 'p01', 'm-shared');
  assert.equal(sha256(shared.bytes), plan.v1.mediaHashes['m-shared']);
  await reject(() => release.download('alice', 'p11', 'm-shared'), 404);
  mark('Shared-media fixture allows authorized parent path, denies unauthorized parent path');
  revoked = true;
  assert.equal((await release.search('alice', { keyword: 'backup' })).total, 0);
  await reject(() => release.page('alice', 'p01'), 404);
  await reject(() => release.download('alice', 'p01', 'm-p01'), 404);
  revoked = false; rebacDown = true;
  for (const operation of [() => release.search('alice'), () => release.page('alice', 'p01'), () => release.download('alice', 'p01', 'm-p01')]) await reject(operation, 503);
  rebacDown = false;
  await reject(() => release.search('unknown'), 503);
  mark('Current role revocation, authorization outage and unknown decisions never deliver content');
  for (const v of ['v1', 'v2']) assert.equal(releases[v].version, v);
  assert((await releases.v1.download('alice', 'p09', 'm-p09')).bytes.length > 0);
  await reject(() => releases.v2.download('alice', 'p09', 'm-p09'), 404);
  report.counterexample = 'V1 still permits p09 and its stored media via old ops lineage; current Space-role checks alone do not fix stale Page ownership.';
  mark('Stale lineage disclosure reproduced, not solved');

  report.rejectedFaults = [];
  async function fault(name, mutate, expectedError, reseal = false) {
    const directory = path.join(runRoot, 'faults', name);
    await cp(roots('v1'), directory, { recursive: true });
    let expected = plan.v1.manifestHash;
    await mutate(directory);
    if (reseal) expected = sha256(await readFile(path.join(directory, 'manifest.json')));
    await assert.rejects(() => openRelease(directory, expected, options), error => {
      assert.match(error.message, expectedError);
      report.rejectedFaults.push({ name, message: error.message, status: error.status, code: error.code });
      return true;
    });
    mark(`Fault rejected: ${name}`);
  }
  async function manifestChange(dir, update) {
    const name = path.join(dir, 'manifest.json'), m = JSON.parse(await readFile(name));
    update(m); await writeFile(name, JSON.stringify(m));
  }
  async function pagesChange(dir, update) {
    const name = path.join(dir, 'pages.json'), p = JSON.parse(await readFile(name));
    update(p); const bytes = Buffer.from(JSON.stringify(p)); await writeFile(name, bytes);
    await manifestChange(dir, m => { m.pages = { bytes: bytes.length, sha256: sha256(bytes) }; });
  }
  // Deletions are restricted to newly created disposable fault copies.
  await fault('missing-media', dir => rm(path.join(dir, 'media', 'm-p01.bin')), /ENOENT/);
  await fault('corrupt-media', dir => writeFile(path.join(dir, 'media', 'm-p01.bin'), 'wrong bytes'), /Artifact mismatch: media\/m-p01.bin/);
  await fault('missing-pages', dir => rm(path.join(dir, 'pages.json')), /ENOENT/);
  await fault('untrusted-manifest', dir => manifestChange(dir, m => { m.createdAt = 'changed'; }), /Untrusted or mismatched manifest/);
  await fault('omitted-required-media', dir => manifestChange(dir, m => { delete m.media['m-p01']; }), /Media inventory mismatch/, true);
  await fault('mixed-page-version', dir => pagesChange(dir, p => { p.pages[0].version = 'v2'; }), /Invalid, duplicate or mixed-version page/, true);
  await fault('duplicate-page-id', dir => pagesChange(dir, p => { p.pages[1].id = p.pages[0].id; }), /Invalid, duplicate or mixed-version page/, true);
  await fault('wrong-es-version', dir => manifestChange(dir, m => { m.es.body.index = plan.v2.manifest.es.body.index; }), /ES and package differ/, true);
  const tampered = path.join(runRoot, 'faults', 'post-open-corruption');
  await cp(roots('v1'), tampered, { recursive: true });
  const opened = await openRelease(tampered, plan.v1.manifestHash, options);
  await writeFile(path.join(tampered, 'media', 'm-p01.bin'), 'changed after load');
  await reject(() => opened.download('alice', 'p01', 'm-p01'), 503);
  mark('Media tampering after package load is rejected on download');
  report.passed = true;
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await writeFile(path.join(runRoot, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, searchComparisons: report.searchComparisons, pageReads: report.pageReads, downloads: report.downloads, failure: report.failure?.message }));
}
