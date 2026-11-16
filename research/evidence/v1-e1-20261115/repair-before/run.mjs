// Single formal execution, using the independently authored oracle. No fixture mutation.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import net from 'node:net';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..'), out=path.join(root,'evidence/v1-e1-20261115/r1');
const runtime=path.join(root,'.lab/v1-e1-20261115'), prepared=path.join(runtime,'prepared');
const oracle=JSON.parse(fs.readFileSync(path.join(here,'review/oracle.json')));
const freeze=JSON.parse(fs.readFileSync(path.join(root,'evidence/v1-e1-20261115/freeze.json')));
const sha=b=>createHash('sha256').update(b).digest('hex');
const exec=promisify(execFile), origin='http://127.0.0.1:3157';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const started=Date.now(), results=[], raw=[], lifecycle=[], resources=[], uiResults=[];
let child=null, timer, monitorTimer, monitoring=false, fatal=null, profile='baseline', faultDb=false;
let nextRssMax=0,totalRssMax=0;
const allPids=new Set(), esPid=freeze.esPid;
const abort=new AbortController();
function stopFor(message){fatal??=message;if(!abort.signal.aborted)abort.abort(Error(message));child?.kill();}
function checkFreeze(){for(const [rel,hash] of Object.entries(freeze.files))assert.equal(sha(fs.readFileSync(path.join(root,rel))),hash,'HASH_CHANGED '+rel);}
checkFreeze();
assert.equal(sha(fs.readFileSync(path.join(here,'fixture/source.json'))),oracle.sourceSha256);
assert.equal(sha(fs.readFileSync(path.join(here,'CONTRACT.md'))),oracle.contractSha256);
fs.mkdirSync(out); // parent is prepared separately; existing r1 is never overwritten.
const save=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const journal=(name,value)=>fs.appendFileSync(path.join(out,name),JSON.stringify(value)+'\n');
function diskBytes(dir){let n=0;if(!fs.existsSync(dir))return n;for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('UNEXPECTED_SYMLINK');const p=path.join(dir,e.name);n+=e.isDirectory()?diskBytes(p):fs.statSync(p).size;}return n;}
async function sample(){
 if(monitoring)return;monitoring=true;
 try{
  const {stdout}=await exec('powershell.exe',['-NoProfile','-File',path.join(here,'monitor.ps1')],{windowsHide:true,timeout:10000,maxBuffer:1048576});
  const m=JSON.parse(stdout), ids=new Set([process.pid,esPid,...allPids]);
  for(let i=0;i<10;i++){let changed=false;for(const p of m.processes)if(ids.has(p.ParentProcessId)&&!ids.has(p.ProcessId)){ids.add(p.ProcessId);changed=true;}if(!changed)break;}
  const selected=m.processes.filter(p=>ids.has(p.ProcessId));
  const total=selected.reduce((n,p)=>n+Number(p.WorkingSetSize),0), bytes=diskBytes(runtime)+diskBytes(path.dirname(out));
  totalRssMax=Math.max(totalRssMax,total);
  const rec={at:new Date().toISOString(),totalRss:total,selected,freeMemoryBytes:m.freeMemoryBytes,freeDiskBytes:m.freeDiskBytes,logicalBytes:bytes};resources.push(rec);journal('resources.jsonl',rec);
  assert(total<=6*1024**3,'RSS_GUARD');assert(m.freeMemoryBytes>=2*1024**3,'HOST_MEMORY_GUARD');assert(m.freeDiskBytes>=10*1024**3,'DISK_FREE_GUARD');assert(bytes<=2*1024**3,'RUNTIME_SIZE_GUARD');
 }catch(e){stopFor(e.message);}finally{monitoring=false;}
}
function ensure(){if(fatal)throw Error(fatal);}
async function role(value){await fsp.writeFile(path.join(prepared,'role-profile.next'),value+'\n');await fsp.rename(path.join(prepared,'role-profile.next'),path.join(prepared,'role-profile.txt'));profile=value;}
async function portFree(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
async function stop(){if(!child)return;const p=child;child=null;p.kill();await Promise.race([new Promise(r=>p.once('exit',r)),sleep(5000)]);for(let i=0;i<30;i++){try{await portFree(3157);return;}catch{}await sleep(100);}throw Error('NEXT_PORT_NOT_RELEASED');}
async function start(engine,bad=false){
 await portFree(3157);if(bad)await portFree(19390);
 const args=[path.join(here,'serve.mjs'),engine,...bad?['--es-url','http://127.0.0.1:19390']:[]];
 child=spawn(process.execPath,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});allPids.add(child.pid);
 const rec={at:new Date().toISOString(),engine,bad,pid:child.pid,args};lifecycle.push(rec);journal('lifecycle.jsonl',rec);
 const log=fs.createWriteStream(path.join(out,`next-${engine}-${bad?'fault':'normal'}-${child.pid}.log`));child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.once('exit',()=>log.end());
 for(let i=0;i<100;i++){ensure();if(child.exitCode!==null)throw Error('NEXT_START_EXIT');try{const r=await fetch(origin,{signal:AbortSignal.timeout(1000)});if(r.ok){await r.arrayBuffer();return;}}catch{}await sleep(300);}throw Error('NEXT_READY_TIMEOUT');
}
function allowed(identity){return profile==='revoked-b'&&identity==='b'?[]:(oracle.identityProfiles.baseline?.[identity]??({a:['space-a'],b:['space-b'],all:['space-a','space-b'],none:[]}[identity]));}
function snippet(p,q){const paragraphs=[...p.paragraphs,...p.mediaIds.flatMap(id=>oracle.expectedMedia[id].extractedText.split('\n'))];const terms=q.toLowerCase().split(/\s+/u).filter(Boolean);const text=paragraphs.find(s=>terms.some(t=>s.toLowerCase().includes(t)))??p.paragraphs[0];return [...text].slice(0,160).join('');}
async function request(engine,id,step){
 ensure();const began=Date.now(), rec={engine,caseId:id,path:step.request.path,identity:step.request.identity,profile,startedAt:new Date(began).toISOString()};
 try{
  const r=await fetch(origin+step.request.path,{headers:{'x-e1-identity':step.request.identity},signal:AbortSignal.timeout(5000)});const bytes=Buffer.from(await r.arrayBuffer());
  const ended=Date.now();Object.assign(rec,{status:r.status,headers:Object.fromEntries(r.headers),durationMs:ended-began,endedAt:new Date(ended).toISOString(),bytes:bytes.length,sha256:sha(bytes)});
  if(r.headers.get('content-type')?.includes('json')){try{rec.body=JSON.parse(bytes.toString());}catch{rec.responseText=bytes.toString();}}
  const exp=step.expect;assert.equal(r.status,exp.status,'STATUS');assert(ended-began<=5000,'REQUEST_DEADLINE');
  assert.equal(r.headers.get('cache-control'),'no-store','CACHE_CONTROL');
  if(exp.mediaSha256){assert.equal(sha(bytes),exp.mediaSha256,'MEDIA_HASH');assert.equal(bytes.length,exp.mediaBytes,'MEDIA_BYTES');assert(r.headers.get('content-type')?.startsWith(exp.contentType),'MEDIA_TYPE');assert(r.headers.get('content-disposition')?.includes(exp.fileName),'MEDIA_DISPOSITION');assert(bytes.subarray(0,5).toString()==='%PDF-','PDF_HEADER');assert(bytes.toString().includes('%%EOF'),'PDF_EOF');}
  else {
   const body=JSON.parse(bytes.toString());rec.body=body;
   if(r.status!==200)assert.deepEqual(body,{error:{code:exp.errorCode}},'ERROR_SHAPE');
   else{
    assert.equal(body.snapshotId,oracle.snapshot.snapshotId,'SNAPSHOT_ID');assert.equal(body.snapshotCapturedAt,oracle.snapshot.snapshotCapturedAt,'SNAPSHOT_TIME');
    const authAt=Date.parse(body.authorizationCheckedAt);assert(Number.isFinite(authAt)&&authAt>=began&&authAt<=ended,'AUTH_TIMESTAMP');
    const u=new URL(origin+step.request.path);
    if(u.pathname==='/api/search'){
     assert(Array.isArray(body.hits)&&body.hits.length<=10,'HITS');assert(Number.isInteger(body.total)&&body.total>=0&&body.total>=body.hits.length,'TOTAL');
     const ids=body.hits.map(h=>h.pageId);assert.equal(new Set(ids).size,ids.length,'DUPLICATE_HITS');
     for(const p of exp.requiredPageIds??[])assert(ids.includes(p),'MISSING_REQUIRED '+p);
     for(const p of exp.forbiddenPageIds??[])assert(!ids.includes(p),'FORBIDDEN '+p);
     if(exp.total!==undefined)assert.equal(body.total,exp.total,'TOTAL_EXPECTATION');
     for(const hit of body.hits){const p=oracle.expectedPages[hit.pageId];assert(p,'UNKNOWN_PAGE');assert(allowed(step.request.identity)?.includes(p.spaceId),'UNAUTHORIZED_HIT');if(u.searchParams.has('spaceId'))assert.equal(p.spaceId,u.searchParams.get('spaceId'),'SPACE');for(const t of u.searchParams.getAll('tagId'))assert(p.tagIds.includes(t),'TAGS_AND');assert.deepEqual(Object.keys(hit).sort(),['pageId','spaceId','title','tagIds','snippet'].sort(),'HIT_SHAPE');assert.equal(hit.spaceId,p.spaceId);assert.equal(hit.title,p.title);assert.deepEqual([...hit.tagIds].sort(),[...p.tagIds].sort());assert.equal(hit.snippet,snippet(p,u.searchParams.get('q')),'SNIPPET');}
    }else if(u.pathname.endsWith('/media')){
     const p=oracle.expectedPages[exp.pageId];assert.equal(body.pageId,exp.pageId);assert(allowed(step.request.identity)?.includes(p.spaceId));assert.deepEqual(body.media.map(m=>m.mediaId).sort(),[...exp.mediaIds].sort());
     for(const m of body.media){const expected=oracle.expectedMedia[m.mediaId];assert.deepEqual(m,{mediaId:m.mediaId,fileName:expected.fileName,mimeType:expected.mimeType,sha256:expected.sha256,bytes:expected.bytes,url:`/api/pages/${exp.pageId}/media/${m.mediaId}`});}
    }else{const p=oracle.expectedPages[exp.pageId];assert(allowed(step.request.identity)?.includes(p.spaceId));assert.deepEqual(body.page,{pageId:exp.pageId,spaceId:p.spaceId,title:p.title,tagIds:p.tagIds,body:p.body},'PAGE_PROJECTION');}
   }
  }
  rec.passed=true;
 }catch(e){rec.passed=false;rec.error=e.message;}
 raw.push(rec);journal('requests.jsonl',rec);return rec;
}
async function runCase(engine,c){
 const began=Date.now();let steps=[],error;
 try{
  await role('baseline');
  if(c.baseline)steps.push(await request(engine,c.id+'-baseline',c.baseline));
  if(c.setup?.roleProfile)await role(c.setup.roleProfile);
  if(c.id==='N07'){if(engine==='b'){await stop();await start(engine,true);}else{await fsp.rename(path.join(prepared,'snapshot/search.sqlite'),path.join(prepared,'snapshot/search.sqlite.fault'));faultDb=true;}}
  const chainStart=Date.now();for(const step of [c,...c.chain??[]])steps.push(await request(engine,c.id,step));
  if(Date.now()-chainStart>15000)throw Error('CHAIN_DEADLINE');
 }catch(e){error=e.message;}
 finally{
  if(faultDb){await fsp.rename(path.join(prepared,'snapshot/search.sqlite.fault'),path.join(prepared,'snapshot/search.sqlite'));faultDb=false;}
  if(c.id==='N07'&&engine==='b'){await stop();await start(engine);}
  await role('baseline');
 }
 const result={engine,id:c.id,kind:c.kind,passed:!error&&steps.length>0&&steps.every(s=>s.passed),error,durationMs:Date.now()-began,requests:steps.length,...c.kind==='diagnostic'?{policyExpected:c.policyExpected,currentRelations:c.currentRelations,timeline:c.timeline,exposure:c.exposure,interpretation:'synthetic-policy-observation-not-security-acceptance'}:{}};
 results.push(result);journal('cases.jsonl',result);
}

try{
 await sample();ensure();timer=setTimeout(()=>stopFor('GLOBAL_WATCHDOG'),900000);monitorTimer=setInterval(()=>{sample().catch(e=>stopFor(e.message));},2000);
 for(const engine of ['b','c']){
  await role('baseline');await start(engine);
  for(const c of [...oracle.cases,...oracle.driftCases]){ensure();await runCase(engine,c);}
  // UI runner is versioned and reviewed with this file, and runs while this engine is active.
  const ui=await import('./ui-review.mjs');uiResults.push(await ui.runUi({engine,origin,out,signal:abort.signal}));
  await stop();
 }
 checkFreeze();
}catch(e){fatal??=e.stack??e.message;}
finally{
 clearTimeout(timer);clearInterval(monitorTimer);
 if(faultDb)await fsp.rename(path.join(prepared,'snapshot/search.sqlite.fault'),path.join(prepared,'snapshot/search.sqlite')).catch(e=>{fatal??=e.message;});
 await role('baseline').catch(e=>{fatal??=e.message;});await stop().catch(e=>{fatal??=e.message;});
 while(monitoring)await sleep(100);
 const summary={startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),durationMs:Date.now()-started,fatal,caseCount:results.length,requestCount:raw.length,results,uiResults,resourceSamples:resources.length,totalRssMax,formalPassed:!fatal&&results.length===2*oracle.scope.total&&results.every(r=>r.passed)&&uiResults.length===2&&uiResults.every(r=>r.passed),scope:'small synthetic Windows function test, no capacity or production acceptance'};
 save('summary.json',summary);console.log(JSON.stringify(summary));if(fatal||!summary.formalPassed)process.exitCode=1;
}
