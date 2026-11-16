import {randomUUID} from 'node:crypto';
import {lstat, mkdir, open, rename, unlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {readManifest, verifyFiles, verifySqlite} from './bundle.mjs';
import {
  artifactDirectory, artifactRoot, cacheDirectory, cachesRoot, checkDirectory, checkRuntime, ensureDirectory,
  expectOne, isSha256, readBounded, releaseDirectory, replaceJson, snapshotId, variants,
} from './settings.mjs';

const [variant, cache, expectedHash, ...extra] = process.argv.slice(2);
expectOne(variant, variants);
if (!isSha256(expectedHash) || extra.length) {
  throw new Error('Usage: node install.mjs v1|v2|mixed-v2 main|fresh EXPECTED_MANIFEST_SHA256');
}
const version = variant === 'mixed-v2' ? 'v2' : variant;
const cachePath = cacheDirectory(cache);
const destination = releaseDirectory(cache, version);
const source = artifactDirectory(variant);
await checkRuntime();
await ensureDirectory(cachesRoot);
await ensureDirectory(cachePath);
await checkDirectory(artifactRoot);
const lockPath = path.join(cachePath, 'install.lock');
const lock = await open(lockPath, 'wx');
const attemptPath = path.join(cachePath, 'last-attempt.json');
const attempt = {variant, snapshotId: snapshotId(version), startedAt: new Date().toISOString()};
const began = performance.now();
let staging;

try {
  await replaceJson(attemptPath, {...attempt, state: 'installing'});
  try {
    await lstat(destination);
    throw new Error('RELEASE_ALREADY_INSTALLED');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await checkDirectory(path.join(source, 'media'));
  const {manifest, raw, manifestSha256, bytes} = await readManifest(source, version, expectedHash);
  staging = path.join(cachePath, '.staging-' + randomUUID());
  await mkdir(staging);
  await mkdir(path.join(staging, 'media'));
  for (const file of manifest.files) {
    const data = await readBounded(path.join(source, file.path), file.bytes);
    await writeFile(path.join(staging, file.path), data, {flag: 'wx'});
  }
  await verifyFiles(staging, manifest);
  console.log(JSON.stringify({
    event: 'e2_staged_hashes_verified', variant, snapshotId: manifest.snapshotId, bytes, manifestSha256,
  }));
  verifySqlite(staging, manifest);
  await writeFile(path.join(staging, 'manifest.json'), raw, {flag: 'wx'});
  const receipt = {
    version, snapshotId: manifest.snapshotId, manifestSha256, installedAt: new Date().toISOString(),
  };
  await writeFile(path.join(staging, 'receipt.json'), JSON.stringify(receipt) + '\n', {flag: 'wx'});
  await rename(staging, destination);
  await replaceJson(path.join(cachePath, 'last-success.json'), receipt);
  await replaceJson(attemptPath, {...attempt, state: 'success', finishedAt: receipt.installedAt});
  console.log(JSON.stringify({
    event: 'e2_install_ready', cache, ...receipt, bytes, elapsedMs: performance.now() - began, destination,
  }));
} catch (error) {
  const code = error.code ?? error.message.split(':')[0];
  await replaceJson(attemptPath, {...attempt, state: 'failed', finishedAt: new Date().toISOString(), code});
  console.error(JSON.stringify({event: 'e2_install_failed', cache, variant, code, staging, elapsedMs: performance.now() - began}));
  process.exitCode = 1;
} finally {
  await lock.close();
  await unlink(lockPath);
}
