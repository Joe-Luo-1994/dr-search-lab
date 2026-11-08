// Allowlisted, self-verifying source handoff. Never copy the live runtime or credentials.
import { mkdir, readdir, readFile, writeFile, copyFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const roots = ['app', 'lib', 'scripts', 'tests', 'docs', 'evidence', 'onboarding', 'README.md', 'package.json', 'package-lock.json',
  'next.config.mjs', 'compose.yaml', '.env.example', '.gitignore', '.gitattributes', '.nvmrc'];
const run = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.resolve('.lab/transfers', run);
const source = path.join(dest, 'dr-search-lab');
await mkdir(source, { recursive: true });
const manifest = { createdAt: new Date().toISOString(), files: {}, exclusions: ['.git', '.env.local and other secrets', 'node_modules', '.next', '.lab runtime/data/tools'], synthetic: true };
async function copy(relative) {
  const info = await lstat(relative);
  if (info.isSymbolicLink()) throw new Error(`Symlink refused: ${relative}`);
  if (info.isDirectory()) {
    await mkdir(path.join(source, relative), { recursive: true });
    for (const child of (await readdir(relative)).sort()) await copy(path.join(relative, child));
  } else {
    const name = path.basename(relative);
    if (name.startsWith('.env') && name !== '.env.example' || /\.(pem|key|pfx)$/i.test(name) || name === 'id_rsa') throw new Error(`Sensitive filename refused: ${relative}`);
    const bytes = await readFile(relative);
    await copyFile(relative, path.join(source, relative));
    manifest.files[relative.replaceAll('\\', '/')] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
}
for (const root of roots) await copy(root);
await writeFile(path.join(source, 'TRANSFER_MANIFEST.json'), JSON.stringify(manifest, null, 2));
const archive = path.join(dest, 'dr-search-lab.tar.gz');
execFileSync('tar', ['-czf', archive, '-C', dest, 'dr-search-lab'], { windowsHide: true });
const verify = path.join(dest, 'readback');
await mkdir(verify);
execFileSync('tar', ['-xzf', archive, '-C', verify], { windowsHide: true });
for (const [file, expected] of Object.entries(manifest.files)) {
  const bytes = await readFile(path.join(verify, 'dr-search-lab', file));
  if (bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error(`Archive read-back failed: ${file}`);
}
const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(`${archive}.sha256`, `${digest}  dr-search-lab.tar.gz\n`);
console.log(JSON.stringify({ archive, sha256: digest, verifiedFiles: Object.keys(manifest.files).length, readback: 'passed' }, null, 2));
