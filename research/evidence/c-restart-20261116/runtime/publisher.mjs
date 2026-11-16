import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {remote,sha,config} from './storage.mjs';
const [action,root,out]=process.argv.slice(2);const cfg=await config();let requests=0,putBytes=0,getBytes=0,approved=null;
async function get(key){requests++;const r=await remote('GET',key,{signal:AbortSignal.timeout(15000)});const bytes=Buffer.from(await r.arrayBuffer());getBytes+=bytes.length;return {status:r.status,bytes};}
async function put(key,bytes){requests++;const r=await remote('PUT',key,{body:bytes,signal:AbortSignal.timeout(15000)});putBytes+=bytes.length;await r.arrayBuffer();if(!r.ok)throw Error('PUT_'+r.status);const got=await get(key);if(got.status!==200||!got.bytes.equals(bytes))throw Error('PUT_READBACK_MISMATCH');}
async function immutable(key,bytes){const old=await get(key);if(old.status===200){if(!old.bytes.equals(bytes))throw Error('IMMUTABLE_CONFLICT:'+key);return;}if(old.status!==404)throw Error('EXISTING_GET_'+old.status);await put(key,bytes);}
const start=performance.now();
if(action==='publish'){
 requests++;const b=await remote('PUT','',{body:Buffer.alloc(0)});await b.arrayBuffer();if(![200,409].includes(b.status))throw Error('BUCKET_CREATE');
 for(const version of ['v1','v2']){
  const raw=await fs.readFile(path.join(root,version,'manifest.json')),manifest=JSON.parse(raw);
  if(manifest.snapshotId!==version)throw Error('MANIFEST_IDENTITY');
  const db=new DatabaseSync(path.join(root,version,'search.sqlite'),{readOnly:true});
  try{if(db.prepare('SELECT snapshotId FROM metadata').get().snapshotId!==version||db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('SOURCE_DB_IDENTITY');}finally{db.close();}
  for(const d of [manifest.db,...manifest.objects]){
   const file=path.resolve(root,version,d.file);if(!file.startsWith(path.resolve(root,version)+path.sep)||!d.key.startsWith(version+'/'))throw Error('PUBLISH_PATH');
   const bytes=await fs.readFile(file);if(bytes.length!==d.bytes||sha(bytes)!==d.sha256)throw Error('SOURCE_HASH');await immutable(d.key,bytes);
  }
  await immutable(version+'/manifest.json',raw);
 }
}else if(['v1','v2','bad-v2'].includes(action)){
 const v=action==='v1'?'v1':'v2',raw=await fs.readFile(path.join(root,v,'manifest.json'));
 const current={schemaVersion:1,releaseId:v,manifest:{key:v+'/manifest.json',bytes:raw.length,sha256:action==='bad-v2'?'0'.repeat(64):sha(raw)}};
 approved=current;
 // This publisher has already closed the immutable release before approving it.
 const manifest=await get(current.manifest.key);if(manifest.status!==200||!manifest.bytes.equals(raw))throw Error('APPROVE_UNPUBLISHED_MANIFEST');
 await put(cfg.approvedKey,Buffer.from(JSON.stringify(current)+'\n'));
}else throw Error('ACTION');
await fs.writeFile(out,JSON.stringify({action,approved,elapsedMs:performance.now()-start,requests,putBytes,getBytes,assumptions:['single trusted publisher','research credentials shared; production IAM not verified','approved object read once per bootstrap; no distributed transaction']},null,2),{flag:'wx'});
console.log(JSON.stringify({action,requests,elapsedMs:performance.now()-start}));
