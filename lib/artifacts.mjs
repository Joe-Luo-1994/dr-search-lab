import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import MiniSearch from 'minisearch';
import { create, insertMultiple, save } from '@orama/orama';
import { generateDataset, searchable } from './dataset.mjs';

export const root = path.resolve(process.env.LAB_DATA_DIR || '.lab/data');
export const miniOptions = { fields: ['title', 'body'], storeFields: ['spaceId', 'tagIds'], searchOptions: { boost: { title: 2 } } };
export const oramaSchema = { id: 'string', title: 'string', body: 'string', spaceId: 'enum', tagIds: 'enum[]' };
export function variant(version, attachments) {
  if (!['v1', 'v2'].includes(version)) throw new Error('Invalid version');
  return `${version}-${attachments ? 'attachments' : 'body'}`;
}
export async function readManifest() {
  return JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
}
export async function readDataset(version) {
  if (!['v1', 'v2'].includes(version)) throw new Error('Invalid version');
  return JSON.parse(await readFile(path.join(root, `${version}.json`), 'utf8'));
}
export async function verifyArtifacts(version) {
  variant(version, false); // validate before using version in filenames
  const manifest = await readManifest();
  const required = [`${version}.json`, ...[false, true].flatMap(a => ['sqlite', 'mini.json', 'orama.json'].map(ext => `${variant(version, a)}.${ext}`))];
  for (const file of required) {
    const expected = manifest.files?.[file];
    if (!expected || !/^[a-f0-9]{64}$/.test(expected.sha256) || !Number.isInteger(expected.bytes)) throw new Error(`Required artifact missing from manifest: ${file}`);
    const bytes = await readFile(path.join(root, file));
    if (bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error(`Artifact checksum mismatch: ${file}`);
  }
  return manifest;
}
export async function prepare(count = 100) {
  if (!Number.isInteger(count) || count < 12 || count > 100000) throw new Error('count must be 12..100000');
  await mkdir(root, { recursive: true });
  const manifest = { generatedAt: new Date().toISOString(), synthetic: true, count, storage: 'local-files (MinIO not connected)', files: {}, builds: [] };
  for (const version of ['v1', 'v2']) {
    const dataset = generateDataset(count, version);
    await writeFile(path.join(root, `${version}.json`), JSON.stringify(dataset));
    for (const attachments of [false, true]) {
      const key = variant(version, attachments);
      const docs = dataset.pages.map(p => searchable(p, attachments));
      for (const engine of ['sqlite', 'minisearch', 'orama']) {
        const start = performance.now();
        if (engine === 'sqlite') {
          const db = new DatabaseSync(path.join(root, `${key}.sqlite`));
          try {
            db.exec(`DROP TABLE IF EXISTS text_index; DROP TABLE IF EXISTS tags; DROP TABLE IF EXISTS pages;
              CREATE TABLE pages (id TEXT PRIMARY KEY, spaceId TEXT NOT NULL);
              CREATE TABLE tags (pageId TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(pageId, tag));
              CREATE INDEX by_space ON pages(spaceId);
              CREATE VIRTUAL TABLE text_index USING fts5(id UNINDEXED, title, body, tokenize='unicode61');
              BEGIN;`);
            const p = db.prepare('INSERT INTO pages VALUES (?, ?)');
            const t = db.prepare('INSERT INTO tags VALUES (?, ?)');
            const f = db.prepare('INSERT INTO text_index VALUES (?, ?, ?)');
            for (const doc of docs) { p.run(doc.id, doc.spaceId); for (const tag of doc.tagIds) t.run(doc.id, tag); f.run(doc.id, doc.title, doc.body); }
            db.exec('COMMIT;');
          } finally { db.close(); }
        } else if (engine === 'minisearch') {
          const index = new MiniSearch(miniOptions); index.addAll(docs);
          await writeFile(path.join(root, `${key}.mini.json`), JSON.stringify(index));
        } else {
          const index = create({ schema: oramaSchema });
          await insertMultiple(index, docs.map(({ id, title, body, spaceId, tagIds }) => ({ id, title, body, spaceId, tagIds })));
          await writeFile(path.join(root, `${key}.orama.json`), JSON.stringify(save(index)));
        }
        manifest.builds.push({ engine, version, attachments, elapsedMs: +(performance.now() - start).toFixed(2) });
      }
    }
  }
  const { readdir } = await import('node:fs/promises');
  for (const file of await readdir(root)) {
    if (!/^v[12][.-]/.test(file)) continue;
    const bytes = await readFile(path.join(root, file));
    manifest.files[file] = { bytes: (await stat(path.join(root, file))).size, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  await writeFile(path.join(root, 'manifest.tmp'), JSON.stringify(manifest, null, 2));
  await rename(path.join(root, 'manifest.tmp'), path.join(root, 'manifest.json'));
  return manifest;
}
