import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// Fault injection uses a private copy, never the running demo's data.
await mkdir('.lab/test-runs', { recursive: true });
const isolated = await mkdtemp(path.resolve('.lab/test-runs/artifacts-'));
await cp(path.resolve('.lab/data'), isolated, { recursive: true });
process.env.LAB_DATA_DIR = isolated;
const { verifyArtifacts } = await import('../lib/artifacts.mjs');
const { control, newState } = await import('../lib/lab.mjs');
const manifestPath = path.join(isolated, 'manifest.json');
const originalManifest = await readFile(manifestPath, 'utf8');

test('D01: actual corrupt payload rejects publish and preserves v1', async () => {
  const file = path.join(isolated, 'v2.json'), bytes = await readFile(file);
  try {
    await writeFile(file, Buffer.concat([bytes, Buffer.from('corrupt')]));
    const state = newState();
    await assert.rejects(control(state, { action: 'publish', version: 'v2' }), /checksum/);
    assert.equal(state.version, 'v1'); await verifyArtifacts('v1');
  } finally { await writeFile(file, bytes); }
});
test('D01: actual missing artifact rejects publish', async () => {
  const file = path.join(isolated, 'v2-body.sqlite');
  await rename(file, file + '.held');
  try { await assert.rejects(verifyArtifacts('v2')); }
  finally { await rename(file + '.held', file); }
});
test('D01: manifest omitting a required file must not pass vacuously', async () => {
  const manifest = JSON.parse(originalManifest); delete manifest.files['v2-body.sqlite'];
  try { await writeFile(manifestPath, JSON.stringify(manifest)); await assert.rejects(verifyArtifacts('v2')); }
  finally { await writeFile(manifestPath, originalManifest); }
});
test('D01: empty manifest must not pass vacuously', async () => {
  try { await writeFile(manifestPath, JSON.stringify({ files: {} })); await assert.rejects(verifyArtifacts('v2')); }
  finally { await writeFile(manifestPath, originalManifest); }
});
test('D01: valid staged version remains publishable after injected failures', async () => {
  const state = newState(); await control(state, { action: 'publish', version: 'v2' }); assert.equal(state.version, 'v2');
});
