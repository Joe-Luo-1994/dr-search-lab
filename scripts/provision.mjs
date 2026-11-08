import { provisionElastic } from '../lib/es-release.mjs';
import { readDataset } from '../lib/artifacts.mjs';
import { searchable } from '../lib/dataset.mjs';
import { remote, indexName, externalConfig } from '../lib/engines.mjs';

// No production endpoints: this script creates only drlab-* collections/indices.
async function meiliTask(result) {
  if (result.taskUid === undefined) return;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const task = await remote('meilisearch', `/tasks/${result.taskUid}`);
    if (task.status === 'succeeded') return;
    if (task.status === 'failed' || task.status === 'canceled') throw new Error(JSON.stringify(task.error));
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Meilisearch task timeout');
}
let configured = 0;
for (const engine of ['elasticsearch', 'meilisearch', 'typesense']) {
  if (!externalConfig(engine)) { console.log(`${engine}: skipped (URL not configured)`); continue; }
  const endpoint = new URL(externalConfig(engine).base);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('Provision is limited to localhost demo services');
  configured++;
  for (const version of ['v1', 'v2']) for (const attachments of [false, true]) {
    const name = indexName(version, attachments);
    const data = await readDataset(version);
    const docs = data.pages.map(p => { const d = searchable(p, attachments); return { id: d.id, title: d.title, body: d.body, spaceId: d.spaceId, tagIds: d.tagIds }; });
    // Existing datasets are intentionally not overwritten: rebuild with a new local volume for a new fixture.
    if (engine === 'elasticsearch') {
      await provisionElastic(version, attachments);
    } else if (engine === 'meilisearch') {
      await meiliTask(await remote(engine, '/indexes', { method: 'POST', body: JSON.stringify({ uid: name, primaryKey: 'id' }) }));
      await meiliTask(await remote(engine, `/indexes/${name}/settings`, { method: 'PATCH', body: JSON.stringify({ searchableAttributes: ['title', 'body'], filterableAttributes: ['spaceId', 'tagIds'], pagination: { maxTotalHits: 10000 } }) }));
      for (let i = 0; i < docs.length; i += 500) await meiliTask(await remote(engine, `/indexes/${name}/documents`, { method: 'POST', body: JSON.stringify(docs.slice(i, i + 500)) }));
    } else {
      await remote(engine, '/collections', { method: 'POST', body: JSON.stringify({ name, fields: [{ name: 'title', type: 'string' }, { name: 'body', type: 'string' }, { name: 'spaceId', type: 'string', facet: true }, { name: 'tagIds', type: 'string[]', facet: true }] }) });
      // Use individual writes for a small, transparent demo; not an ingestion benchmark.
      for (const d of docs) await remote(engine, `/collections/${name}/documents`, { method: 'POST', body: JSON.stringify(d) });
    }
    console.log(`${engine}: ${name} ready (${docs.length} documents)`);
  }
}
if (!configured) { console.error('No external services configured. See .env.example and README.md.'); process.exitCode = 1; }
