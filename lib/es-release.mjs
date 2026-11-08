import { createHash } from 'node:crypto';
import { readDataset } from './artifacts.mjs';
import { searchable } from './dataset.mjs';
import { remote, indexName } from './engines.mjs';

export function esDocuments(data, attachments) {
  return data.pages.map(p => { const d = searchable(p, attachments); return { id: d.id, title: d.title, body: d.body, spaceId: d.spaceId, tagIds: [...d.tagIds].sort() }; });
}
export function digestDocuments(docs) {
  const canonical = [...docs].sort((a,b) => a.id.localeCompare(b.id)).map(d => ({ id: d.id, title: d.title, body: d.body, spaceId: d.spaceId, tagIds: [...d.tagIds].sort() }));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
export async function provisionElastic(version, attachments) {
  const docs = esDocuments(await readDataset(version), attachments), name = indexName(version, attachments);
  if (!name.startsWith('drlab-')) throw new Error('Only drlab-* indices may be provisioned');
  await remote('elasticsearch', `/${name}`, { method: 'PUT', body: JSON.stringify({ settings: { number_of_shards: 1, number_of_replicas: 0 }, mappings: {
    _meta: { lab: 'dr-search', version, attachments, digest: digestDocuments(docs) },
    properties: { id: { type: 'keyword' }, spaceId: { type: 'keyword' }, tagIds: { type: 'keyword' }, title: { type: 'text', analyzer: 'standard' }, body: { type: 'text', analyzer: 'standard' } }
  } }) });
  for (let i=0; i<docs.length; i+=500) {
    const body = docs.slice(i,i+500).flatMap(d => [JSON.stringify({ index: { _index: name, _id: d.id } }), JSON.stringify(d)]).join('\n')+'\n';
    const result = await remote('elasticsearch', '/_bulk?refresh=true', { method: 'POST', headers: { 'content-type': 'application/x-ndjson' }, body });
    if (result.errors) throw new Error('ES bulk indexing failed; release not sealed');
  }
  await remote('elasticsearch', `/${name}/_settings`, { method: 'PUT', body: JSON.stringify({ 'index.blocks.write': true }) });
  return verifyElasticRelease(version, attachments);
}
export async function verifyElasticRelease(version, attachments) {
  const name = indexName(version, attachments), expected = esDocuments(await readDataset(version), attachments);
  const mapping = await remote('elasticsearch', `/${name}/_mapping`);
  const meta = mapping[name]?.mappings?._meta;
  if (meta?.lab !== 'dr-search' || meta.version !== version || meta.attachments !== attachments || meta.digest !== digestDocuments(expected)) throw new Error(`ES release metadata mismatch: ${name}`);
  const settings = await remote('elasticsearch', `/${name}/_settings`);
  if (String(settings[name]?.settings?.index?.blocks?.write) !== 'true') throw new Error(`ES release is not write-blocked: ${name}`);
  const actual = []; let after;
  for (;;) {
    const result = await remote('elasticsearch', `/${name}/_search`, { method: 'POST', body: JSON.stringify({ size: 500, sort: [{ id: 'asc' }], query: { match_all: {} }, ...(after ? { search_after: after } : {}) }) });
    if (result.timed_out || result._shards?.failed) throw new Error('ES verification returned partial results');
    actual.push(...result.hits.hits.map(h => h._source));
    if (result.hits.hits.length < 500) break;
    after = result.hits.hits.at(-1).sort;
  }
  if (actual.length !== expected.length || digestDocuments(actual) !== digestDocuments(expected)) throw new Error(`ES actual content mismatch: ${name}`);
  return { index: name, count: actual.length, digest: digestDocuments(actual), writeBlocked: true };
}
