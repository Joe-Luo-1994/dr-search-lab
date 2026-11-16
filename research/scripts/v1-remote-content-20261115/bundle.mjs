import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {verifySqlite} from '../v1-e2-20261115/bundle.mjs';
import {
  bodyMimeType, readPinnedManifest, readSearchText, searchTextFile, searchTextFormat,
} from './manifest.mjs';
import {checkDirectory, isSha256, maxArtifactBytes, maxObjectBytes, readBounded, sha256, snapshotId} from './settings.mjs';

export {verifySqlite};

const safeId = /^[a-z][a-z0-9-]{1,64}$/u;
const artifactFiles = ['search.sqlite', searchTextFile];

function hasFields(record, fields) {
  return record && typeof record === 'object' && !Array.isArray(record) &&
    Object.keys(record).length === fields.length && fields.every(field => Object.hasOwn(record, field));
}

function recordIds(records, id, fields) {
  if (!Array.isArray(records) || records.length > 50 ||
      !records.every(record => hasFields(record, fields) && typeof record[id] === 'string' && safeId.test(record[id]))) {
    throw new Error('INVALID_MANIFEST_RECORDS');
  }
  const ids = new Set(records.map(record => record[id]));
  if (ids.size !== records.length) throw new Error('DUPLICATE_MANIFEST_IDS');
  return ids;
}

function containsOnlyIds(values, allowed) {
  return Array.isArray(values) && new Set(values).size === values.length && values.every(id => allowed.has(id));
}

function nonemptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validObjectDescriptor(descriptor, snapshot, kind, suffix, mimeType) {
  if (!descriptor || typeof descriptor.key !== 'string' || descriptor.mimeType !== mimeType ||
      !isSha256(descriptor.sha256) || !Number.isSafeInteger(descriptor.bytes) ||
      descriptor.bytes < 1 || descriptor.bytes > maxObjectBytes) return false;
  // Bind all server keys to the release namespace and object kind. The expected content SHA
  // is checked independently of the key, including for the deliberate wrong-object candidate.
  const parts = descriptor.key.split('/');
  if (parts.length !== 4) return false;
  const [prefix, scope, owner, filename] = parts;
  return prefix === snapshot && scope === kind && safeId.test(owner) &&
    filename.endsWith(suffix) && isSha256(filename.slice(0, -suffix.length));
}

function validateManifest(manifest, version) {
  if (!hasFields(manifest, [
    'schemaVersion', 'searchTextFormat', 'snapshotId', 'snapshotCapturedAt', 'sourceSha256',
    'spaces', 'tags', 'pages', 'media', 'files',
  ]) || manifest.schemaVersion !== 1 || manifest.searchTextFormat !== searchTextFormat ||
      manifest.snapshotId !== snapshotId(version) || !Number.isFinite(Date.parse(manifest.snapshotCapturedAt)) ||
      !isSha256(manifest.sourceSha256)) {
    throw new Error('INVALID_REMOTE_CONTENT_MANIFEST');
  }

  const spaces = recordIds(manifest.spaces, 'spaceId', ['spaceId', 'label']);
  const tags = recordIds(manifest.tags, 'tagId', ['tagId', 'label']);
  const media = recordIds(manifest.media, 'mediaId', ['mediaId', 'fileName', 'mimeType', 'key', 'bytes', 'sha256']);
  recordIds(manifest.pages, 'pageId', ['pageId', 'spaceId', 'title', 'tagIds', 'mediaIds', 'bodyObject']);
  if (!manifest.pages.length || ![...manifest.spaces, ...manifest.tags].every(entry => nonemptyText(entry.label))) {
    throw new Error('INVALID_MANIFEST_METADATA');
  }

  const usedMedia = new Set();
  for (const page of manifest.pages) {
    if (!spaces.has(page.spaceId) || !containsOnlyIds(page.tagIds, tags) || !containsOnlyIds(page.mediaIds, media) ||
        !nonemptyText(page.title) || !hasFields(page.bodyObject, ['key', 'mimeType', 'bytes', 'sha256']) ||
        !validObjectDescriptor(page.bodyObject, manifest.snapshotId, 'pages', '.json', bodyMimeType)) {
      throw new Error('INVALID_MANIFEST_PAGE');
    }
    page.mediaIds.forEach(id => usedMedia.add(id));
  }
  if (usedMedia.size !== media.size) throw new Error('UNREFERENCED_MANIFEST_MEDIA');

  for (const file of manifest.media) {
    if (typeof file.fileName !== 'string' || !/^[a-z0-9-]+\.pdf$/u.test(file.fileName) ||
        !validObjectDescriptor(file, manifest.snapshotId, 'media', '.pdf', 'application/pdf')) {
      throw new Error('INVALID_MANIFEST_MEDIA');
    }
  }

  const expectedPaths = new Set(artifactFiles);
  if (!Array.isArray(manifest.files) || manifest.files.length !== expectedPaths.size) {
    throw new Error('INVALID_MANIFEST_CLOSURE');
  }
  let bytes = 0;
  for (const file of manifest.files) {
    if (!hasFields(file, ['path', 'bytes', 'sha256']) || !expectedPaths.delete(file.path) ||
        !isSha256(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > maxArtifactBytes) {
      throw new Error('INVALID_MANIFEST_FILE');
    }
    bytes += file.bytes;
  }
  if (bytes > maxArtifactBytes) throw new Error('ARTIFACT_TOO_LARGE');
  return bytes;
}

function validateSearchText(text, manifest) {
  if (!hasFields(text, ['format', 'snapshotId', 'pages', 'media']) ||
      text.format !== searchTextFormat || text.snapshotId !== manifest.snapshotId) {
    throw new Error('SEARCH_TEXT_IDENTITY_MISMATCH');
  }
  const pages = recordIds(text.pages, 'pageId', ['pageId', 'paragraphs']);
  const media = recordIds(text.media, 'mediaId', ['mediaId', 'extractedText']);
  if (pages.size !== manifest.pages.length || !manifest.pages.every(page => pages.has(page.pageId)) ||
      media.size !== manifest.media.length || !manifest.media.every(file => media.has(file.mediaId)) ||
      !text.pages.every(page => Array.isArray(page.paragraphs) && page.paragraphs.length &&
        page.paragraphs.every(nonemptyText)) || !text.media.every(file => typeof file.extractedText === 'string')) {
    throw new Error('INVALID_SEARCH_TEXT');
  }
}

export async function readManifest(directory, version, expectedHash) {
  await checkDirectory(directory);
  const result = await readPinnedManifest(directory, expectedHash);
  return {...result, bytes: validateManifest(result.manifest, version)};
}

export async function verifyFiles(directory, manifest, {installed = false} = {}) {
  const expected = new Set(['manifest.json', ...artifactFiles]);
  if (installed) expected.add('receipt.json');
  const files = await readdir(directory, {withFileTypes: true});
  if (files.length !== expected.size || !files.every(file => file.isFile() && expected.has(file.name))) {
    throw new Error('UNEXPECTED_LOCAL_RELEASE_FILES');
  }
  const db = manifest.files.find(file => file.path === 'search.sqlite');
  const bytes = await readBounded(path.join(directory, db.path), maxArtifactBytes);
  if (bytes.length !== db.bytes) throw new Error('FILE_SIZE_MISMATCH: ' + db.path);
  if (sha256(bytes) !== db.sha256) throw new Error('FILE_SHA256_MISMATCH: ' + db.path);
  validateSearchText(await readSearchText(directory, manifest), manifest);
}
