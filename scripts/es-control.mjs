import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);
export async function controlES(action, instance = 'primary') {
  if (!['setup', 'start', 'status', 'stop'].includes(action) || !['primary', 'dr'].includes(instance)) {
    throw new Error('Usage: node scripts/es-control.mjs setup|start|status|stop [primary|dr]');
  }
  const windows = process.platform === 'win32';
  if (!windows && process.platform !== 'linux') throw new Error('Native ES runner supports Windows and Linux only');
  const args = windows
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts/es-native.ps1'), '-Action', action, '-Instance', instance]
    : [path.resolve('scripts/es-native.sh'), action, instance];
  const result = await exec(windows ? 'powershell.exe' : 'bash', args, {
    timeout: action === 'setup' ? 900000 : 120000, windowsHide: true, maxBuffer: 1024 * 1024
  });
  return result.stdout.trim();
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/es-control.mjs')) {
  try { console.log(await controlES(process.argv[2], process.argv[3])); }
  catch (error) { console.error(error.stderr || error.message); process.exitCode = 1; }
}
