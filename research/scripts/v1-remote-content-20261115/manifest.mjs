import path from 'node:path';
import {maxArtifactBytes, maxManifestBytes, readBounded, sha256} from './settings.mjs';

export const searchTextFile = 'search-text.json';
export const searchTextFormat = 'e2-lexical-text-v1';
export const bodyMimeType = 'application/json; charset=utf-8';

export async function readPinnedManifest(directory, expectedHash, signal) {
  const raw = await readBounded(path.join(directory, 'manifest.json'), maxManifestBytes, signal);
  const manifestSha256 = sha256(raw);
  if (manifestSha256 !== expectedHash) throw new Error('MANIFEST_SHA256_MISMATCH');
  return {manifest: JSON.parse(raw), raw, manifestSha256};
}

export async function readSearchText(directory, manifest, signal) {
  const expected = manifest.files.find(file => file.path === searchTextFile);
  const bytes = await readBounded(path.join(directory, searchTextFile), maxArtifactBytes, signal);
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
    throw new Error('SEARCH_TEXT_HASH_MISMATCH');
  }
  return JSON.parse(bytes);
}
