import { mkdir, readFile, writeFile, cp, rename } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { exportRelease } from '../lib/release-export.mjs';
import { sha256 } from '../lib/readonly-release.mjs';
import { searchLab, newState } from '../lib/lab.mjs';
import { scenarios, users } from '../lib/dataset.mjs';
import { root as dataRoot } from '../lib/artifacts.mjs';

const runRoot = path.resolve('.lab/readonly-release', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(runRoot, { recursive: true });
const report = { at: new Date().toISOString(), platform: process.platform, passed: false, runRoot,
  limitation: 'Synthetic filesystem closure only. Original company services are not present or blocked. No MinIO, real ReBAC, production API, HTTP or capacity claim.' };
try {
  if (!process.env.ELASTICSEARCH_URL || !process.env.LAB_INDEX_PREFIX) throw Error('Existing ES configuration required; this experiment never provisions indices');
  const plan = { queries: [] };
  for (const version of ['v1', 'v2']) {
    const dataset = JSON.parse(await readFile(path.join(dataRoot, `${version}.json`), 'utf8'));
    dataset.pages.find(p => p.id === 'p01').mediaIds.push('m-shared');
    dataset.pages.find(p => p.id === 'p11').mediaIds.push('m-shared');
    const producer = path.join(runRoot, 'producer', version);
    await mkdir(path.join(producer, 'media'), { recursive: true });
    await writeFile(path.join(producer, 'pages.json'), JSON.stringify(dataset));
    const mediaHashes = {};
    for (const id of new Set(dataset.pages.flatMap(p => p.mediaIds))) {
      const bytes = Buffer.concat([Buffer.from(`Synthetic source object\n${version}\n${id}\n`, 'utf8'), Buffer.from(Array.from({ length: 256 }, (_, i) => i))]);
      await writeFile(path.join(producer, 'media', `${id}.bin`), bytes);
      mediaHashes[id] = sha256(bytes);
    }
    const exported = await exportRelease(producer, path.join(runRoot, 'staging', version), process.env.LAB_INDEX_PREFIX);
    await cp(path.join(runRoot, 'staging', version), path.join(runRoot, 'dr', version), { recursive: true });
    plan[version] = { ...exported, pages: dataset.pages, mediaHashes };
    for (const user of Object.keys(users)) {
      const state = { ...newState(), user, version };
      for (const scenario of scenarios) {
        const { id, title, ...q } = scenario;
        const query = { pageSize: 100, ...q };
        const result = await searchLab(state, 'elasticsearch', query);
        plan.queries.push({ version, user, query, expected: { hits: result.hits, total: result.total } });
      }
      // Full pagination reference for filter-only queries, separate from text semantics.
      let page = 1, total;
      do {
        const query = { keyword: '', page, pageSize: 7 };
        const result = await searchLab(state, 'elasticsearch', query);
        total = result.total;
        plan.queries.push({ version, user, query, expected: { hits: result.hits, total } });
        page++;
      } while ((page - 1) * 7 < total);
    }
  }
  await writeFile(path.join(runRoot, 'plan.json'), JSON.stringify(plan));
  // Only this run's synthetic producer is renamed. Running Demo files remain untouched.
  await rename(path.join(runRoot, 'producer'), path.join(runRoot, 'producer.offline'));
  const { stdout } = await promisify(execFile)(process.execPath,
    [path.resolve('scripts/readonly-release-worker.mjs'), runRoot, process.env.ELASTICSEARCH_URL],
    { cwd: runRoot, windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP } });
  report.worker = JSON.parse(stdout.trim());
  report.passed = report.worker.passed;
  report.sourceCommit = (await promisify(execFile)('git', ['rev-parse', 'HEAD'], { windowsHide: true })).stdout.trim();
  report.sourceStatus = (await promisify(execFile)('git', ['status', '--short'], { windowsHide: true })).stdout.trim();
  report.sourceHashes = {};
  for (const file of ['lib/readonly-release.mjs', 'lib/release-export.mjs', 'lib/release-es.mjs', 'scripts/readonly-release-experiment.mjs', 'scripts/readonly-release-worker.mjs']) report.sourceHashes[file] = sha256(await readFile(file));
} catch (error) {
  report.failure = { message: error.message, stdout: error.stdout, stderr: error.stderr };
  process.exitCode = 1;
} finally {
  await writeFile(path.join(runRoot, 'experiment.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
