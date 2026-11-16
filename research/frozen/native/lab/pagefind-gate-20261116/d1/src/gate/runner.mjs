import {spawn} from 'node:child_process';
import {readFile,writeFile,rename,unlink,lstat,opendir} from 'node:fs/promises';
import {openSync,writeSync,fsyncSync,closeSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {MS1_CASES,caseRequest,validateMs1Response} from './oracle.mjs';
const [run,root]=process.argv.slice(2),watch=path.join(root,'operation.json');
const result={stage:'D1',synthetic:true,searchRequests:0,completed:false,scope:'one unchanged first query, trace only',startedAt:new Date().toISOString()};
const traceFd=openSync(path.join(root,'runner.ndjson'),'wx');
function event(stage,data={}){writeSync(traceFd,JSON.stringify({atMs:Date.now(),stage,...data})+'\n');fsyncSync(traceFd);}
async function hash(p){const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');}
let child,exited,ready,stdout,stderr,timedOut=false,readyTimer;
try{
 const freeze=JSON.parse(await readFile(path.join(root,'freeze.json'),'utf8'));
 for(const f of freeze.files)assert.equal(await hash(f.absolutePath),f.sha256,'SOURCE_CHANGED:'+f.absolutePath);
 event('source.verified',{files:freeze.files.length});
 const inventoryBytes=await readFile(path.join(run,'evidence/artifact-inventory.json'));
 const v=JSON.parse(await readFile(path.join(run,'evidence/g1-verification.json'),'utf8'));
 assert.equal(createHash('sha256').update(inventoryBytes).digest('hex'),v.inventorySha256);assert(v.verified);
 const inventory=JSON.parse(inventoryBytes);const artifact=path.join(run,'artifacts/artifact-100000');
 const expected=new Set();
 for(const f of inventory.files){assert(!path.isAbsolute(f.path)&&!f.path.includes('\\')&&f.path.split('/').every(p=>p&&p!=='.'&&p!=='..'));assert(!expected.has(f.path));expected.add(f.path);const p=path.join(artifact,f.path),s=await lstat(p);assert(s.isFile()&&!s.isSymbolicLink());assert.equal(s.size,f.bytes);assert.equal(await hash(p),f.sha256,'ARTIFACT_CHANGED:'+f.path);}
 let actualFiles=0;
 async function walk(dir){for await(const e of await opendir(dir)){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else{assert(e.isFile(),'ARTIFACT_SPECIAL_FILE');assert(expected.has(path.relative(artifact,p)),'ARTIFACT_UNLISTED_FILE');actualFiles++;}}}
 await walk(artifact);assert.equal(actualFiles,expected.size,'ARTIFACT_FILE_COUNT');
 event('artifact.verified',{files:inventory.files.length});
 const test=MS1_CASES[0];assert.equal(test.id,'ms1-common-huge-page1');assert.equal(test.request.q,'commonterm');assert.equal(test.request.user,'huge');assert.equal(test.expected.total,50000);
 const api=path.join(root,'api'),core=pathToFileURL(path.join(root,'src/ms1-api-lab/core.mjs')).href;
 stdout=openSync(path.join(root,'serve.stdout.log'),'wx');stderr=openSync(path.join(root,'serve.stderr.log'),'wx');
 child=spawn(process.execPath,[path.join(root,'src/gate/serve.mjs'),api,artifact,core],{cwd:root,detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,D1_TRACE_DIR:path.join(root,'traces'),NEXT_TELEMETRY_DISABLED:'1'}});
 let resolveReady,rejectReady,buffer='';ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});
 child.stdout.on('data',b=>{writeSync(stdout,b);buffer+=b.toString();let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const o=JSON.parse(line);if(o.ready)resolveReady(o);}catch{}}});
 child.stderr.on('data',b=>writeSync(stderr,b));
 exited=new Promise(resolve=>{child.once('error',e=>rejectReady(e));child.once('close',(code,signal)=>{resolve({code,signal});rejectReady(Error('SERVER_EXIT'));});});
 const r=await Promise.race([ready,new Promise((_,reject)=>{readyTimer=setTimeout(()=>reject(Error('READY_TIMEOUT')),30000);})]);clearTimeout(readyTimer);
 assert.equal(new URL(r.url).hostname,'127.0.0.1');event('server.ready',{pid:r.pid});
 const request=caseRequest(test,r.url);const row={id:test.id,request,expected:test.expected};
 const start=performance.now();await writeFile(watch+'.tmp',JSON.stringify({id:'D1-first-query',kind:'query',startedAtMs:Date.now()}),{flag:'wx'});await rename(watch+'.tmp',watch);
 event('query.begin');result.searchRequests=1;
 try{
  const response=await fetch(request.url,{headers:request.headers,redirect:'error',signal:AbortSignal.timeout(5000)});
  const chunks=[];let bytes=0;for await(const b of response.body){bytes+=b.length;if(bytes>2*1024*1024)throw Error('BODY_LIMIT');chunks.push(b);}
  row.response={status:response.status,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))};row.validator=validateMs1Response(test,row.response);
 }catch(e){row.error={name:e.name,message:e.message};row.validator={passed:false,issues:[e.name]};}
 finally{
  row.elapsedMs=performance.now()-start;timedOut=row.elapsedMs>=5000||row.error?.name==='TimeoutError';
  if(timedOut){row.validator.passed=false;row.validator.issues.push('QUERY_DEADLINE_EXCEEDED');}else await unlink(watch);
  const fd=openSync(path.join(root,'case.json'),'wx');writeSync(fd,JSON.stringify(row,null,2)+'\n');fsyncSync(fd);closeSync(fd);event('query.end',{elapsedMs:row.elapsedMs,validator:row.validator});result.case=row;
 }
 result.completed=true;result.casePassed=row.validator.passed;if(!row.validator.passed)process.exitCode=1;
}catch(e){result.error={name:e.name,message:e.message,stack:e.stack};process.exitCode=1;event('runner.error',result.error);}
finally{
 clearTimeout(readyTimer);
 if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')result.cleanupError=e.message;}
  const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},2000);
  result.childExit=await exited;clearTimeout(timer);try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')result.cleanupError=e.message;}
 }
 for(const fd of [stdout,stderr])if(fd!==undefined){fsyncSync(fd);closeSync(fd);}
 result.finishedAt=new Date().toISOString();await writeFile(path.join(root,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});fsyncSync(traceFd);closeSync(traceFd);
}
