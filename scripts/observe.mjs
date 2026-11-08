import { searchLab, newState } from '../lib/lab.mjs';
import { scenarios } from '../lib/dataset.mjs';
import { readManifest } from '../lib/artifacts.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const observations = [];
for (const scenario of scenarios) {
  const engines = {};
  for (const engine of ['sqlite', 'minisearch', 'orama', ...(process.env.ELASTICSEARCH_URL ? ['elasticsearch'] : [])]) {
    const result = await searchLab(newState(), engine, { ...scenario, pageSize: 5 });
    engines[engine] = { total: result.total, top5: result.hits.map(h => h.id) };
  }
  observations.push({ scenario: scenario.title, keyword: scenario.keyword, engines });
}
const report = { generatedAt: new Date().toISOString(), manifest: await readManifest(), warning: 'Synthetic observations. Different results are not quality rankings. Reference settings, not production Elasticsearch.', observations };
await mkdir('.lab/reports', { recursive: true });
await writeFile('.lab/reports/observations.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(observations, null, 2));
