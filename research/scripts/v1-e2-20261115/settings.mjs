import {createHash, randomUUID} from 'node:crypto';
import {lstat, mkdir, readFile, realpath, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const labRoot = path.resolve(scriptRoot, '../../.lab');
export const runtime = path.join(labRoot, 'v1-e2-20261115');
export const buildDir = path.join(runtime, 'next-build');
export const producerDir = path.join(runtime, 'producer');
export const artifactRoot = path.join(runtime, 'artifacts');
export const cachesRoot = path.join(runtime, 'caches');
export const sourceSites = ['fz1', 'fz2'];
export const cacheNames = ['main', 'fresh'];
export const versions = ['v1', 'v2'];
export const variants = [...versions, 'mixed-v2'];
export const snapshotId = version => 'v1-e2-20261115-' + version;
export const cacheDirectory = name => path.join(cachesRoot, expectOne(name, cacheNames));
export const releaseDirectory = (name, version) => path.join(cacheDirectory(name), expectOne(version, versions));
export const artifactDirectory = variant => path.join(artifactRoot, expectOne(variant, variants));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const isSha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

export function expectOne(value, allowed) {
  if (!allowed.includes(value)) throw new Error('EXPECTED_ONE_OF: ' + allowed.join(', '));
  return value;
}

export async function checkDirectory(directory) {
  if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== directory) {
    throw new Error('UNSAFE_E2_DIRECTORY: ' + directory);
  }
}

export async function ensureDirectory(directory) {
  try {
    await mkdir(directory, {mode: 0o700});
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await checkDirectory(directory);
}

export async function ensureRuntime() {
  await checkDirectory(scriptRoot);
  await ensureDirectory(labRoot);
  await ensureDirectory(runtime);
}

export async function checkRuntime() {
  for (const directory of [scriptRoot, labRoot, runtime]) await checkDirectory(directory);
}

export async function readBounded(file, maxBytes) {
  const info = await lstat(file);
  if (!info.isFile() || info.size > maxBytes) throw new Error('UNSAFE_E2_FILE');
  const bytes = await readFile(file);
  if (bytes.length > maxBytes) throw new Error('E2_FILE_TOO_LARGE');
  return bytes;
}

export async function replaceJson(file, value) {
  const temporary = path.join(path.dirname(file), '.' + path.basename(file) + '-' + randomUUID());
  await writeFile(temporary, JSON.stringify(value) + '\n', {flag: 'wx'});
  await rename(temporary, file);
}
