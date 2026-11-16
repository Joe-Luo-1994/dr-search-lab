import {lstat, mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  checkDirectory, ensureDirectory, expectOne, isSha256, replaceJson, sha256,
} from '../v1-e2-20261115/settings.mjs';

export {checkDirectory, ensureDirectory, expectOne, isSha256, replaceJson, sha256};

export const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const labRoot = path.resolve(scriptRoot, '../../.lab');
export const runtime = path.join(labRoot, 'v1-remote-content-20261115');
export const buildDir = path.join(runtime, 'next-build');
export const producerDir = path.join(runtime, 'producer');
export const artifactRoot = path.join(runtime, 'artifacts');
export const objectRoot = path.join(runtime, 'objects');
export const cachesRoot = path.join(runtime, 'caches');
export const cacheNames = ['main', 'negative', 'fresh'];
export const versions = ['v1', 'v2'];
export const variants = [...versions, 'wrong-v2'];
export const snapshotId = version => 'v1-remote-content-20261115-' + expectOne(version, versions);
export const cacheDirectory = name => path.join(cachesRoot, expectOne(name, cacheNames));
export const releaseDirectory = (name, version) => path.join(cacheDirectory(name), expectOne(version, versions));
export const artifactDirectory = variant => path.join(artifactRoot, expectOne(variant, variants));

export const maxManifestBytes = 256 * 1024;
export const maxArtifactBytes = 8 * 1024 * 1024;
export const maxObjectBytes = 1024 * 1024;

export async function ensureRuntime() {
  await checkDirectory(scriptRoot);
  await ensureDirectory(labRoot);
  await ensureDirectory(runtime);
}

export async function checkRuntime() {
  for (const directory of [scriptRoot, labRoot, runtime]) await checkDirectory(directory);
}

export async function readBounded(file, maxBytes, signal) {
  const info = await lstat(file);
  if (!info.isFile() || info.size > maxBytes) throw new Error('UNSAFE_REMOTE_CONTENT_FILE');
  const bytes = await readFile(file, {signal});
  if (bytes.length > maxBytes) throw new Error('REMOTE_CONTENT_FILE_TOO_LARGE');
  return bytes;
}
