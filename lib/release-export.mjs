import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256, releaseDocuments, documentDigest } from './readonly-release.mjs';

// Producer only: consumes files representing an export, not a company DB connector.
export async function exportRelease(source, destination, prefix) {
  if (!/^drlab-[a-z0-9-]*$/.test(prefix)) throw Error('Invalid ES prefix');
  const bytes = await readFile(path.join(source, 'pages.json'));
  const data = JSON.parse(bytes);
  if (!['v1', 'v2'].includes(data.version) || !Array.isArray(data.pages)) throw Error('Invalid source');
  const descriptor = content => ({ bytes: content.length, sha256: sha256(content) });
  const manifest = { schema: 1, synthetic: true, version: data.version, createdAt: new Date().toISOString(), pages: descriptor(bytes), media: {}, es: {} };
  await mkdir(path.join(destination, 'media'), { recursive: true });
  await writeFile(path.join(destination, 'pages.json'), bytes, { flag: 'wx' });
  for (const id of new Set(data.pages.flatMap(p => p.mediaIds))) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw Error('Invalid source media ID');
    const content = await readFile(path.join(source, 'media', `${id}.bin`));
    manifest.media[id] = { ...descriptor(content), filename: `${id}.bin`, mime: 'application/octet-stream' };
    await writeFile(path.join(destination, 'media', `${id}.bin`), content, { flag: 'wx' });
  }
  for (const attachments of [false, true]) {
    const variant = attachments ? 'attachments' : 'body';
    manifest.es[variant] = { index: `${prefix}${data.version}-${variant}`, count: data.pages.length, digest: documentDigest(releaseDocuments(data.pages, attachments)) };
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  await writeFile(path.join(destination, 'manifest.json'), manifestBytes, { flag: 'wx' });
  return { manifestHash: sha256(manifestBytes), manifest };
}
