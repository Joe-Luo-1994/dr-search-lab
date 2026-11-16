import {createHash} from 'node:crypto';
import {lstat, readFile} from 'node:fs/promises';
import path from 'node:path';
import {queryProvider} from '../v1-e1-20261115/search.mjs';

const jsonHeaders = {'cache-control': 'no-store'};
const roleSpaces = new Map([
  ['a', ['space-a']],
  ['b', ['space-b']],
  ['all', ['space-a', 'space-b']],
  ['none', []],
]);

function failure(code, status = 503, cause) {
  return Object.assign(new Error(code, {cause}), {e1Code: code, status});
}

function unavailable(code, error) {
  return failure(code, 503, error);
}

function json(data) {
  return Response.json(data, {headers: jsonHeaders});
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function authorize(request, signal) {
  const identity = request.headers.get('x-e1-identity');
  if (!roleSpaces.has(identity)) throw failure('AUTHORIZATION_UNKNOWN');
  try {
    const rolePath = path.join(process.env.E2_RUNTIME, 'role-profile.txt');
    const state = await lstat(rolePath);
    if (!state.isFile() || state.size > 64) throw new Error('E1_UNSAFE_ROLE_PROFILE');
    const profile = (await readFile(rolePath, {encoding: 'utf8', signal})).trim();
    if (profile !== 'baseline' && profile !== 'revoked-b') throw new Error('E1_UNKNOWN_ROLE_PROFILE');
    return {
      spaces: profile === 'revoked-b' && identity === 'b' ? [] : roleSpaces.get(identity),
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw unavailable('AUTHORIZATION_UNKNOWN', error);
  }
}

async function loadSnapshot(signal) {
  try {
    const raw = await readFile(path.join(process.env.E2_RELEASE_DIR, 'manifest.json'), {signal});
    if (hash(raw) !== process.env.E2_MANIFEST_SHA256) {
      throw new Error('E1_MANIFEST_HASH_MISMATCH');
    }
    const manifest = JSON.parse(raw);
    return {
      manifest,
      pages: new Map(manifest.pages.map(page => [page.pageId, page])),
      media: new Map(manifest.media.map(file => [file.mediaId, file])),
    };
  } catch (error) {
    throw unavailable('SNAPSHOT_UNAVAILABLE', error);
  }
}

async function handle(request, run) {
  // Reserve a margin inside the five-second client-side research deadline.
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(4_500)]);
  try {
    const auth = await authorize(request, signal);
    const snapshot = await loadSnapshot(signal);
    const metadata = {
      snapshotId: snapshot.manifest.snapshotId,
      snapshotCapturedAt: snapshot.manifest.snapshotCapturedAt,
      authorizationCheckedAt: auth.checkedAt,
    };
    return await run({signal, auth, snapshot, metadata});
  } catch (error) {
    const code = error.e1Code ?? 'SNAPSHOT_UNAVAILABLE';
    if (error.status === 503 || !error.status) {
      // Server side only. Keep response bodies free of local paths or provider details.
      console.error(JSON.stringify({event: 'e2_api_error', code, detail: error.cause?.code ?? error.cause?.message ?? error.message}));
    }
    return Response.json({error: {code}}, {status: error.status ?? 503, headers: jsonHeaders});
  }
}

function searchInputs(url, snapshot, visibleSpaces) {
  const params = new URL(url).searchParams;
  const query = params.get('q')?.trim();
  const spaceId = params.get('spaceId');
  const tags = [...new Set(params.getAll('tagId'))];
  const {spaces: sourceSpaces, tags: sourceTags} = snapshot.manifest;
  if ([...params.keys()].some(key => !['q', 'spaceId', 'tagId'].includes(key)) ||
      params.getAll('q').length !== 1 || params.getAll('spaceId').length > 1 ||
      !query || Array.from(query).length > 120 || !/[\p{L}\p{N}]/u.test(query) ||
      (spaceId !== null && !sourceSpaces.some(space => space.spaceId === spaceId)) ||
      tags.some(tag => !sourceTags.some(entry => entry.tagId === tag))) {
    throw failure('INVALID_REQUEST', 400);
  }
  return {
    q: query,
    spaces: visibleSpaces.filter(visible => spaceId === null || visible === spaceId),
    tags,
  };
}

function snippet(page, media, query) {
  const terms = query.toLowerCase().split(/\s+/u);
  const passages = page.paragraphs.concat(page.mediaIds.flatMap(id => media.get(id).extractedText.split('\n')));
  const match = passages.find(text => terms.some(term => text.toLowerCase().includes(term)));
  return Array.from(match ?? passages[0]).slice(0, 160).join('');
}

function pageMetadata(page) {
  const {pageId, spaceId, title, tagIds} = page;
  return {pageId, spaceId, title, tagIds};
}

function pagePath(pageId) {
  return '/api/pages/' + encodeURIComponent(pageId);
}

function versioned(url, snapshotId) {
  return url + '?version=' + encodeURIComponent(snapshotId);
}

function requireVersion(request, metadata) {
  const versions = new URL(request.url).searchParams.getAll('version');
  if (versions.length !== 1 || !versions[0]) throw failure('VERSION_REQUIRED', 400);
  if (versions[0] !== metadata.snapshotId) throw failure('VERSION_MISMATCH', 409);
}

export function search(request) {
  return handle(request, async ({signal, auth, snapshot, metadata}) => {
    const input = searchInputs(request.url, snapshot, auth.spaces);
    if (!input.spaces.length) return json({...metadata, total: 0, hits: []});
    try {
      const {total, pageIds} = await queryProvider({
        ...input, snapshotId: metadata.snapshotId, sourceSha256: snapshot.manifest.sourceSha256,
      }, signal);
      if (!Number.isSafeInteger(total) || total < 0 || total > snapshot.pages.size ||
          pageIds.length !== Math.min(total, 10) || new Set(pageIds).size !== pageIds.length) {
        throw new Error('E1_PROVIDER_RESULT_SHAPE');
      }
      const hits = pageIds.map(id => {
        const page = snapshot.pages.get(id);
        if (!page || !input.spaces.includes(page.spaceId) ||
            !input.tags.every(tag => page.tagIds.includes(tag))) {
          throw new Error('E1_PROVIDER_SCOPE_MISMATCH');
        }
        return {
          ...pageMetadata(page), snippet: snippet(page, snapshot.media, input.q),
          url: versioned(pagePath(id), metadata.snapshotId),
        };
      });
      return json({...metadata, total, hits});
    } catch (error) {
      throw unavailable('SEARCH_UNAVAILABLE', error);
    }
  });
}

function visiblePage(context, id) {
  const page = context.snapshot.pages.get(id);
  if (!page || !context.auth.spaces.includes(page.spaceId)) throw failure('NOT_FOUND', 404);
  return page;
}

export function readPage(request, pageId) {
  return handle(request, context => {
    requireVersion(request, context.metadata);
    const page = visiblePage(context, pageId);
    const mediaUrl = versioned(pagePath(pageId) + '/media', context.metadata.snapshotId);
    return json({...context.metadata, page: {...pageMetadata(page), body: page.body, mediaUrl}});
  });
}

export function listMedia(request, pageId) {
  return handle(request, context => {
    requireVersion(request, context.metadata);
    const page = visiblePage(context, pageId);
    const media = page.mediaIds.map(id => {
      const {mediaId, fileName, mimeType, sha256, bytes} = context.snapshot.media.get(id);
      const url = versioned(pagePath(pageId) + '/media/' + encodeURIComponent(mediaId), context.metadata.snapshotId);
      return {mediaId, fileName, mimeType, sha256, bytes, url};
    });
    return json({...context.metadata, pageId, media});
  });
}

export function downloadMedia(request, pageId, mediaId) {
  return handle(request, async context => {
    requireVersion(request, context.metadata);
    const page = visiblePage(context, pageId);
    if (!page.mediaIds.includes(mediaId)) throw failure('NOT_FOUND', 404);
    try {
      const file = context.snapshot.media.get(mediaId);
      const filePath = path.join(process.env.E2_RELEASE_DIR, 'media', file.mediaId + '.pdf');
      const state = await lstat(filePath);
      if (!state.isFile() || state.size !== file.bytes) throw new Error('E1_MEDIA_SIZE_MISMATCH');
      const bytes = await readFile(filePath, {signal: context.signal});
      if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error('E1_MEDIA_HASH_MISMATCH');
      return new Response(new Uint8Array(bytes), {headers: {
        ...jsonHeaders,
        'content-type': file.mimeType,
        'content-length': String(bytes.length),
        'content-disposition': 'inline; filename="' + file.fileName + '"',
        'x-e2-snapshot-id': context.metadata.snapshotId,
        'x-content-type-options': 'nosniff',
      }});
    } catch (error) {
      throw unavailable('MEDIA_UNAVAILABLE', error);
    }
  });
}

async function installationRecord(name, signal) {
  try {
    const file = path.join(process.env.E2_CACHE_DIR, name + '.json');
    const info = await lstat(file);
    if (!info.isFile() || info.size > 4096) throw new Error('INVALID_INSTALLATION_RECORD');
    return JSON.parse(await readFile(file, {encoding: 'utf8', signal}));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// This status endpoint exposes only time/version and installer state for the synthetic lab.
export async function readStatus(request) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(4_500)]);
  try {
    const {manifest} = await loadSnapshot(signal);
    const [latestAttempt, lastSuccessfulInstallation] = await Promise.all([
      installationRecord('last-attempt', signal), installationRecord('last-success', signal),
    ]);
    return json({
      snapshotId: manifest.snapshotId, snapshotCapturedAt: manifest.snapshotCapturedAt,
      installedAt: process.env.E2_RELEASE_INSTALLED_AT, latestAttempt, lastSuccessfulInstallation,
    });
  } catch {
    return Response.json({error: {code: 'STATUS_UNAVAILABLE'}}, {status: 503, headers: jsonHeaders});
  }
}
