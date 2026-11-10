import { buildDemo, serveDemo } from './demo.mjs';
import { chromium } from 'playwright';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = process.argv[2] || '.lab/reports/pagefind';
await mkdir(out, { recursive: true });
const report = { at: new Date().toISOString(), version: '1.6.0', synthetic: true, language: 'zh', includesAttachments: true, queries: [], checks: [], files: [] };
let browser, server;
function check(name, fn) { try { fn(); report.checks.push({ name, passed: true }); } catch (e) { report.checks.push({ name, passed: false, error: e.message }); throw e; } }
try {
  const built = await buildDemo(); report.nodeExports = built.nodeExports;
  async function inventory(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) await inventory(file);
      else { const bytes = await readFile(file); report.files.push({ path: path.relative(built.root, file), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
    }
  }
  await inventory(path.join(built.root, 'pagefind'));
  const serving = await serveDemo(built.root); server = serving.server;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(serving.url);
  const cases = [
    ['english', 'disaster recovery', { space: 'ops' }],
    ['chinese', '資料庫備份', { space: 'ops' }],
    ['tags-and', 'backup', { space: 'ops', tags: ['database', 'runbook'] }],
    ['typo', 'bakcup', { space: 'ops' }],
    ['code', 'ERR_CONN_RESET', { space: 'ops' }],
    ['attachment', 'quartzfalcon', { space: 'ops' }],
    ['restricted-filtered', 'confidential', { space: 'ops' }],
    ['restricted-unfiltered', 'confidential', {}],
  ];
  for (const [name, term, filters] of cases) {
    const result = await page.evaluate(async ({ term, filters }) => {
      const pf = await import('/pagefind/pagefind.js'); const r = await pf.search(term, { filters });
      const data = await Promise.all(r.results.map(h => h.data()));
      return { total: r.results.length, unfilteredResultCount: r.unfilteredResultCount, ids: data.map(d => d.meta.id), content: data.map(d => ({ id: d.meta.id, content: d.content, filters: d.filters })) };
    }, { term, filters });
    report.queries.push({ name, term, filters, ...result });
  }
  const q = name => report.queries.find(q => q.name === name);
  check('tags AND contains p01', () => assert(q('tags-and').ids.includes('p01')));
  check('tags AND excludes p02 with only one tag', () => assert(!q('tags-and').ids.includes('p02')));
  check('tags AND contains only ops', () => assert(q('tags-and').content.every(d => d.filters.space.includes('ops'))));
  check('technical code finds p05', () => assert(q('code').ids.includes('p05')));
  check('pre-extracted attachment finds p06', () => assert(q('attachment').ids.includes('p06')));
  check('UI filter hides restricted hit', () => assert.equal(q('restricted-filtered').total, 0));
  check('removing client filter retrieves p11', () => assert(q('restricted-unfiltered').ids.includes('p11')));
  check('retrieved fragment contains restricted synthetic text', () => assert(q('restricted-unfiltered').content.some(d => /restricted sensitive synthetic/.test(d.content))));
  await page.locator('#query').fill('confidential'); await page.locator('#search').click();
  await page.getByRole('status').filter({ hasText: '0 筆' }).waitFor();
  await page.locator('#scope').selectOption('all'); await page.locator('#search').click();
  await page.getByRole('heading', { name: 'p11 · Confidential backup plan' }).waitFor();
  check('interactive filter counterexample works', () => assert(true));
  check('no browser page errors', () => assert.deepEqual(errors, []));
  report.passed = true;
} catch (e) { report.passed = false; report.failure = e.stack; process.exitCode = 1; }
finally {
  await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, queries: report.queries.map(({name,total,ids}) => ({name,total,ids})), failure: report.failure }, null, 2));
}
