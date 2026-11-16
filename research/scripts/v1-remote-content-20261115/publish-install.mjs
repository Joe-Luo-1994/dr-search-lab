import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {s3, getRemoteObject} from './s3.mjs';
import {readManifest, verifyFiles, verifySqlite} from './bundle.mjs';
import {runtime, artifactDirectory, releaseDirectory, cacheDirectory} from './settings.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
const descriptor = (key, bytes) => ({key,bytes:bytes.length,sha256:hash(bytes)});
const artifactKey = (variant, file) => 'artifacts/' + variant + '/' + file;
async function put(key, bytes) {
  const response = await s3('PUT', key, {body: bytes});
  if (response.status !== 200) throw Error('PUT_FAILED_'+response.status);
  await getRemoteObject(descriptor(key, bytes));
}
export async function publish() {
  const input = JSON.parse(await readFile(path.join(runtime,'publication-input.json')));
  const bucket = await s3('PUT','',{bucketOnly:true});
  if (bucket.status !== 200) throw Error('PRIVATE_BUCKET_CREATE_FAILED_'+bucket.status);
  let bytes=0;
  for (const object of input.objects) {
    const data = await readFile(path.join(runtime,'objects',...object.key.split('/')));
    if (hash(data)!==object.sha256 || data.length!==object.bytes) throw Error('SOURCE_OBJECT_MISMATCH');
    await put(object.key,data);bytes+=data.length;
  }
  const published=[];
  for (const r of input.releases) {
    const directory=artifactDirectory(r.variant);
    const raw=await readFile(path.join(directory,'manifest.json'));
    if (hash(raw)!==r.manifestSha256) throw Error('PUBLISH_MANIFEST_MISMATCH');
    const {manifest}=await readManifest(directory,r.version,r.manifestSha256);
    await verifyFiles(directory,manifest,{installed:false});verifySqlite(directory,manifest);
    for (const file of manifest.files) await put(artifactKey(r.variant,file.path),await readFile(path.join(directory,file.path)));
    const desc=descriptor(artifactKey(r.variant,'manifest.json'),raw);
    await put(desc.key,raw);
    // This marker is an experiment publisher's last-write signal, not a distributed transaction.
    const commit={schemaVersion:1,variant:r.variant,version:r.version,manifest:desc,objectReadbackComplete:r.variant!=='wrong-v2'};
    await put(artifactKey(r.variant,'commit.json'),Buffer.from(JSON.stringify(commit)+'\n'));
    published.push(commit);
  }
  const receipt={publishedAt:new Date().toISOString(),objects:input.objects.length,objectBytes:bytes,releases:published,
    closure:'All source objects PUT/GET hash-verified before normal release commit; wrong-v2 intentionally has a bad reference.'};
  await writeFile(path.join(runtime,'publication-receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
  return receipt;
}
export async function install(variant, version, cache) {
  if (!['v1','v2','wrong-v2'].includes(variant) || !['v1','v2'].includes(version) || !['main','negative','fresh'].includes(cache)) throw Error('INVALID_INSTALL_ARGUMENTS');
  const receipt=JSON.parse(await readFile(path.join(runtime,'publication-receipt.json')));
  const published=receipt.releases.find(r=>r.variant===variant&&r.version===version);
  if(!published)throw Error('UNKNOWN_PUBLISHED_RELEASE');
  const staging=path.join(cacheDirectory(cache),'.staging-'+version);
  await mkdir(cacheDirectory(cache),{recursive:true});
  await mkdir(staging);
  const began=performance.now();
  try {
    const raw=await getRemoteObject(published.manifest);
    await writeFile(path.join(staging,'manifest.json'),raw,{flag:'wx'});
    const {manifest}=await readManifest(staging,version,published.manifest.sha256);
    for(const file of manifest.files){
      if (!['search.sqlite','search-text.json'].includes(file.path)) throw Error('UNEXPECTED_LOCAL_FILE');
      const bytes=await getRemoteObject({...file,key:artifactKey(variant,file.path)});
      await writeFile(path.join(staging,file.path),bytes,{flag:'wx'});
    }
    await verifyFiles(staging,manifest,{installed:false});verifySqlite(staging,manifest);
    const result={version,snapshotId:manifest.snapshotId,manifestSha256:published.manifest.sha256,installedAt:new Date().toISOString(),elapsedMs:performance.now()-began};
    await writeFile(path.join(staging,'receipt.json'),JSON.stringify(result)+'\n',{flag:'wx'});
    await rename(staging,releaseDirectory(cache,version));
    await writeFile(path.join(cacheDirectory(cache),'last-success.json'),JSON.stringify(result)+'\n');
    await writeFile(path.join(cacheDirectory(cache),'last-attempt.json'),JSON.stringify({...result,state:'complete'})+'\n');
    return result;
  } catch(cause) {
    const e=Object.assign(Error(cause.code==='CONTENT_UNAVAILABLE'?'ARTIFACT_UNAVAILABLE':cause.message),{code:cause.code==='CONTENT_UNAVAILABLE'?'ARTIFACT_UNAVAILABLE':cause.code});
    await writeFile(path.join(cacheDirectory(cache),'failed-install.json'),JSON.stringify({at:new Date().toISOString(),error:e.message,ready:false})+'\n',{flag:'wx'});
    await writeFile(path.join(cacheDirectory(cache),'last-attempt.json'),JSON.stringify({at:new Date().toISOString(),state:'failed',code:e.message})+'\n');
    throw e;
  }
}
if(process.argv[1]?.endsWith('publish-install.mjs')) {
  const [action,...args]=process.argv.slice(2);
  try {console.log(JSON.stringify(action==='publish'?await publish():action==='install'?await install(...args):(()=>{throw Error('publish|install');})()));}
  catch(e){console.error(JSON.stringify({error:e.code??e.message}));process.exitCode=1;}
}
