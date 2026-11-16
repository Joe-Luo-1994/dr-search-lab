import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {releaseSources} from './fixture/release-sources.mjs';
import {validateSource} from './bundle.mjs';
import {ensureRuntime, producerDir, runtime, sha256, sourceSites, versions} from './settings.mjs';

const base = await readFile(new URL('../v1-e1-20261115/fixture/source.json', import.meta.url));
if (sha256(base) !== '0c70c490dd2798054063f56685f83c1783a030ea312cae4656894b977484cada') {
  throw new Error('E1_SOURCE_HASH_MISMATCH');
}
const e1 = JSON.parse(base);
const releases = releaseSources(e1);
const encoded = new Map(versions.map(version => {
  const source = releases[version];
  validateSource(source, version);
  return [version, Buffer.from(JSON.stringify(source, null, 2) + '\n')];
}));
await ensureRuntime();
await mkdir(producerDir);
for (const site of sourceSites) {
  const directory = path.join(producerDir, site);
  await mkdir(directory);
  for (const [version, bytes] of encoded) {
    await writeFile(path.join(directory, version + '.json'), bytes, {flag: 'wx'});
  }
}
await writeFile(path.join(runtime, 'role-profile.txt'), 'baseline\n', {flag: 'wx'});
console.log(JSON.stringify({
  event: 'e2_producer_ready', producerDir, sites: sourceSites,
  releases: versions.map(version => ({
    version, snapshotId: releases[version].snapshotId, pages: releases[version].pages.length,
    sourceSha256: sha256(encoded.get(version)),
  })),
}));
