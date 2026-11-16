import {mkdir, writeFile, appendFile, readFile, stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {source, querySpecs, eligible, pageId, seed, sourceContract} from './source.mjs';

const [outputArgument, countArgument] = process.argv.slice(2);
const count = Number(countArgument);
if (!outputArgument || !Number.isSafeInteger(count) || count < 10 || count > 1000000) {
  throw Error('Usage: node fixture.mjs NEW_OUTDIR COUNT (10..1000000; planned smoke=1000, formal=1000000)');
}
const output = path.resolve(outputArgument);
await mkdir(output);
const began = new Date().toISOString(), start = performance.now();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value) + '\n');
const ownDir = path.dirname(fileURLToPath(import.meta.url));
async function inputHashes() {
  const hashes = {};
  for (const file of ['fixture.mjs', 'source.mjs']) hashes[file] = sha(await readFile(path.join(ownDir, file)));
  return hashes;
}
const inputs = await inputHashes();
const settings = {cacheSizeKiB: 32768, tempStore: 'FILE', mmapSize: 0, journalMode: 'DELETE', transactionRows: 10000};
await writeFile(path.join(output, 'build-inputs.json'), encode({began, count, seed, sourceContract, inputs, settings,
  nodeVersion: process.version, sqliteVersion: process.versions.sqlite, icuVersion: process.versions.icu}), {flag: 'wx'});
await writeFile(path.join(output, 'progress.jsonl'), '', {flag: 'wx'});
async function progress(event) {
  const record = {...event, at: new Date().toISOString(), elapsedMsSinceStart: performance.now() - start};
  await appendFile(path.join(output, 'progress.jsonl'), encode(record));
  console.log(JSON.stringify(record));
}
const segmenter = new Intl.Segmenter('zh-Hant', {granularity: 'word'});
function normalize(text) {
  return text.replace(/\p{Script=Han}+/gu, run => [...segmenter.segment(run)].map(x => x.segment).join(' '))
    .replace(/\s+/g, ' ').trim();
}
async function fileDescriptor(filename, key, mimeType, versionDirectory) {
  const hash = createHash('sha256');
  for await (const part of createReadStream(filename)) hash.update(part);
  return {key, bytes: (await stat(filename)).size, sha256: hash.digest('hex'), mimeType,
    file: path.relative(versionDirectory, filename).replaceAll('\\', '/')};
}
function pdfPayload(version, id, size) {
  const stream = `BT /F1 12 Tf 50 750 Td (${version} ${id} attachmentknowledge) Tj ET\n`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  function make(padding) {
    let text = '%PDF-1.4\n%' + 'x'.repeat(padding) + '\n';
    const offsets = objs.map((object, index) => {
      const offset = text.length;
      text += `${index + 1} 0 obj\n${object}\nendobj\n`;
      return offset;
    });
    const xref = text.length;
    text += 'xref\n0 6\n0000000000 65535 f \n' + offsets.map(x => String(x).padStart(10, '0') + ' 00000 n \n').join('') +
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return text;
  }
  let padding = size - make(0).length;
  for (let i = 0; i < 4; i++) padding += size - make(padding).length;
  const payload = Buffer.from(make(padding), 'ascii');
  if (payload.length !== size) throw Error('PDF_SIZE_ERROR');
  return payload;
}

const oracle = {schemaVersion: 1, seed, sourceContract, sourceSha256: inputs['source.mjs'], sourceCount: count,
  sourceOracle: 'Compact totals from source predicates; returned rows reconstructed by source.mjs, no SQL expectations',
  rankingContract: 'Exact total; unique eligible Top10; exact metadata/prefix snippet; BM25 order equivalence not asserted', versions: {}};
const reports = [];
for (const version of ['v1', 'v2']) {
  const versionStart = performance.now();
  const directory = path.join(output, version);
  await mkdir(directory);await mkdir(path.join(directory, 'objects'));
  const objects = [], media = [], pages = [];
  const queries = querySpecs(count).map(spec => ({...spec, total: 0}));
  const sizes = [65536, 65536, 65536, 65536, 2 * 1024 * 1024, 2 * 1024 * 1024, 2 * 1024 * 1024, 8 * 1024 * 1024];
  for (let i = 0; i < sizes.length; i++) {
    const mediaId = 'm' + i, bytes = pdfPayload(version, mediaId, sizes[i]);
    const file = `objects/${mediaId}.pdf`, key = `${version}/media/${mediaId}/${sha(bytes)}.pdf`;
    await writeFile(path.join(directory, file), bytes, {flag: 'wx'});
    const descriptor = {key, bytes: bytes.length, sha256: sha(bytes), mimeType: 'application/pdf', file};
    objects.push(descriptor);media.push({mediaId, ...descriptor});
  }
  const database = new DatabaseSync(path.join(directory, 'search.sqlite'));
  database.exec(`
    PRAGMA journal_mode=DELETE;
    PRAGMA cache_size=-32768;
    PRAGMA temp_store=FILE;
    PRAGMA mmap_size=0;
    CREATE TABLE metadata(snapshotId TEXT NOT NULL);
    CREATE TABLE pages(pageId TEXT PRIMARY KEY,spaceId TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,
      bodyKey TEXT,bodyBytes INTEGER,bodySha TEXT,mediaId TEXT);
    CREATE INDEX pages_space ON pages(spaceId);
    CREATE TABLE page_tags(pageId TEXT NOT NULL,tagId TEXT NOT NULL,PRIMARY KEY(pageId,tagId));
    CREATE INDEX tags_reverse ON page_tags(tagId,pageId);
    CREATE TABLE media(mediaId TEXT PRIMARY KEY,key TEXT NOT NULL,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,mimeType TEXT NOT NULL);
    CREATE VIRTUAL TABLE search_index USING fts5(title,content,tokenize='unicode61');
    BEGIN;
  `);
  const actualPragmas = {};
  for (const name of ['journal_mode', 'cache_size', 'temp_store', 'mmap_size']) actualPragmas[name] = database.prepare('PRAGMA ' + name).get();
  database.prepare('INSERT INTO metadata VALUES (?)').run(version);
  const addPage = database.prepare('INSERT INTO pages VALUES (?,?,?,?,?,?,?,?)');
  const addTag = database.prepare('INSERT INTO page_tags VALUES (?,?)');
  const addSearch = database.prepare('INSERT INTO search_index(rowid,title,content) VALUES (?,?,?)');
  const addMedia = database.prepare('INSERT INTO media VALUES (?,?,?,?,?)');
  for (const m of media) addMedia.run(m.mediaId, m.key, m.bytes, m.sha256, m.mimeType);
  const versionCount = count + (version === 'v2' ? 1 : 0), insertStart = performance.now();
  let committedBatches = 0;
  for (let i = 1; i <= versionCount; i++) {
    const p = source(i, version, count);
    let descriptor = null;
    if (p.published) {
      const payload = encode({snapshotId: version, pageId: p.pageId, body: p.content});
      const file = `objects/${p.pageId}.json`, key = `${version}/pages/${p.pageId}/${sha(payload)}.json`;
      await writeFile(path.join(directory, file), payload, {flag: 'wx'});
      descriptor = {key, bytes: payload.length, sha256: sha(payload), mimeType: 'application/json', file};
      objects.push(descriptor);
      pages.push({pageId: p.pageId, spaceId: p.spaceId, tags: p.tags, title: p.title, mediaId: p.mediaId,
        bodySha: descriptor.sha256, bodyBytes: descriptor.bytes, bodyKey: descriptor.key});
    }
    const inserted = addPage.run(p.pageId, p.spaceId, p.title, p.content,
      descriptor?.key ?? null, descriptor?.bytes ?? null, descriptor?.sha256 ?? null, p.mediaId);
    for (const tag of p.tags) addTag.run(p.pageId, tag);
    addSearch.run(inserted.lastInsertRowid, normalize(p.title), normalize(p.content));
    for (const query of queries) if (eligible(query.id, p)) query.total++;
    if (i % settings.transactionRows === 0 || i === versionCount) {
      database.exec('COMMIT');committedBatches++;
      await progress({event: 'insert-batch', snapshotId: version, rows: i, totalRows: versionCount});
      if (i < versionCount) database.exec('BEGIN');
    }
  }
  const insertMs = performance.now() - insertStart, optimizeStart = performance.now();
  await progress({event: 'optimize-start', snapshotId: version});
  database.exec("INSERT INTO search_index(search_index) VALUES ('optimize');");
  const optimizeMs = performance.now() - optimizeStart, checkStart = performance.now();
  const quickCheck = database.prepare('PRAGMA quick_check').get();
  if (quickCheck.quick_check !== 'ok') throw Error('SQLITE_QUICK_CHECK_FAILED');
  const quickCheckMs = performance.now() - checkStart;
  database.close();
  const hashStart = performance.now();
  const db = await fileDescriptor(path.join(directory, 'search.sqlite'), `${version}/search.sqlite`, 'application/vnd.sqlite3', directory);
  const hashMs = performance.now() - hashStart;
  const manifest = {schemaVersion: 1, snapshotId: version, seed, sourceContract, sourceSha256: inputs['source.mjs'], count: versionCount,
    normalization: 'Intl.Segmenter zh-Hant word on Han runs + unicode61', nodeVersion: process.version, icuVersion: process.versions.icu,
    bodyCoverage: 'subset-hot-working-set', bodyPageIds: pages.map(p => p.pageId),
    nonPublishedBodyBehavior: 'Explicit BODY_NOT_PUBLISHED; not proof of full-corpus reading', db, objects, mediaCount: media.length,
    distribution: {spaces: 100, largeSpaceApproxFraction: 0.5, tagsPerPage: 2, tagCount: 10,
      bodyTextBytes: {'99percent': 1024, '1percent': 8192}, mediaBytes: sizes,
      mediaPayload: 'Exact-sized synthetic PDF with comment padding; marker also in body, NOT PDF-only extraction validation'}};
  await writeFile(path.join(directory, 'manifest.json'), encode(manifest), {flag: 'wx'});
  oracle.versions[version] = {count: versionCount, queries, pages, media,
    changes: version === 'v2' ? ['p000001 Space→space1', 'p000002 Tags→t8,t9', 'p000003 revised title/body',
      'all eight media bytes and keys changed', `${pageId(count + 1)} added with published body`] : []};
  reports.push({snapshotId: version, elapsedMs: performance.now() - versionStart, insertMs, optimizeMs, quickCheckMs, hashMs,
    committedBatches, actualPragmas, pages: versionCount, dbBytes: db.bytes,
    objectCount: objects.length, objectBytes: objects.reduce((sum, o) => sum + o.bytes, 0)});
  await progress({event: 'version-complete', ...reports.at(-1)});
}
const after = await inputHashes();
if (JSON.stringify(inputs) !== JSON.stringify(after)) throw Error('BUILD_INPUT_CHANGED');
await writeFile(path.join(output, 'oracle.json'), encode(oracle), {flag: 'wx'});
const report = {schemaVersion: 1, completed: true, seed, sourceContract, inputs, settings,
  began, ended: new Date().toISOString(), nodeVersion: process.version,
  sqliteVersion: process.versions.sqlite, icuVersion: process.versions.icu,
  elapsedMs: performance.now() - start, maxRssKiB: process.resourceUsage().maxRSS,
  resourceUsage: process.resourceUsage(), versions: reports,
  scope: 'Builder only. Compact source oracle; full searchable rows, bounded hot remote-content working set. Not a reader footprint.'};
await writeFile(path.join(output, 'build-report.json'), encode(report), {flag: 'wx'});
console.log(JSON.stringify(report));
