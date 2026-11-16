import {spawn} from 'node:child_process';
import {mkdir, readdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {buildDir, ensureRuntime, readBounded, runtime, scriptRoot, sha256} from './settings.mjs';

const require = createRequire(import.meta.url);
const next = require.resolve('next/dist/bin/next');
await ensureRuntime();
await mkdir(buildDir);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (entry.isFile()) files.push(child);
    else throw new Error('REMOTE_CONTENT_BUILD_UNSAFE_INPUT: ' + child);
  }
  return files;
}

async function hashes(files) {
  const result = {};
  for (const filename of files.sort()) {
    const portablePath = path.relative(scriptRoot, filename).replaceAll('\\', '/');
    result[portablePath] = sha256(await readBounded(filename, 64 * 1024 * 1024));
  }
  return result;
}

async function inputs() {
  const modules = ['next', 'react', 'react-dom'].map(name => require.resolve(name + '/package.json'));
  const local = [
    'api.mjs', 'build.mjs', 'bundle.mjs', 'manifest.mjs', 'next.config.mjs', 'prepare.mjs',
    's3.mjs', 'serve.mjs', 'settings.mjs', 'sqlite-search.mjs',
  ].map(name => path.join(scriptRoot, name));
  const e1 = [
    'app/style.css', 'pdf.mjs', 'reference/extract-lexical.mjs',
    'reference/normalize-query.mjs', 'search.mjs',
  ].map(name => path.resolve(scriptRoot, '../v1-e1-20261115', name));
  const e2 = ['bundle.mjs', 'settings.mjs'].map(name => path.resolve(scriptRoot, '../v1-e2-20261115', name));
  return hashes([
    ...modules, ...local, ...e1, ...e2, ...await walk(path.join(scriptRoot, 'app')),
  ]);
}

const before = await inputs();
const began = new Date().toISOString();
await writeFile(path.join(runtime, 'build-attempt.json'), JSON.stringify({
  began, node: process.version, inputs: before,
}, null, 2), {flag: 'wx'});
const child = spawn(process.execPath, [next, 'build', '--webpack'], {
  cwd: scriptRoot,
  stdio: 'inherit',
  windowsHide: true,
  env: {...process.env, NEXT_TELEMETRY_DISABLED: '1'},
});
let timedOut = false;
const watchdog = setTimeout(() => {
  timedOut = true;
  console.error('REMOTE_CONTENT_BUILD_WATCHDOG_300S');
  if (process.platform === 'win32' && child.pid) {
    const terminate = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true, stdio: 'inherit',
    });
    terminate.once('error', () => child.kill('SIGKILL'));
  } else {
    child.kill('SIGKILL');
  }
}, 300_000);
try {
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  process.exitCode = timedOut ? 124 : status;
} finally {
  clearTimeout(watchdog);
}

if (process.exitCode === 0) {
  const after = await inputs();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('REMOTE_CONTENT_BUILD_INPUT_CHANGED');
  const outputs = await hashes([
    path.join(buildDir, 'BUILD_ID'), ...await walk(path.join(buildDir, 'server')),
    ...await walk(path.join(buildDir, 'static')),
  ]);
  await writeFile(path.join(runtime, 'build-receipt.json'), JSON.stringify({
    began, ended: new Date().toISOString(), node: process.version, inputs: before, outputs,
  }, null, 2), {flag: 'wx'});
}
