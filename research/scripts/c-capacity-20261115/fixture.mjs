import {mkdir, writeFile, stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';

const [outputArgument, countArgument] = process.argv.slice(2);
const count = Number(countArgument);
if (!outputArgument || !Number.isSafeInteger(count) || count < 10 || count > 100000) {
  throw Error('Usage: node fixture.mjs NEW_OUTDIR COUNT (10..100000; planned smoke=10000, formal=100000)');
}
const output = path.resolve(outputArgument);
await mkdir(output); // Deliberately refuse to overwrite earlier evidence.
const began = new Date().toISOString(), start = performance.now();
const seed = 'c-capacity-20261115-deterministic-v1';
const segmenter = new Intl.Segmenter('zh-Hant', {granularity: 'word'});
function normalize(text) {
  return text.replace(/\p{Script=Han}+/gu, run => [...segmenter.segment(run)].map(x => x.segment).join(' '))
    .replace(/\s+/g, ' ').trim();
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value) + '\n');
const pageId = i => 'p' + String(i).padStart(6, '0');
async function fileDescriptor(filename, key, mimeType, versionDirectory) {
  const hash = createHash('sha256');
  for await (const part of createReadStream(filename)) hash.update(part);
  return {key, bytes: (await stat(filename)).size, sha256: hash.digest('hex'), mimeType,
    file: path.relative(versionDirectory, filename).replaceAll('\\', '/')};
}

// Exact-size, syntactically complete one-page PDFs. The large padding is a PDF
// comment, not realistic scanned/compressed content. This round verifies bytes,
// transfer pressure and membership, NOT rendering or extraction performance.
function pdfPayload(version, id, size) {
  const stream = `BT /F1 12 Tf 50 750 Td (${version} ${id} attachmentknowledge) Tj ET\n`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
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

function source(i, version) {
  const id = pageId(i);
  // The first half belongs to one large Space. Remaining pages spread over 99.
  let spaceId = i <= Math.floor(count / 2) ? 'space0' : 'space' + (1 + ((i - 1) % 99));
  let tags = ['t' + (i % 10), 't' + ((i + 1) % 10)];
  if (version === 'v2' && i === 1) spaceId = 'space1';
  if (version === 'v2' && i === 2) tags = ['t8', 't9'];
  const published = i <= Math.min(count, 256) || (version === 'v2' && i === count + 1);
  const mediaId = published ? 'm' + ((i - 1) % 8) : null;
  const title = `Knowledge page ${id}${version === 'v2' && i === 3 ? ' revised' : ''}`;
  const chinese = i % 5 === 0;
  const prefix = `disaster recovery unique${id} ${chinese ? '災難復原 知識管理 ' : ''}` +
    (published ? 'attachmentknowledge ' : '') + (version === 'v2' && i === 3 ? 'revisiontwo ' : 'revisionone ');
  const target = i % 100 === 0 ? 8 * 1024 : 1024;
  const needed = target - Buffer.byteLength(prefix);
  const body = prefix + (' reference'.repeat(Math.ceil(needed / 10))).slice(0, needed);
  if (Buffer.byteLength(body) !== target) throw Error('BODY_SIZE_ERROR');
  return {i, pageId: id, spaceId, tags, title, content: body, published, mediaId, chinese};
}

const querySpecs = [
  {id: 'common', q: 'disaster', tags: [], identity: 'all', predicate: () => true},
  {id: 'rare', q: 'unique' + pageId(Math.min(123, count)), tags: [], identity: 'all', predicate: p => p.i === Math.min(123, count)},
  {id: 'chinese', q: '災難復原', tags: [], identity: 'all', predicate: p => p.chinese},
  {id: 'space', q: 'disaster', spaceId: 'space1', tags: [], identity: 'all', predicate: p => p.spaceId === 'space1'},
  {id: 'tags', q: 'disaster', tags: ['t0', 't1'], identity: 'all', predicate: p => p.tags.includes('t0') && p.tags.includes('t1')},
  {id: 'absent', q: 'thistermdoesnotexist', tags: [], identity: 'all', predicate: () => false},
  {id: 'pdf', q: 'attachmentknowledge', tags: [], identity: 'all', predicate: p => p.published},
  {id: 'restricted', q: 'disaster', tags: [], identity: 'a', predicate: p => p.spaceId === 'space0'},
  {id: 'restricted-tags', q: 'disaster', tags: ['t0', 't1'], identity: 'a', predicate: p => p.spaceId === 'space0' && p.tags.includes('t0') && p.tags.includes('t1')},
];
const oracle = {schemaVersion: 1, seed, sourceCount: count, sourceOracle: 'source predicates; no SQL queries used for expected values',
  rankingContract: 'Exact total; unique eligible Top10; BM25 ordering equivalence not asserted', versions: {}};
const reports = [];

for (const version of ['v1', 'v2']) {
  const versionStart = performance.now();
  const directory = path.join(output, version);
  await mkdir(directory);
  await mkdir(path.join(directory, 'objects'));
  const objects = [], media = [], pages = [], searchPages = [];
  const queries = querySpecs.map(({predicate, ...spec}) => ({...spec, total: 0, eligibleIds: []}));
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
  database.prepare('INSERT INTO metadata VALUES (?)').run(version);
  const addPage = database.prepare('INSERT INTO pages VALUES (?,?,?,?,?,?,?,?)');
  const addTag = database.prepare('INSERT INTO page_tags VALUES (?,?)');
  const addSearch = database.prepare('INSERT INTO search_index(rowid,title,content) VALUES (?,?,?)');
  const addMedia = database.prepare('INSERT INTO media VALUES (?,?,?,?,?)');
  for (const m of media) addMedia.run(m.mediaId, m.key, m.bytes, m.sha256, m.mimeType);
  const versionCount = count + (version === 'v2' ? 1 : 0);
  for (let i = 1; i <= versionCount; i++) {
    const p = source(i, version);
    searchPages.push({pageId: p.pageId, spaceId: p.spaceId, title: p.title, tagIds: p.tags,
      snippet: Array.from(p.content).slice(0, 160).join('')});
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
    for (let j = 0; j < querySpecs.length; j++) if (querySpecs[j].predicate(p)) {
      queries[j].total++;queries[j].eligibleIds.push(p.pageId);
    }
  }
  database.exec("COMMIT; INSERT INTO search_index(search_index) VALUES ('optimize');");
  const quickCheck = database.prepare('PRAGMA quick_check').get();
  if (quickCheck.quick_check !== 'ok') throw Error('SQLITE_QUICK_CHECK_FAILED');
  database.close();
  const db = await fileDescriptor(path.join(directory, 'search.sqlite'), `${version}/search.sqlite`, 'application/vnd.sqlite3', directory);
  const manifest = {schemaVersion: 1, snapshotId: version, seed, count: versionCount,
    normalization: 'Intl.Segmenter zh-Hant word on Han runs + unicode61',
    nodeVersion: process.version, icuVersion: process.versions.icu,
    bodyCoverage: 'subset-hot-working-set', bodyPageIds: pages.map(p => p.pageId),
    nonPublishedBodyBehavior: 'Explicit BODY_NOT_PUBLISHED; not proof of full-corpus reading',
    db, objects, mediaCount: media.length,
    distribution: {spaces: 100, largeSpaceApproxFraction: 0.5, tagsPerPage: 2, tagCount: 10,
      bodyTextBytes: {'99percent': 1024, '1percent': 8192}, mediaBytes: sizes,
      mediaPayload: 'Exact-sized synthetic PDF with large comment padding; rendering/extraction not tested'}};
  await writeFile(path.join(directory, 'manifest.json'), encode(manifest), {flag: 'wx'});
  oracle.versions[version] = {count: versionCount, queries, pages, searchPages, media,
    changes: version === 'v2' ? ['p000001 Space→space1', 'p000002 Tags→t8,t9', 'p000003 revised title/body',
      'all eight media bytes and keys changed', `${pageId(count + 1)} added with published body`] : []};
  reports.push({snapshotId: version, elapsedMs: performance.now() - versionStart, pages: versionCount,
    dbBytes: db.bytes, objectCount: objects.length, objectBytes: objects.reduce((sum, o) => sum + o.bytes, 0)});
}
await writeFile(path.join(output, 'oracle.json'), encode(oracle), {flag: 'wx'});
const report = {schemaVersion: 1, seed, began, ended: new Date().toISOString(), nodeVersion: process.version,
  sqliteVersion: process.versions.sqlite, icuVersion: process.versions.icu,
  elapsedMs: performance.now() - start, maxRssKiB: process.resourceUsage().maxRSS,
  resourceUsage: process.resourceUsage(), versions: reports,
  scope: 'Builder only. Not a reader footprint; all index rows, but bounded remote-content hot working set.'};
await writeFile(path.join(output, 'build-report.json'), encode(report), {flag: 'wx'});
console.log(JSON.stringify(report));
