import {copyFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {
  fileDescriptor, projectedPages, validateSource, writeSqlite,
} from '../v1-e2-20261115/bundle.mjs';
import {syntheticPdf} from '../v1-e1-20261115/pdf.mjs';
import {readManifest, verifyFiles, verifySqlite} from './bundle.mjs';
import {bodyMimeType, searchTextFile, searchTextFormat} from './manifest.mjs';
import {
  artifactDirectory, artifactRoot, checkDirectory, ensureRuntime, maxManifestBytes, maxObjectBytes, objectRoot,
  producerDir, readBounded, runtime, sha256, snapshotId, versions,
} from './settings.mjs';

const sourceRoot = path.resolve(runtime, '../v1-e2-20261115/producer');
const inputs = {
  v1: {site: 'fz1', sha256: '13bbdd13ec09090fc8f18168084e90367aeedd68b997bade6f0a519baadc84a2'},
  v2: {site: 'fz2', sha256: 'e1ceee4695c81b0741915f5f29c17a83d874729682fab85ea9d587fea7788d51'},
};
const encode = value => Buffer.from(JSON.stringify(value) + '\n', 'utf8');
const objects = [];

async function stageObject(snapshot, objectPath, suffix, mimeType, payload) {
  if (!payload.length || payload.length > maxObjectBytes) throw new Error('REMOTE_OBJECT_SIZE_OUT_OF_RANGE');
  const hash = sha256(payload);
  const key = snapshot + '/' + objectPath + '/' + hash + suffix;
  const descriptor = {key, bytes: payload.length, sha256: hash, mimeType};
  const target = path.join(objectRoot, key);
  await mkdir(path.dirname(target), {recursive: true});
  await writeFile(target, payload, {flag: 'wx'});
  objects.push(descriptor);
  return descriptor;
}

async function writeManifest(directory, manifest, variant, version) {
  const raw = encode(manifest);
  const manifestSha256 = sha256(raw);
  await writeFile(path.join(directory, 'manifest.json'), raw, {flag: 'wx'});
  await readManifest(directory, version, manifestSha256);
  await verifyFiles(directory, manifest);
  verifySqlite(directory, manifest);
  return {
    variant, version, manifestSha256, manifestBytes: raw.length,
    files: [{path: 'manifest.json', bytes: raw.length, sha256: manifestSha256}, ...manifest.files],
  };
}

async function stageRelease(version, source, sourceSha256) {
  const directory = artifactDirectory(version);
  await mkdir(directory);
  const pages = projectedPages(source);
  const id = source.snapshotId;
  const searchText = {
    format: searchTextFormat, snapshotId: id,
    pages: pages.map(({pageId, paragraphs}) => ({pageId, paragraphs})),
    media: source.media.map(({mediaId, extractedText}) => ({mediaId, extractedText})),
  };
  writeSqlite(directory, {...source, pages, sourceSha256});
  await writeFile(path.join(directory, searchTextFile), encode(searchText), {flag: 'wx'});

  const pageMetadata = [];
  for (const {pageId, spaceId, title, tagIds, mediaIds, body} of pages) {
    const payload = encode({schemaVersion: 1, snapshotId: id, pageId, body});
    const bodyObject = await stageObject(id, 'pages/' + pageId, '.json', bodyMimeType, payload);
    pageMetadata.push({pageId, spaceId, title, tagIds, mediaIds, bodyObject});
  }

  const media = [];
  for (const file of source.media) {
    const pdf = syntheticPdf(file.extractedText);
    if (pdf.length !== file.bytes || sha256(pdf) !== file.sha256) throw new Error('SOURCE_PDF_HASH_MISMATCH');
    const object = await stageObject(id, 'media/' + file.mediaId, '.pdf', file.mimeType, pdf);
    media.push({mediaId: file.mediaId, fileName: file.fileName, ...object});
  }

  const files = await Promise.all(['search.sqlite', searchTextFile].map(file => fileDescriptor(directory, file)));
  const manifest = {
    schemaVersion: 1, searchTextFormat, snapshotId: id, snapshotCapturedAt: source.snapshotCapturedAt, sourceSha256,
    spaces: source.spaces, tags: source.tags, pages: pageMetadata, media, files,
  };
  return {manifest, publication: await writeManifest(directory, manifest, version, version)};
}

async function stageWrongCandidate(v2) {
  const manifest = structuredClone(v2);
  const target = manifest.pages.find(page => page.pageId === 'a-pdf').bodyObject;
  const wrongObject = manifest.pages.find(page => page.pageId === 'a-pdf-near').bodyObject;
  if (wrongObject.bytes !== target.bytes || wrongObject.sha256 === target.sha256) {
    throw new Error('WRONG_CANDIDATE_MUST_TEST_EQUAL_LENGTH_SHA_MISMATCH');
  }
  target.key = wrongObject.key;
  const directory = artifactDirectory('wrong-v2');
  await mkdir(directory);
  for (const file of manifest.files) {
    await copyFile(path.join(artifactDirectory('v2'), file.path), path.join(directory, file.path));
  }
  return writeManifest(directory, manifest, 'wrong-v2', 'v2');
}

const sources = new Map();
await checkDirectory(sourceRoot);
for (const version of versions) {
  const input = inputs[version];
  const directory = path.join(sourceRoot, input.site);
  await checkDirectory(directory);
  const raw = await readBounded(path.join(directory, version + '.json'), maxManifestBytes);
  if (sha256(raw) !== input.sha256) throw new Error('E2_SOURCE_SHA256_MISMATCH: ' + version);
  const source = JSON.parse(raw);
  validateSource(source, version);
  source.snapshotId = snapshotId(version);
  const copy = Buffer.from(JSON.stringify(source, null, 2) + '\n', 'utf8');
  sources.set(version, {source, copy, sourceSha256: sha256(copy)});
}

await ensureRuntime();
for (const directory of [producerDir, artifactRoot, objectRoot]) await mkdir(directory);
const releases = [];
for (const [version, {source, copy, sourceSha256}] of sources) {
  await writeFile(path.join(producerDir, version + '.json'), copy, {flag: 'wx'});
  const {manifest, publication} = await stageRelease(version, source, sourceSha256);
  releases.push(publication);
  if (version === 'v2') releases.push(await stageWrongCandidate(manifest));
}

await writeFile(path.join(runtime, 'role-profile.txt'), 'baseline\n', {flag: 'wx'});
await writeFile(path.join(runtime, 'publication-input.json'), encode({releases, objects}), {flag: 'wx'});
console.log(JSON.stringify({
  event: 'remote_content_prepared', releases, objectCount: objects.length,
  objectBytes: objects.reduce((total, file) => total + file.bytes, 0),
}));
