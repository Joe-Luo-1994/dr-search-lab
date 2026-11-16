import {createHash,createHmac} from 'node:crypto';
import {readFile,appendFile,open,rename,statfs,stat} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
export const sha=b=>createHash('sha256').update(b).digest('hex');
const hmac=(k,v)=>createHmac('sha256',k).update(v).digest();
let cached;
export async function config(){return cached??=JSON.parse(await readFile(process.env.CAP_CONFIG,'utf8'));}
export async function remote(method,key,{body,signal,anonymous=false}={}){
  const c=await config();
  if(!/^[a-zA-Z0-9./_-]*$/.test(key)||key.includes('..'))throw Error('KEY');
  const url=new URL(c.endpoint+'/'+c.bucket+(key?'/'+key:''));
  const stamp=new Date().toISOString().replace(/[:-]|\.\d{3}/g,'');
  const day=stamp.slice(0,8),scope=day+'/us-east-1/s3/aws4_request',hash=sha(body??Buffer.alloc(0));
  const names='host;x-amz-content-sha256;x-amz-date';
  const headers='host:'+url.host+'\nx-amz-content-sha256:'+hash+'\nx-amz-date:'+stamp+'\n';
  const canonical=[method,url.pathname,'',headers,names,hash].join('\n');
  const signing=hmac(hmac(hmac(hmac('AWS4'+c.secretKey,day),'us-east-1'),'s3'),'aws4_request');
  const sig=createHmac('sha256',signing).update(['AWS4-HMAC-SHA256',stamp,scope,sha(canonical)].join('\n')).digest('hex');
  return fetch(url,{method,body,signal:signal??AbortSignal.timeout(60000),redirect:'error',headers:anonymous?{}:{'x-amz-date':stamp,'x-amz-content-sha256':hash,authorization:`AWS4-HMAC-SHA256 Credential=${c.accessKey}/${scope}, SignedHeaders=${names}, Signature=${sig}`}});
}
export async function object(descriptor){
  if(!descriptor||descriptor.bytes>8*1024*1024)throw Error('OBJECT_LIMIT');
  const r=await remote('GET',descriptor.key,{signal:AbortSignal.timeout(4500)});if(!r.ok)throw Error('OBJECT_HTTP_'+r.status);
  const hash=createHash('sha256'),chunks=[];let n=0;
  for await(const b of r.body){n+=b.length;if(n>descriptor.bytes)throw Error('OBJECT_SIZE');hash.update(b);chunks.push(b);}
  if(n!==descriptor.bytes||hash.digest('hex')!==descriptor.sha256)throw Error('OBJECT_HASH');
  return Buffer.concat(chunks,n);
}
export async function download(descriptor,target,rate=0,externalSignal){
  const c=await config();
  if((c.diskBaselineBytes??0)+2*descriptor.bytes+128*1024**2>8*1024**3)throw Error('DISK_BUDGET_GUARD');
  const fs=await statfs(target.slice(0,target.lastIndexOf('/')));
  if(Number(fs.bavail)*Number(fs.bsize)<10*1024**3)throw Error('DISK_FREE_GUARD');
  const signal=AbortSignal.any([AbortSignal.timeout(40000),...(externalSignal?[externalSignal]:[])]);
  const response=await remote('GET',descriptor.key,{signal});if(!response.ok)throw Error('ARTIFACT_HTTP_'+response.status);
  const handle=await open(target+'.part','wx');const hash=createHash('sha256');let bytes=0;
  const started=Date.now(),began=performance.now();
  try {
    for await(const chunk of response.body){bytes+=chunk.length;if(bytes>descriptor.bytes)throw Error('ARTIFACT_SIZE');hash.update(chunk);await handle.write(chunk);
      if(rate){const delay=bytes/rate*1000-(performance.now()-began);if(delay>0)await sleep(delay,undefined,{signal});}}
    await handle.sync();
  }finally{await handle.close();}
  if(bytes!==descriptor.bytes||hash.digest('hex')!==descriptor.sha256)throw Error('ARTIFACT_HASH');
  await rename(target+'.part',target);
  return {downloadStartedMs:started,downloadEndedMs:Date.now(),bytes,elapsedMs:performance.now()-began};
}
