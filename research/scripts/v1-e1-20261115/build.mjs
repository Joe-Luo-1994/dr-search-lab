import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
import {buildDir, createRuntimeRoot, scriptRoot, runtimeRoot} from './settings.mjs';

const require = createRequire(import.meta.url);
const next = require.resolve('next/dist/bin/next');
await createRuntimeRoot();
await mkdir(buildDir);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function walk(dir){const found=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('BUILD_SYMLINK');if(e.isDirectory())found.push(...await walk(p));else found.push(p);}return found;}
const inputPaths=[...await walk(path.join(scriptRoot,'app')),...await walk(path.join(scriptRoot,'reference')),...['api.mjs','search.mjs','sqlite-search.mjs','settings.mjs','next.config.mjs','build.mjs'].map(x=>path.join(scriptRoot,x)),require.resolve('next/package.json'),require.resolve('react/package.json')];
async function hashes(paths){const result={};for(const p of paths)result[path.relative(scriptRoot,p).replaceAll('\\','/')]=hash(await readFile(p));return result;}
const before=await hashes(inputPaths),began=new Date().toISOString();
await writeFile(path.join(runtimeRoot,'build-attempt.json'),JSON.stringify({began,node:process.version,inputs:before},null,2),{flag:'wx'});
const child = spawn(process.execPath, [next, 'build', '--webpack'], {
  cwd: scriptRoot,
  stdio: 'inherit',
  windowsHide: true,
  env: {...process.env, NEXT_TELEMETRY_DISABLED: '1'},
});
let timedOut = false;
const watchdog = setTimeout(() => {
  timedOut = true;
  console.error('E1_BUILD_WATCHDOG_300S');
  if (process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true, stdio: 'inherit'});
  else child.kill('SIGKILL');
}, 300000);
const status = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', code => resolve(code ?? 1));
});
clearTimeout(watchdog);
process.exitCode = timedOut ? 124 : status;
if(process.exitCode===0){
 const after=await hashes(inputPaths);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('BUILD_INPUT_CHANGED');
 const artifacts=[path.join(buildDir,'BUILD_ID'),...await walk(path.join(buildDir,'server')),...await walk(path.join(buildDir,'static'))];
 await writeFile(path.join(runtimeRoot,'build-receipt.json'),JSON.stringify({began,ended:new Date().toISOString(),node:process.version,inputs:before,outputs:await hashes(artifacts)},null,2),{flag:'wx'});
}
