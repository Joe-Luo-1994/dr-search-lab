import http from 'node:http';
import {lstat} from 'node:fs/promises';
import path from 'node:path';
import next from 'next';
import {readManifest, verifyFiles, verifySqlite} from './bundle.mjs';
import {config} from './s3.mjs';
import {
  buildDir, cacheDirectory, cachesRoot, checkDirectory, checkRuntime, isSha256, readBounded,
  releaseDirectory, runtime, scriptRoot, snapshotId,
} from './settings.mjs';

const [version, portArg, cache, ...extra] = process.argv.slice(2);
const validTarget = [
  'v1 3162 main', 'v2 3163 main', 'v2 3165 negative', 'v2 3166 fresh',
].includes([version, portArg, cache].join(' '));
if (!validTarget || extra.length) {
  throw new Error('Usage: node serve.mjs v1 3162 main | v2 3163 main | v2 3165 negative | v2 3166 fresh');
}
const port = Number(portArg);
const directory = releaseDirectory(cache, version);
await checkRuntime();
await checkDirectory(cachesRoot);
await checkDirectory(cacheDirectory(cache));
await checkDirectory(directory);
const receipt = JSON.parse(await readBounded(path.join(directory, 'receipt.json'), 4096));
if (receipt.version !== version || receipt.snapshotId !== snapshotId(version) ||
    !isSha256(receipt.manifestSha256) || !Number.isFinite(Date.parse(receipt.installedAt))) {
  throw new Error('INVALID_INSTALL_RECEIPT');
}
const {manifest} = await readManifest(directory, version, receipt.manifestSha256);
await verifyFiles(directory, manifest, {installed: true});
verifySqlite(directory, manifest);
await config();
await checkDirectory(buildDir);
if (!(await lstat(path.join(buildDir, 'BUILD_ID'))).isFile()) throw new Error('REMOTE_CONTENT_BUILD_REQUIRED');

process.env.NEXT_TELEMETRY_DISABLED = '1';
// Reuse the frozen E1 SQLite process launcher with this reader's own inputs.
process.env.V1_E1_SCRIPT_ROOT = scriptRoot;
process.env.V1_E1_PROVIDER = 'c';
process.env.REMOTE_CONTENT_RUNTIME = runtime;
process.env.REMOTE_CONTENT_CACHE_DIR = cacheDirectory(cache);
process.env.REMOTE_CONTENT_RELEASE_DIR = directory;
process.env.REMOTE_CONTENT_MANIFEST_SHA256 = receipt.manifestSha256;
process.env.REMOTE_CONTENT_RELEASE_INSTALLED_AT = receipt.installedAt;

const hostname = '127.0.0.1';
const app = next({dev: false, dir: scriptRoot, hostname, port});
await app.prepare();
const server = http.createServer(app.getRequestHandler());
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, hostname, resolve);
});
console.log(JSON.stringify({
  event: 'remote_content_ready', cache, pid: process.pid, url: 'http://127.0.0.1:' + port,
  snapshotId: manifest.snapshotId, sourceSha256: manifest.sourceSha256, manifestSha256: receipt.manifestSha256,
  installedAt: receipt.installedAt, directory,
}));

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  const closed = new Promise(resolve => server.close(resolve));
  server.closeAllConnections();
  await closed;
  await app.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
