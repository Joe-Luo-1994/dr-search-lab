import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {extractLexical} from '../v1-e1-20261115/reference/extract-lexical.mjs';
import {normalizeQuery} from '../v1-e1-20261115/reference/normalize-query.mjs';
import {syntheticPdf} from '../v1-e1-20261115/pdf.mjs';
import {checkDirectory, isSha256, readBounded, sha256, snapshotId} from './settings.mjs';

export const maxManifestBytes = 256 * 1024;
export const maxArtifactBytes = 8 * 1024 * 1024;
const safeId = /^[a-z][a-z0-9-]{1,64}$/u;
const pdfPath = mediaId => 'media/' + mediaId + '.pdf';

function recordIds(records, key) {
  if (!Array.isArray(records) || records.length > 50) throw new Error('INVALID_MANIFEST_RECORDS');
  const ids = new Set(records.map(record => record[key]));
  if (ids.size !== records.length || ![...ids].every(id => typeof id === 'string' && safeId.test(id))) {
    throw new Error('INVALID_MANIFEST_IDS');
  }
  return ids;
}

function containsOnlyIds(values, allowed) {
  return Array.isArray(values) && new Set(values).size === values.length && values.every(id => allowed.has(id));
}

export function validateSource(source, version) {
  if (source.schemaVersion !== 2 || source.snapshotId !== snapshotId(version) ||
      !Number.isFinite(Date.parse(source.snapshotCapturedAt)) || !source.pages?.length) {
    throw new Error('INVALID_MANIFEST_SNAPSHOT');
  }
  const spaces = recordIds(source.spaces, 'spaceId');
  const tags = recordIds(source.tags, 'tagId');
  const media = recordIds(source.media, 'mediaId');
  recordIds(source.pages, 'pageId');
  const usedMedia = new Set();
  for (const page of source.pages) {
    if (!spaces.has(page.spaceId) || !containsOnlyIds(page.tagIds, tags) || !containsOnlyIds(page.mediaIds, media) ||
        typeof page.title !== 'string' || !page.title || !Array.isArray(page.paragraphs) || !page.paragraphs.length ||
        !page.paragraphs.every(text => typeof text === 'string' && text && text.trim() === text)) {
      throw new Error('INVALID_MANIFEST_PAGE');
    }
    page.mediaIds.forEach(id => usedMedia.add(id));
  }
  if (usedMedia.size !== media.size) throw new Error('UNREFERENCED_MANIFEST_MEDIA');
  for (const entry of source.media) {
    if (typeof entry.fileName !== 'string' || !/^[a-z0-9-]+\.pdf$/u.test(entry.fileName) ||
        entry.mimeType !== 'application/pdf' || typeof entry.extractedText !== 'string' ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || !isSha256(entry.sha256)) {
      throw new Error('INVALID_MANIFEST_MEDIA');
    }
  }
}

export function projectedPages(source) {
  return source.pages.map(page => {
    const lexical = {root: {type: 'root', children: page.paragraphs.map(text => ({
      type: 'paragraph', children: [{type: 'text', text}],
    }))}};
    const body = extractLexical(lexical).text;
    if (body !== page.paragraphs.join('\n')) throw new Error('E2_EXTRACTION_MISMATCH');
    return {...page, body};
  });
}

export function writeSqlite(directory, manifest) {
  const db = new DatabaseSync(path.join(directory, 'search.sqlite'));
  try {
    db.exec(`
      CREATE TABLE metadata (snapshotId TEXT NOT NULL, sourceSha256 TEXT NOT NULL);
      CREATE TABLE pages (pageId TEXT NOT NULL UNIQUE, spaceId TEXT NOT NULL);
      CREATE TABLE page_tags (pageRowId INTEGER NOT NULL, tagId TEXT NOT NULL, PRIMARY KEY (pageRowId, tagId));
      CREATE VIRTUAL TABLE search_index USING fts5(title, content, tokenize='unicode61');
      BEGIN;
    `);
    db.prepare('INSERT INTO metadata VALUES (?, ?)').run(manifest.snapshotId, manifest.sourceSha256);
    const insertPage = db.prepare('INSERT INTO pages(pageId,spaceId) VALUES (?,?)');
    const insertTag = db.prepare('INSERT INTO page_tags VALUES (?,?)');
    const insertIndex = db.prepare('INSERT INTO search_index(rowid,title,content) VALUES (?,?,?)');
    const media = new Map(manifest.media.map(file => [file.mediaId, file.extractedText]));
    for (const page of manifest.pages) {
      const {lastInsertRowid} = insertPage.run(page.pageId, page.spaceId);
      for (const tagId of page.tagIds) insertTag.run(lastInsertRowid, tagId);
      const content = [page.body, ...page.mediaIds.map(id => media.get(id))].join('\n');
      insertIndex.run(lastInsertRowid, normalizeQuery(page.title), normalizeQuery(content));
    }
    db.exec('COMMIT');
  } finally {
    db.close();
  }
}

export async function writePdfs(directory, files) {
  for (const file of files) {
    const bytes = syntheticPdf(file.extractedText);
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error('SOURCE_PDF_HASH_MISMATCH');
    await writeFile(path.join(directory, pdfPath(file.mediaId)), bytes, {flag: 'wx'});
  }
}

export async function fileDescriptor(directory, relativePath) {
  const bytes = await readBounded(path.join(directory, relativePath), maxArtifactBytes);
  return {path: relativePath, bytes: bytes.length, sha256: sha256(bytes)};
}

export async function describeFiles(directory, media) {
  return Promise.all(['search.sqlite', ...media.map(file => pdfPath(file.mediaId))]
    .map(relativePath => fileDescriptor(directory, relativePath)));
}

export async function readManifest(directory, version, expectedHash) {
  await checkDirectory(directory);
  const raw = await readBounded(path.join(directory, 'manifest.json'), maxManifestBytes);
  const manifestSha256 = sha256(raw);
  if (manifestSha256 !== expectedHash) throw new Error('MANIFEST_SHA256_MISMATCH');
  const manifest = JSON.parse(raw);
  validateSource(manifest, version);
  if (!isSha256(manifest.sourceSha256) || !Array.isArray(manifest.files)) throw new Error('INVALID_MANIFEST');
  const paths = new Map([['search.sqlite', null], ...manifest.media.map(file => [pdfPath(file.mediaId), file])]);
  if (manifest.files.length !== paths.size) throw new Error('INVALID_MANIFEST_CLOSURE');
  let total = 0;
  for (const file of manifest.files) {
    const pdf = paths.get(file.path);
    if (!paths.has(file.path) || !isSha256(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 ||
        (pdf && (file.sha256 !== pdf.sha256 || file.bytes !== pdf.bytes))) {
      throw new Error('INVALID_MANIFEST_FILE');
    }
    paths.delete(file.path);
    total += file.bytes;
  }
  if (total > maxArtifactBytes ||
      !manifest.pages.every(page => page.body === page.paragraphs.join('\n'))) {
    throw new Error('INVALID_MANIFEST_CONTENT');
  }
  return {manifest, raw, manifestSha256, bytes: total};
}

export async function verifyFiles(directory, manifest) {
  await checkDirectory(path.join(directory, 'media'));
  for (const file of manifest.files) {
    const local = await fileDescriptor(directory, file.path);
    if (local.bytes !== file.bytes) throw new Error('FILE_SIZE_MISMATCH: ' + file.path);
    if (local.sha256 !== file.sha256) throw new Error('FILE_SHA256_MISMATCH: ' + file.path);
  }
}

export function verifySqlite(directory, manifest) {
  const db = new DatabaseSync(path.join(directory, 'search.sqlite'), {readOnly: true});
  try {
    const ids = db.prepare('SELECT snapshotId, sourceSha256 FROM metadata').all();
    if (ids.length !== 1 || ids[0].snapshotId !== manifest.snapshotId ||
        ids[0].sourceSha256 !== manifest.sourceSha256) {
      throw new Error('SQLITE_IDENTITY_MISMATCH');
    }
    const integrity = db.prepare('PRAGMA quick_check').all();
    const pages = db.prepare('SELECT count(*) AS total FROM pages').get();
    const search = db.prepare('SELECT count(*) AS total FROM search_index').get();
    if (integrity.length !== 1 || integrity[0].quick_check !== 'ok' ||
        pages.total !== manifest.pages.length || search.total !== manifest.pages.length) {
      throw new Error('SQLITE_INTEGRITY_MISMATCH');
    }
  } finally {
    db.close();
  }
}
