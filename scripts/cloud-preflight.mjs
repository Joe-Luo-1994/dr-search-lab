import os from 'node:os';
import net from 'node:net';
import { mkdir, writeFile, statfs, access, constants } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const checks = [];
function record(name, status, detail) { checks.push({ name, status, detail }); }
const [major, minor] = process.versions.node.split('.').map(Number);
record('Node >=22.13', major > 22 || major === 22 && minor >= 13 ? 'pass' : 'fail', process.version);
try {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  try { db.exec('CREATE VIRTUAL TABLE probe USING fts5(body)'); }
  finally { db.close(); }
  record('SQLite FTS5', 'pass', 'Created an in-memory FTS5 table');
} catch (error) { record('SQLite FTS5', 'fail', error.message); }
for (const command of ['git', 'tar', ...(process.platform === 'linux' ? ['bash', 'curl', 'sha512sum'] : [])]) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  record(command, result.status === 0 ? 'pass' : 'fail', result.error?.message || result.stdout?.split(/\r?\n/)[0] || result.stderr);
}
record('native ES platform/user', process.platform === 'win32' || process.platform === 'linux' && process.getuid?.() !== 0 ? 'pass' : 'fail',
  { platform: process.platform, arch: process.arch, uid: process.getuid?.() ?? null, note: 'Linux ES must run as a non-root user; no automatic sudo or system changes.' });
try {
  const { chromium } = await import('playwright');
  await access(chromium.executablePath(), constants.R_OK);
  record('Playwright Chromium binary', 'pass', 'Present; browser launch and OS libraries still need smoke testing');
} catch (error) { record('Playwright Chromium binary', 'pending', 'Run npx playwright install --with-deps chromium on Linux; Windows can use Edge.'); }
for (const port of [3000, 19200, 19300]) {
  await new Promise(resolve => {
    const server = net.createServer();
    server.once('error', error => { record(`loopback port ${port}`, 'pending', error.code); resolve(); });
    server.listen(port, '127.0.0.1', () => server.close(() => { record(`loopback port ${port}`, 'pass', 'Bind succeeded'); resolve(); }));
  });
}
const disk = await statfs('.');
const report = { at: new Date().toISOString(), platform: process.platform, arch: process.arch, node: process.version,
  hostReportedResources: { cpus: os.availableParallelism(), totalMemory: os.totalmem(), freeMemory: os.freemem(), diskAvailableBytes: Number(disk.bavail) * Number(disk.bsize) },
  resourceCaveat: 'Host values may not reflect container/cgroup limits. No capacity or cloud lifecycle guarantee.',
  checks, passed: checks.every(check => check.status !== 'fail'),
  stillRequired: ['Actual npm/vendor/browser downloads under cloud network policy', 'Linux native ES lifecycle and full restore experiment', 'Next.js browser preview behind private access', 'Environment publish/resume service restart', 'Cloud CPU/RAM/disk quota and usage cost'] };
await mkdir('.lab/reports', { recursive: true });
await writeFile('.lab/reports/cloud-preflight.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
