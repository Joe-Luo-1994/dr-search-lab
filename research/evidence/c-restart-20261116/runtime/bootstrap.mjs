// Startup-only, single writer, private per-Pod cache. No local-active fallback,
// shared-PVC coordination, garbage collection, or remote polling is implemented.
import {createHash, randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat, mkdir, open, readFile, rename} from 'node:fs/promises';
import path from 'node:path';
import {config, remote, download} from './storage.mjs';

const APPROVED_KEY = 'control/approved.json';
const CURRENT_LIMIT = 16 * 1024, MANIFEST_LIMIT = 1024 * 1024;
const candidates = new WeakMap();
let preparing = false, committing = false;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const release = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
const key = value => typeof value === 'string' && value.length <= 1024 &&
  /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) && !value.includes('..') &&
  !value.endsWith('/') && value.split('/').every(part => part && part !== '.');
const fail = code => Object.assign(Error(code), {code});
const exactKeys = (value, names) => record(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const encode = value => Buffer.from(JSON.stringify(value) + '\n');
function parse(raw, label) {
  try {return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(raw));}
  catch {throw fail(label + '_JSON');}
}
function descriptor(value, maximum = Number.MAX_SAFE_INTEGER) {
  return record(value) && key(value.key) && Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= maximum && sha(value.sha256);
}
async function existing(filename) {
  try {return await lstat(filename);} catch (error) {if (error.code === 'ENOENT') return null;throw error;}
}
async function directory(filename) {
  const info = await existing(filename);
  if (info) {if (!info.isDirectory() || info.isSymbolicLink()) throw fail('UNSAFE_CACHE_DIRECTORY');}
  else await mkdir(filename, {mode: 0o700});
}
async function fsyncDirectory(filename) {
  // Linux experiment runtime; a failed directory fsync is not silently ignored.
  const handle = await open(filename, 'r');try {await handle.sync();} finally {await handle.close();}
}
async function durableNewFile(filename, bytes) {
  const handle = await open(filename, 'wx', 0o600);
  try {await handle.writeFile(bytes);await handle.sync();} finally {await handle.close();}
}
async function boundedFile(filename, limit) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > limit) throw fail('UNSAFE_CACHE_FILE');
  const raw = await readFile(filename);if (raw.length !== info.size || raw.length > limit) throw fail('CACHE_FILE_CHANGED');return raw;
}
async function boundedRemote(objectKey, limit, outerSignal, label) {
  const started = performance.now(), signal = AbortSignal.any([outerSignal, AbortSignal.timeout(10000)]);
  const response = await remote('GET', objectKey, {signal});
  if (response.status !== 200) {await response.body?.cancel();throw fail(label + '_HTTP_' + response.status);}
  const chunks = [];let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;if (bytes > limit) throw fail(label + '_TOO_LARGE');chunks.push(chunk);
  }
  if (!bytes) throw fail(label + '_EMPTY');
  const raw = Buffer.concat(chunks, bytes);
  return {raw, bytes, sha256: hash(raw), elapsedMs: performance.now() - started};
}
function sameIdentity(actual, expected) {
  return record(actual) && actual.schemaVersion === 1 && ['releaseId', 'manifestSha256', 'dbSha256', 'dbBytes', 'dbKey']
    .every(field => actual[field] === expected[field]);
}
async function hashDatabase(filename, expected, signal) {
  const started = performance.now(), before = await lstat(filename);
  if (!before.isFile() || before.isSymbolicLink() || before.size !== expected.bytes) throw fail('CACHE_DB_SIZE_OR_TYPE');
  let bytes = 0;const digest = createHash('sha256');
  for await (const chunk of createReadStream(filename, {signal})) {
    bytes += chunk.length;if (bytes > expected.bytes) throw fail('CACHE_DB_SIZE');digest.update(chunk);
  }
  const sha256 = digest.digest('hex'), after = await lstat(filename);
  if (bytes !== expected.bytes || sha256 !== expected.sha256) throw fail('CACHE_DB_HASH');
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw fail('CACHE_DB_CHANGED');
  return {bytes, sha256, elapsedMs: performance.now() - started, stat: after};
}

export async function prepareApproved({signal: externalSignal} = {}) {
  if (preparing || committing) throw fail('BOOTSTRAP_BUSY');preparing = true;
  const started = performance.now(), signal = AbortSignal.any([AbortSignal.timeout(150000), ...(externalSignal ? [externalSignal] : [])]);
  try {
    const c = await config();
    if (c.approvedKey !== APPROVED_KEY || !path.isAbsolute(c.cacheDir)) throw fail('BOOTSTRAP_CONFIG');
    // The authenticated remote current is trusted discovery input. Its SHA is
    // an audit identifier, not a signature or a replacement for publisher IAM.
    const approvedRead = await boundedRemote(APPROVED_KEY, CURRENT_LIMIT, signal, 'APPROVED');
    const approved = parse(approvedRead.raw, 'APPROVED');
    if (!exactKeys(approved, ['schemaVersion', 'releaseId', 'manifest']) || approved.schemaVersion !== 1 || !release(approved.releaseId) ||
        !exactKeys(approved.manifest, ['key', 'bytes', 'sha256']) || !descriptor(approved.manifest, MANIFEST_LIMIT) ||
        approved.manifest.key !== approved.releaseId + '/manifest.json') throw fail('APPROVED_SCHEMA');
    const manifestRead = await boundedRemote(approved.manifest.key, MANIFEST_LIMIT, signal, 'MANIFEST');
    if (manifestRead.bytes !== approved.manifest.bytes || manifestRead.sha256 !== approved.manifest.sha256) throw fail('MANIFEST_PIN_MISMATCH');
    const manifest = parse(manifestRead.raw, 'MANIFEST');
    if (!record(manifest) || manifest.schemaVersion !== 1 || manifest.snapshotId !== approved.releaseId ||
        !descriptor(manifest.db) || manifest.db.key !== approved.releaseId + '/search.sqlite' ||
        (manifest.db.file !== undefined && manifest.db.file !== 'search.sqlite') ||
        (manifest.db.mimeType !== undefined && manifest.db.mimeType !== 'application/vnd.sqlite3')) throw fail('MANIFEST_SCHEMA_OR_IDENTITY');
    const db = {key: manifest.db.key, bytes: manifest.db.bytes, sha256: manifest.db.sha256};
    const cacheDir = path.resolve(c.cacheDir), releasesDir = path.join(cacheDir, 'releases');
    await directory(cacheDir);await directory(releasesDir);
    const releaseDir = path.join(releasesDir, approved.releaseId), artifactDir = path.join(releaseDir, db.sha256);
    const dbPath = path.join(artifactDir, 'search.sqlite'), identityPath = path.join(releaseDir, 'identity.json');
    const expectedIdentity = {schemaVersion: 1, releaseId: approved.releaseId, manifestSha256: manifestRead.sha256,
      dbSha256: db.sha256, dbBytes: db.bytes, dbKey: db.key};
    let identity, source, cacheVerification = null, transfer = null, staging = null;
    const installed = await existing(releaseDir);
    if (installed) {
      if (!installed.isDirectory() || installed.isSymbolicLink()) throw fail('UNSAFE_RELEASE_DIRECTORY');
      identity = parse(await boundedFile(identityPath, CURRENT_LIMIT), 'CACHE_IDENTITY');
      if (!sameIdentity(identity, expectedIdentity)) throw fail('RELEASE_IDENTITY_CONFLICT');
      const artifactInfo = await lstat(artifactDir);
      if (!artifactInfo.isDirectory() || artifactInfo.isSymbolicLink()) throw fail('UNSAFE_ARTIFACT_DIRECTORY');
      const localManifest = await boundedFile(path.join(artifactDir, 'manifest.json'), MANIFEST_LIMIT);
      if (hash(localManifest) !== manifestRead.sha256) throw fail('CACHE_MANIFEST_HASH');
      cacheVerification = await hashDatabase(dbPath, db, signal);source = 'cache';
    } else {
      // The existing downloader owns streaming GET, byte/hash checks, file fsync
      // and .part -> target rename. Give it a never-reused staging target.
      staging = path.join(cacheDir, '.staging-' + randomUUID());await mkdir(staging, {mode: 0o700});
      const stagedArtifact = path.join(staging, db.sha256);await mkdir(stagedArtifact, {mode: 0o700});
      transfer = await download(db, path.join(stagedArtifact, 'search.sqlite'), 0, signal);
      await durableNewFile(path.join(stagedArtifact, 'manifest.json'), manifestRead.raw);
      identity = {...expectedIdentity, candidateInstalledAt: new Date().toISOString()};
      await durableNewFile(path.join(staging, 'identity.json'), encode(identity));
      await fsyncDirectory(stagedArtifact);await fsyncDirectory(staging);signal.throwIfAborted();
      if (await existing(releaseDir)) throw fail('RELEASE_APPEARED_DURING_INSTALL');
      // A whole immutable release (identity + content-addressed artifact) becomes
      // visible together. It is still only a candidate, not the active version.
      await rename(staging, releaseDir);await fsyncDirectory(releasesDir);source = 'download';
    }
    signal.throwIfAborted();
    const dbStat = await lstat(dbPath);
    if (!dbStat.isFile() || dbStat.isSymbolicLink() || dbStat.size !== db.bytes) throw fail('CANDIDATE_DB_STAT');
    const candidate = Object.freeze({version: approved.releaseId, releaseId: approved.releaseId, dbPath, source,
      approvedKey: APPROVED_KEY, approvedSha256: approvedRead.sha256, manifestKey: approved.manifest.key,
      manifestSha256: manifestRead.sha256, dbSha256: db.sha256, dbBytes: db.bytes,
      preparedAt: new Date().toISOString(), candidateInstalledAt: identity.candidateInstalledAt,
      metrics: {elapsedMs: performance.now() - started, approved: {bytes: approvedRead.bytes, elapsedMs: approvedRead.elapsedMs},
        manifest: {bytes: manifestRead.bytes, elapsedMs: manifestRead.elapsedMs}, transfer,
        cacheVerification: cacheVerification ? {bytes: cacheVerification.bytes, sha256: cacheVerification.sha256, elapsedMs: cacheVerification.elapsedMs} : null},
      staging, databaseValidation: 'Pool.start must verify SQLite snapshot identity and quick_check before commitActive'});
    candidates.set(candidate, {cacheDir, releaseDir, artifactDir, dbPath, dbStat, expectedIdentity, committed: null});
    return candidate;
  } finally {preparing = false;}
}

export async function commitActive(candidate) {
  const prepared = candidates.get(candidate);
  if (!prepared) throw fail('CANDIDATE_NOT_PREPARED');
  if (prepared.committed) return prepared.committed;
  if (preparing || committing) throw fail('BOOTSTRAP_BUSY');committing = true;
  try {
    // Call order is deliberately owned by service init:
    // prepareApproved -> successful Pool.start -> commitActive -> expose ready.
    // No second full DB hash/quick_check is hidden here under the private-cache,
    // single-writer assumption. Detect local file replacement before commit.
    const before = prepared.dbStat, current = await lstat(prepared.dbPath);
    if (!current.isFile() || current.isSymbolicLink() || current.dev !== before.dev || current.ino !== before.ino ||
        current.size !== before.size || current.mtimeMs !== before.mtimeMs) throw fail('CANDIDATE_CHANGED_BEFORE_COMMIT');
    const identity = parse(await boundedFile(path.join(prepared.releaseDir, 'identity.json'), CURRENT_LIMIT), 'CACHE_IDENTITY');
    if (!sameIdentity(identity, prepared.expectedIdentity)) throw fail('RELEASE_IDENTITY_CONFLICT');
    const manifest = await boundedFile(path.join(prepared.artifactDir, 'manifest.json'), MANIFEST_LIMIT);
    if (hash(manifest) !== candidate.manifestSha256) throw fail('CACHE_MANIFEST_HASH');
    const activePath = path.join(prepared.cacheDir, 'active.json'), old = await existing(activePath);
    if (old && (!old.isFile() || old.isSymbolicLink())) throw fail('UNSAFE_ACTIVE_FILE');
    const active = Object.freeze({schemaVersion: 1, releaseId: candidate.releaseId,
      manifestSha256: candidate.manifestSha256, dbSha256: candidate.dbSha256, dbBytes: candidate.dbBytes,
      approvedSha256: candidate.approvedSha256, installedAt: new Date().toISOString(),
      database: path.relative(prepared.cacheDir, prepared.dbPath).split(path.sep).join('/')});
    const temporary = path.join(prepared.cacheDir, '.active-' + randomUUID() + '.tmp');
    await durableNewFile(temporary, encode(active));await rename(temporary, activePath);await fsyncDirectory(prepared.cacheDir);
    prepared.committed = active;return active;
  } finally {committing = false;}
}
