import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {
  describeFiles, maxArtifactBytes, maxManifestBytes, projectedPages, readManifest, validateSource, verifyFiles,
  verifySqlite, writePdfs, writeSqlite,
} from './bundle.mjs';
import {
  artifactDirectory, artifactRoot, checkDirectory, checkRuntime, ensureDirectory, expectOne, producerDir,
  readBounded, sha256, sourceSites, variants,
} from './settings.mjs';

const [variant, sourceSite, ...extra] = process.argv.slice(2);
expectOne(variant, variants);
const mixed = variant === 'mixed-v2';
if (extra.length || (mixed ? sourceSite !== undefined : !sourceSites.includes(sourceSite))) {
  throw new Error('Usage: node export.mjs v1|v2 fz1|fz2 OR node export.mjs mixed-v2');
}

async function alreadyExported(version) {
  const directory = artifactDirectory(version);
  await checkDirectory(directory);
  const raw = await readBounded(path.join(directory, 'manifest.json'), maxManifestBytes);
  const {manifest} = await readManifest(directory, version, sha256(raw));
  await verifyFiles(directory, manifest);
  verifySqlite(directory, manifest);
  return {directory, manifest};
}

await checkRuntime();
await ensureDirectory(artifactRoot);
const directory = artifactDirectory(variant);
let manifest;
if (mixed) {
  const v1 = await alreadyExported('v1');
  const v2 = await alreadyExported('v2');
  manifest = {...v2.manifest};
  await mkdir(directory);
  await mkdir(path.join(directory, 'media'));
  // Preserve the original V1 DB identity. Recompute every file descriptor below.
  for (const file of v2.manifest.files) {
    const origin = file.path === 'search.sqlite' ? v1.directory : v2.directory;
    const bytes = await readBounded(path.join(origin, file.path), maxArtifactBytes);
    await writeFile(path.join(directory, file.path), bytes, {flag: 'wx'});
  }
} else {
  const sourceDirectory = path.join(producerDir, sourceSite);
  await checkDirectory(producerDir);
  await checkDirectory(sourceDirectory);
  const raw = await readBounded(path.join(sourceDirectory, variant + '.json'), maxManifestBytes);
  const source = JSON.parse(raw);
  validateSource(source, variant);
  manifest = {...source, sourceSha256: sha256(raw), pages: projectedPages(source)};
  await mkdir(directory);
  await mkdir(path.join(directory, 'media'));
  writeSqlite(directory, manifest);
  await writePdfs(directory, source.media);
}
manifest.files = await describeFiles(directory, manifest.media);
await verifyFiles(directory, manifest);
if (!mixed) verifySqlite(directory, manifest);
const raw = Buffer.from(JSON.stringify(manifest) + '\n');
await writeFile(path.join(directory, 'manifest.json'), raw, {flag: 'wx'});
console.log(JSON.stringify({
  event: 'e2_artifact_exported', variant, sourceSite, directory,
  snapshotId: manifest.snapshotId, sourceSha256: manifest.sourceSha256, manifestSha256: sha256(raw),
  pages: manifest.pages.length, files: manifest.files,
}));
