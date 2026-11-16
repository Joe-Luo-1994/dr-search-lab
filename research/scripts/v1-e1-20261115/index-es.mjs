import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {esIndex, loopbackOrigin, readManifest, runtime} from './settings.mjs';

if (process.argv.length !== 3) throw new Error('Usage: node index-es.mjs http://127.0.0.1:PORT');
const origin = loopbackOrigin(process.argv[2]);
const {manifest} = await readManifest();
const {snapshotId, sourceSha256, pages} = manifest;
const endpoint = origin + '/' + esIndex;
const existing = await fetch(endpoint, {
  method: 'HEAD', signal: AbortSignal.timeout(10_000), redirect: 'error',
});
if (existing.status !== 404) throw new Error('E1_ES_INDEX_MUST_BE_ABSENT: ' + existing.status);

async function request(url, method, body, contentType = 'application/json') {
  const response = await fetch(url, {
    method, body, headers: {'content-type': contentType},
    signal: AbortSignal.timeout(10_000), redirect: 'error',
  });
  if (!response.ok) throw new Error('E1_ES_' + method + '_' + response.status + ' ' + (await response.text()).slice(0, 1200));
  return response.json();
}

const metadata = {snapshotId, sourceSha256};
const created = await request(endpoint, 'PUT', JSON.stringify({
  settings: {number_of_shards: 1, number_of_replicas: 0},
  mappings: {
    dynamic: 'strict',
    _meta: metadata,
    properties: {
      pageId: {type: 'keyword'},
      spaceId: {type: 'keyword'},
      tagIds: {type: 'keyword'},
      snapshotId: {type: 'keyword'},
      sourceSha256: {type: 'keyword'},
      title: {type: 'text', analyzer: 'standard'},
      content: {type: 'text', analyzer: 'standard'},
    },
  },
}));
if (!created.acknowledged) throw new Error('E1_ES_INDEX_NOT_ACKNOWLEDGED');
const mediaText = new Map(manifest.media.map(file => [file.mediaId, file.extractedText]));
const bulk = pages.flatMap(({pageId, spaceId, title, tagIds, body, mediaIds}) => [
  {create: {_id: pageId}},
  {
    pageId, spaceId, title, tagIds, ...metadata,
    content: [body, ...mediaIds.map(id => mediaText.get(id))].join('\n'),
  },
]).map(line => JSON.stringify(line)).join('\n') + '\n';
const result = await request(endpoint + '/_bulk?refresh=wait_for', 'POST', bulk, 'application/x-ndjson');
if (result.errors || result.items.length !== pages.length) throw new Error('E1_ES_BULK_INCOMPLETE');
const count = await request(endpoint + '/_count', 'GET');
if (count.count !== pages.length || count._shards.failed) throw new Error('E1_ES_COUNT_MISMATCH');
const blocked = await request(endpoint + '/_settings', 'PUT', JSON.stringify({'index.blocks.write': true}));
if (!blocked.acknowledged) throw new Error('E1_ES_WRITE_BLOCK_NOT_ACKNOWLEDGED');
const settings = await request(endpoint + '/_settings/index.blocks.write?flat_settings=true', 'GET');
const writeBlock = settings[esIndex]?.settings?.['index.blocks.write'];
if (writeBlock !== 'true' && writeBlock !== true) throw new Error('E1_ES_WRITE_BLOCK_MISMATCH');
await writeFile(path.join(runtime, 'es.json'), JSON.stringify({
  origin, index: esIndex, snapshotId, sourceSha256,
}), {flag: 'wx'});
console.log(JSON.stringify({origin, index: esIndex, count: count.count, writeBlocked: true, sourceSha256}));
