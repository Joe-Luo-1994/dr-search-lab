import http from 'node:http';
import path from 'node:path';
import {lstat, readFile} from 'node:fs/promises';
import next from 'next';
import {
  buildDir, esIndex, existingDirectory, loopbackOrigin, port, readManifest, runtime, scriptRoot,
} from './settings.mjs';

const [mode, flag, origin, ...extra] = process.argv.slice(2);
const faultEs = mode === 'b' && flag === '--es-url' && origin === 'http://127.0.0.1:19390' && !extra.length;
if (!faultEs && (!(mode === 'b' || mode === 'c') || process.argv.length !== 3)) {
  throw new Error('Usage: node serve.mjs b|c (B fault only: b --es-url http://127.0.0.1:19390)');
}
const {manifest, hash} = await readManifest();
await existingDirectory(buildDir);
if (!(await lstat(path.join(buildDir, 'BUILD_ID'))).isFile()) throw new Error('E1_BUILD_REQUIRED');

process.env.NEXT_TELEMETRY_DISABLED = '1';
process.env.V1_E1_SCRIPT_ROOT = scriptRoot;
process.env.V1_E1_RUNTIME = runtime;
process.env.V1_E1_PROVIDER = mode;
process.env.V1_E1_MANIFEST_SHA256 = hash;
let esEndpoint;
if (mode === 'b') {
  const file = path.join(runtime, 'es.json');
  if (!(await lstat(file)).isFile()) throw new Error('UNSAFE_E1_ES_DESCRIPTOR');
  const reference = JSON.parse(await readFile(file, 'utf8'));
  if (reference.index !== esIndex || reference.snapshotId !== manifest.snapshotId ||
      reference.sourceSha256 !== manifest.sourceSha256) {
    throw new Error('E1_ES_SNAPSHOT_MISMATCH');
  }
  esEndpoint = loopbackOrigin(faultEs ? origin : reference.origin) + '/' + esIndex;
  process.env.V1_E1_ES_ENDPOINT = esEndpoint;
}

const hostname = '127.0.0.1';
const app = next({dev: false, dir: scriptRoot, hostname, port});
await app.prepare();
const server = http.createServer(app.getRequestHandler());
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, hostname, resolve);
});
console.log(JSON.stringify({
  event: 'e1_ready', mode, pid: process.pid, url: 'http://127.0.0.1:' + port,
  node: process.version, snapshotId: manifest.snapshotId, sourceSha256: manifest.sourceSha256,
  esEndpoint, faultEs,
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
