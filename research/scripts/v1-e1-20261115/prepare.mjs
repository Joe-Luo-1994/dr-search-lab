import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {extractLexical} from './reference/extract-lexical.mjs';
import {normalizeQuery} from './reference/normalize-query.mjs';
import {syntheticPdf} from './pdf.mjs';
import {createRuntimeRoot, runtime, sha256, snapshotDir} from './settings.mjs';

const raw = await readFile(new URL('./fixture/source.json', import.meta.url));
const fixture = JSON.parse(raw);
const sourceSha256 = sha256(raw);
const idPattern = /^[a-z][a-z0-9-]+$/u;

function uniqueIds(records, key) {
  const ids = new Set(records.map(record => record[key]));
  if (ids.size !== records.length || ![...ids].every(id => typeof id === 'string' && idPattern.test(id))) {
    throw new Error('INVALID_E1_FIXTURE_IDS: ' + key);
  }
  return ids;
}

if (fixture.schemaVersion !== 1 || fixture.pages.length > 50 ||
    fixture.snapshotId !== 'v1-e1-20261115-snapshot1' ||
    !Number.isFinite(Date.parse(fixture.snapshotCapturedAt))) {
  throw new Error('INVALID_E1_FIXTURE');
}
const spaces = uniqueIds(fixture.spaces, 'spaceId');
const tags = uniqueIds(fixture.tags, 'tagId');
const media = uniqueIds(fixture.media, 'mediaId');
uniqueIds(fixture.pages, 'pageId');

const pdfs = new Map(fixture.media.map(file => {
  if (!/^[a-z0-9-]+\.pdf$/u.test(file.fileName) || file.mimeType !== 'application/pdf') {
    throw new Error('INVALID_E1_PDF_METADATA');
  }
  const bytes = syntheticPdf(file.extractedText);
  if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
    throw new Error('INVALID_E1_PDF_HASH: ' + file.mediaId);
  }
  return [file.mediaId, {record: file, bytes}];
}));

const seenMedia = new Set();
const pages = fixture.pages.map(entry => {
  const {spaceId, tagIds, mediaIds, paragraphs, title, pageId} = entry;
  if (!spaces.has(spaceId) || new Set(tagIds).size !== tagIds.length ||
      !tagIds.every(id => tags.has(id)) || new Set(mediaIds).size !== mediaIds.length ||
      !mediaIds.every(id => media.has(id)) || typeof title !== 'string' ||
      !paragraphs.length || !paragraphs.every(text => typeof text === 'string' && text.trim() === text && text)) {
    throw new Error('INVALID_E1_PAGE_METADATA: ' + pageId);
  }
  const lexical = {root: {type: 'root', children: paragraphs.map(text => ({
    type: 'paragraph', children: [{type: 'text', text}],
  }))}};
  const body = extractLexical(lexical).text;
  if (body !== paragraphs.join('\n')) throw new Error('E1_EXTRACTION_MISMATCH');
  mediaIds.forEach(id => seenMedia.add(id));
  return {...entry, body};
});
if (seenMedia.size !== pdfs.size) throw new Error('UNREFERENCED_E1_MEDIA');

await createRuntimeRoot();
// Requiring the exact prepared directory to be absent rejects all reuse.
await mkdir(runtime, {mode: 0o700});
await mkdir(snapshotDir, {mode: 0o700});
const pdfDirectory = path.join(snapshotDir, 'media');
await mkdir(pdfDirectory);
await Promise.all([...pdfs].map(([id, {bytes}]) =>
  writeFile(path.join(pdfDirectory, id + '.pdf'), bytes, {flag: 'wx'})));

const database = new DatabaseSync(path.join(snapshotDir, 'search.sqlite'));
try {
  database.exec(`
    CREATE TABLE metadata (snapshotId TEXT NOT NULL, sourceSha256 TEXT NOT NULL);
    CREATE TABLE pages (pageId TEXT NOT NULL UNIQUE, spaceId TEXT NOT NULL);
    CREATE TABLE page_tags (pageRowId INTEGER NOT NULL, tagId TEXT NOT NULL, PRIMARY KEY (pageRowId, tagId));
    CREATE VIRTUAL TABLE search_index USING fts5(title, content, tokenize='unicode61');
    BEGIN;
  `);
  database.prepare('INSERT INTO metadata VALUES (?, ?)').run(fixture.snapshotId, sourceSha256);
  const insertPage = database.prepare('INSERT INTO pages(pageId,spaceId) VALUES (?,?)');
  const insertTag = database.prepare('INSERT INTO page_tags VALUES (?,?)');
  const insertIndex = database.prepare('INSERT INTO search_index(rowid,title,content) VALUES (?,?,?)');
  for (const page of pages) {
    const {lastInsertRowid} = insertPage.run(page.pageId, page.spaceId);
    for (const tagId of page.tagIds) insertTag.run(lastInsertRowid, tagId);
    const content = [page.body, ...page.mediaIds.map(id => pdfs.get(id).record.extractedText)].join('\n');
    insertIndex.run(lastInsertRowid, normalizeQuery(page.title), normalizeQuery(content));
  }
  database.exec('COMMIT');
} finally {
  database.close();
}
await writeFile(path.join(runtime, 'role-profile.txt'), 'baseline\n', {flag: 'wx'});
// Writing the manifest last is a readiness signal for this one-time fixture prep.
const manifest = {...fixture, sourceSha256, pages};
await writeFile(path.join(snapshotDir, 'manifest.json'), JSON.stringify(manifest), {flag: 'wx'});
console.log(JSON.stringify({snapshotDir, sourceSha256, pages: pages.length, media: pdfs.size}));
