import { remote, indexName } from '../lib/engines.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const index = indexName('v1', false), cases = [];
for (const text of ['disaster recovery', '資料庫備份']) {
  const analyzed = await remote('elasticsearch', `/${index}/_analyze`, { method: 'POST', body: JSON.stringify({ field: 'title', text }) });
  const results = {};
  for (const type of ['match', 'match_phrase', 'term']) {
    const r = await remote('elasticsearch', `/${index}/_search`, { method: 'POST', body: JSON.stringify({ size: 100, track_total_hits: true, query: { bool: { must: [{ [type]: { title: text } }], filter: [{ term: { spaceId: 'ops' } }] } } }) });
    results[type] = { total: r.hits.total.value, ids: r.hits.hits.map(h => h._source.id) };
  }
  cases.push({ text, tokens: analyzed.tokens.map(t => t.token), results });
}
const report = { at: new Date().toISOString(), index, scope: 'Synthetic v1; title only; ops space; ES standard reference analyzer, NOT company configuration', cases };
await mkdir('.lab/reports', { recursive: true });
await writeFile('.lab/reports/es-query-semantics.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
