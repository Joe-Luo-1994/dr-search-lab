import { fork } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv[2] === '--worker') {
  const engine = process.argv[3];
  const importStart = performance.now();
  const { searchLab, newState } = await import('../lib/lab.mjs');
  const importMs = performance.now() - importStart;
  const state = newState();
  const cold = await searchLab(state, engine, { keyword: 'backup', pageSize: 10 });
  const samples = [];
  for (let i = 0; i < 5; i++) await searchLab(state, engine, { keyword: 'backup' });
  for (let i = 0; i < 50; i++) {
    const t = performance.now(); await searchLab(state, engine, { keyword: ['backup', 'disaster recovery', '資料庫備份', 'quartzfalcon'][i % 4], includeAttachments: false }); samples.push(performance.now() - t);
  }
  samples.sort((a,b) => a-b);
  process.send({ engine, count: samples.length, importMs, coldMetrics: cold.metrics, p50Ms: samples[24], p95Ms: samples[47], rssBytes: process.memoryUsage().rss, maxRssKb: process.resourceUsage().maxRSS,
    scope: 'isolated Node worker; imports shared adapters; single client; local metadata read included; not Next.js HTTP or capacity benchmark' });
  process.disconnect();
} else {
  const results = [];
  for (const engine of ['sqlite', 'minisearch', 'orama', ...(process.env.ELASTICSEARCH_URL ? ['elasticsearch'] : [])]) {
    const value = await new Promise((resolve, reject) => {
      const child = fork(fileURLToPath(import.meta.url), ['--worker', engine], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      let result;
      child.on('message', x => { result = x; }); child.on('error', reject);
      child.on('exit', code => code === 0 && result ? resolve(result) : reject(new Error(`worker ${engine} failed (${code})`)));
    });
    results.push(value); console.log(`${engine}: p50=${value.p50Ms.toFixed(2)}ms p95=${value.p95Ms.toFixed(2)}ms RSS=${(value.rssBytes/1048576).toFixed(1)}MiB`);
  }
  const report = { generatedAt: new Date().toISOString(), node: process.version, synthetic: true, disclaimer: 'Small fixture microbenchmark, not production sizing. RSS includes shared module imports and EXCLUDES external ES server. ES requests include local HTTP latency. No cross-region transfer, Docker or RTO measured.', results };
  await mkdir('.lab/reports', { recursive: true });
  await writeFile(path.resolve('.lab/reports/benchmark.json'), JSON.stringify(report, null, 2));
}
