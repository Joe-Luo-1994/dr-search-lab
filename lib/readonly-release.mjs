// Synthetic reference contract. Filesystem bundles are not a MinIO implementation.
import { readFile, realpath, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export class ReleaseError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}
const fail = message => { throw new ReleaseError(message); };
const idOK = id => typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id);
const strings = values => Array.isArray(values) && values.every(idOK) && new Set(values).size === values.length;
export function releaseDocuments(pages, attachments) {
  return pages.map(p => ({ id: p.id, title: p.title, body: p.bodyText + (attachments ? `\n${p.attachmentText}` : ''), spaceId: p.spaceId, tagIds: [...p.tagIds].sort() }));
}
export function documentDigest(docs) {
  const sorted = [...docs].sort((a, b) => a.id.localeCompare(b.id)).map(d => ({ id: d.id, title: d.title, body: d.body, spaceId: d.spaceId, tagIds: [...d.tagIds].sort() }));
  return sha256(JSON.stringify(sorted));
}
export async function openRelease(directory, expectedManifestHash, { authorize, es }) {
  const base = await realpath(directory);
  async function file(relative) {
    const parts = relative.split('/');
    if (parts.some(x => !x || x === '.' || x === '..' || x.includes('\\'))) fail('Invalid artifact path');
    let target = base;
    for (const part of parts) {
      target = path.join(target, part);
      if ((await lstat(target)).isSymbolicLink()) fail('Symlink artifact refused');
    }
    if (!(await lstat(target)).isFile()) fail('Artifact is not a regular file');
    return readFile(target);
  }
  async function verified(relative, descriptor) {
    if (!descriptor || !/^[a-f0-9]{64}$/.test(descriptor.sha256) || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 0) fail('Missing artifact descriptor');
    const bytes = await file(relative);
    if (bytes.length !== descriptor.bytes || sha256(bytes) !== descriptor.sha256) fail(`Artifact mismatch: ${relative}`);
    return bytes;
  }
  const manifestBytes = await file('manifest.json');
  if (!/^[a-f0-9]{64}$/.test(expectedManifestHash) || sha256(manifestBytes) !== expectedManifestHash) fail('Untrusted or mismatched manifest');
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schema !== 1 || manifest.synthetic !== true || !['v1', 'v2'].includes(manifest.version)) fail('Unsupported release');
  const dataset = JSON.parse(await verified('pages.json', manifest.pages));
  if (dataset.version !== manifest.version || !Array.isArray(dataset.pages) || !dataset.pages.length) fail('Mixed or empty metadata');
  const pages = new Map(), references = new Set();
  for (const page of dataset.pages) {
    if (!idOK(page.id) || pages.has(page.id) || !idOK(page.spaceId) || page.version !== manifest.version ||
      !strings(page.tagIds) || !strings(page.mediaIds) || ['title', 'bodyText', 'attachmentText'].some(k => typeof page[k] !== 'string')) fail('Invalid, duplicate or mixed-version page');
    pages.set(page.id, page);
    for (const media of page.mediaIds) references.add(media);
  }
  if (!manifest.media || typeof manifest.media !== 'object' || Array.isArray(manifest.media) ||
    Object.keys(manifest.media).length !== references.size) fail('Media inventory mismatch');
  for (const media of references) {
    const descriptor = manifest.media[media];
    if (!descriptor || descriptor.filename !== `${media}.bin` || descriptor.mime !== 'application/octet-stream') fail('Media metadata missing or invalid');
    await verified(`media/${media}.bin`, descriptor);
  }
  // Before serving any operation, bind both query variants to complete sealed ES content.
  const indices = {};
  for (const attachments of [false, true]) {
    const variant = attachments ? 'attachments' : 'body', binding = manifest.es?.[variant];
    const expectedDocs = releaseDocuments(dataset.pages, attachments), digest = documentDigest(expectedDocs);
    if (!binding || !/^drlab-[a-z0-9-]+$/.test(binding.index) || binding.digest !== digest || binding.count !== pages.size) fail('Invalid ES binding');
    const observed = await es.inspect(binding.index);
    if (observed.version !== manifest.version || observed.attachments !== attachments || observed.digest !== digest ||
      !observed.writeBlocked || observed.documents.length !== pages.size || documentDigest(observed.documents) !== digest) fail('ES and package differ');
    indices[variant] = binding.index;
  }
  const knownSpaces = new Set([...pages.values()].map(p => p.spaceId));
  const knownTags = new Set([...pages.values()].flatMap(p => p.tagIds));
  async function allowed(user) {
    let result;
    try { result = await authorize(user); } catch { fail('ReBAC unavailable'); }
    if (!strings(result)) fail('ReBAC returned an invalid decision');
    return result;
  }
  function visible(id, spaces) {
    const page = pages.get(id);
    if (!page || !spaces.includes(page.spaceId)) throw new ReleaseError('Not found or forbidden', 404);
    return page;
  }
  return {
    version: manifest.version,
    manifestHash: expectedManifestHash,
    async search(user, raw = {}) {
      const { keyword = '', spaceId = '', tagIds = [], page = 1, pageSize = 10, includeAttachments = false } = raw;
      if (typeof keyword !== 'string' || keyword.length > 200 || (spaceId && !knownSpaces.has(spaceId)) || !strings(tagIds) ||
        tagIds.some(t => !knownTags.has(t)) || !Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || page * pageSize > 10000 || typeof includeAttachments !== 'boolean') throw new ReleaseError('Invalid query', 400);
      const spaces = (await allowed(user)).filter(s => !spaceId || s === spaceId);
      if (!spaces.length) return { version: manifest.version, hits: [], total: 0 };
      const result = await es.search(indices[includeAttachments ? 'attachments' : 'body'], { keyword, tagIds, page, pageSize, allowedSpaces: spaces });
      if (!Number.isSafeInteger(result.total) || result.total < result.hits.length) fail('Invalid ES result');
      const seen = new Set();
      const hits = result.hits.map(hit => {
        const p = pages.get(hit.id);
        if (!p || seen.has(hit.id) || !spaces.includes(p.spaceId) || !tagIds.every(t => p.tagIds.includes(t))) fail('Search/metadata inconsistency');
        seen.add(hit.id);
        return { id: p.id, title: p.title, spaceId: p.spaceId, tagIds: [...p.tagIds], score: hit.score, version: p.version };
      });
      return { version: manifest.version, hits, total: result.total };
    },
    async page(user, id) { return structuredClone(visible(id, await allowed(user))); },
    async download(user, pageId, mediaId) {
      const p = visible(pageId, await allowed(user));
      if (!p.mediaIds.includes(mediaId)) throw new ReleaseError('Media is not referenced by page', 403);
      const descriptor = manifest.media[mediaId];
      return { filename: descriptor.filename, mime: descriptor.mime, bytes: await verified(`media/${mediaId}.bin`, descriptor) };
    }
  };
}
