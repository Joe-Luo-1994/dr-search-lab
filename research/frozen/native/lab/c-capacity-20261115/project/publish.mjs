import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {remote,sha,config} from './storage.mjs';
const root=process.argv[2],out=process.argv[3],c=await config();
const began=performance.now();let putBytes=0,getBytes=0,requests=0;
const bucket=await remote('PUT','',{body:Buffer.alloc(0)});requests++;await bucket.arrayBuffer();if(![200,409].includes(bucket.status))throw Error('BUCKET_'+bucket.status);
for(const version of ['v1','v2']){
 const m=JSON.parse(await readFile(path.join(root,version,'manifest.json'),'utf8'));
 for(const d of [m.db,...m.objects]){
   const bytes=await readFile(path.join(root,version,d.file));if(sha(bytes)!==d.sha256)throw Error('SOURCE_HASH');
   let r=await remote('PUT',d.key,{body:bytes});requests++;putBytes+=bytes.length;await r.arrayBuffer();if(!r.ok)throw Error('PUT_'+r.status);
   r=await remote('GET',d.key);requests++;const returned=Buffer.from(await r.arrayBuffer());getBytes+=returned.length;
   if(!r.ok||returned.length!==d.bytes||sha(returned)!==d.sha256)throw Error('READBACK_HASH');
 }
 const raw=await readFile(path.join(root,version,'manifest.json'));const r=await remote('PUT',version+'/manifest.json',{body:raw});requests++;putBytes+=raw.length;await r.arrayBuffer();if(!r.ok)throw Error('MANIFEST_PUT');
}
await writeFile(out,JSON.stringify({elapsedMs:performance.now()-began,resourceUsage:process.resourceUsage(),requests,putBytes,getBytes,bucket:c.bucket,published:['v1','v2'],trust:'local pinned receipt; not production release discovery/IAM'},null,2),{flag:'wx'});
