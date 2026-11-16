import {createHash} from 'node:crypto';
import {lstat, mkdir, readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
export const labRoot = path.resolve(scriptRoot, '../../.lab');
export const runtimeRoot = path.join(labRoot, 'v1-e1-20261115');
export const runtime = path.join(runtimeRoot, 'prepared');
export const buildDir = path.join(runtimeRoot, 'next-build');
export const snapshotDir = path.join(runtime, 'snapshot');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function existingDirectory(directory) {
  const info = await lstat(directory);
  if (!info.isDirectory() || await realpath(directory) !== directory) {
    throw new Error('UNSAFE_E1_DIRECTORY: ' + directory);
  }
}

async function createDirectory(directory) {
  try {
    await mkdir(directory, {mode: 0o700});
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  await existingDirectory(directory);
}

export async function createRuntimeRoot() {
  await existingDirectory(scriptRoot);
  await createDirectory(labRoot);
  await createDirectory(runtimeRoot);
}

export async function readManifest() {
  await existingDirectory(scriptRoot);
  await existingDirectory(labRoot);
  await existingDirectory(runtimeRoot);
  await existingDirectory(runtime);
  await existingDirectory(snapshotDir);
  const manifestPath = path.join(snapshotDir, 'manifest.json');
  if (!(await lstat(manifestPath)).isFile()) {
    throw new Error('UNSAFE_E1_MANIFEST');
  }
  const raw = await readFile(manifestPath);
  return {manifest: JSON.parse(raw), hash: sha256(raw)};
}

export const esIndex = 'drlab-v1-e1-20261115-r1';
export const port = 3157;

export function loopbackOrigin(value) {
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/u.test(value)) {
    throw new Error('EXPECTED_EXPLICIT_IPV4_LOOPBACK_ORIGIN');
  }
  const url = new URL(value);
  if (!url.port && !value.endsWith(':80')) throw new Error('EXPECTED_ES_PORT');
  return url.origin;
}
