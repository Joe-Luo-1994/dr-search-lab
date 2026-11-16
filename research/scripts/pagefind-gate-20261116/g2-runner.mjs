// G2 bounded synthetic identification only. Controller owns cgroup and the hard
// 5s operation / 900s group deadlines. No capacity inference or automatic retry.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream,openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import {readFile,writeFile,rename,unlink,mkdir,cp,stat,lstat,opendir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {MS1_CASES,SMALL_CASES,caseRequest,validateMs1Response,validateSmallResponse,
  validateMs1Pagination,ORACLE_CONTRACT} from './oracle.mjs';

const run=path.resolve(process.argv[2]??''),root=path.resolve(process.argv[3]??'');
assert(process.argv.length===4,'usage: node g2-runner.mjs RUN G2ROOT');
const artifacts=path.join(root,'artifacts'),api=path.join(artifacts,'api'),small=path.join(artifacts,'small');
const watch=path.join(root,'operation.json'),src=path.join(root,'src');
const children=new Set(),abort=new AbortController(),start=performance.now();
const outcome={stage:'G2',synthetic:true,oracleContract:ORACLE_CONTRACT,passed:false,startedAt:new Date().toISOString(),
  scope:'32 necessary synthetic API cases, then at most one observational legacy Node query; no browser parity, capacity, or ES equivalence',
  searchRequestBudget:33,legacySearchRequests:0,
  plannedCases:{ms1:MS1_CASES.map(x=>x.id),small:SMALL_CASES.map(x=>x.id)},
  phases:[],cases:[],cleanup:[],freezeBefore:null,freezeAfter:null};
const watchdog=setTimeout(()=>abort.abort(Error('RUNNER_DEADLINE_880S')),880000);
const onSignal=signal=>abort.abort(Error('SIGNAL_'+signal));
process.on('SIGTERM',onSignal);process.on('SIGINT',onSignal);
let frozen=null,artifactInventory=null,rawFd=null,searchRequests=0;
const safeError=e=>({name:e?.name??'Error',message:e?.message??String(e),stack:e?.stack});
async function hash(filename){const h=createHash('sha256');for await(const b of createReadStream(filename))h.update(b);return h.digest('hex');}
async function verifyFreeze(){
  assert(frozen&&Array.isArray(frozen.files)&&frozen.files.length>0,'freeze.files must be [{absolutePath,sha256}]');
  const seen=new Set(),checks=[];
  for(const f of frozen.files){
    assert(typeof f.absolutePath==='string'&&path.isAbsolute(f.absolutePath)&&/^[a-f0-9]{64}$/.test(f.sha256),'FREEZE_SCHEMA');
    assert(!seen.has(f.absolutePath),'FREEZE_DUPLICATE');seen.add(f.absolutePath);
    const actual=await hash(f.absolutePath);checks.push({absolutePath:f.absolutePath,expected:f.sha256,actual,matches:actual===f.sha256});
  }
  return {at:new Date().toISOString(),passed:checks.every(x=>x.matches),checks};
}
async function verifyArtifact(label){
  const began=performance.now(),base=path.join(run,'artifacts/artifact-100000');
  const result={passed:false,checkedFiles:0,bytes:0,actualFiles:0,inventorySha256:artifactInventory.sha256};
  outcome[label]=result;
  assert(Array.isArray(artifactInventory.files)&&artifactInventory.files.length>0,'ARTIFACT_INVENTORY_SCHEMA');
  const seen=new Set();
  for(const f of artifactInventory.files){
    abort.signal.throwIfAborted();
    assert(typeof f.path==='string'&&!path.isAbsolute(f.path)&&!f.path.includes('\\')&&f.path.split('/').every(p=>p&&p!=='.'&&p!=='..'),'ARTIFACT_PATH');
    assert(!seen.has(f.path)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&/^[a-f0-9]{64}$/.test(f.sha256),'ARTIFACT_DESCRIPTOR');seen.add(f.path);
    const filename=path.join(base,f.path),s=await lstat(filename);
    assert(s.isFile()&&!s.isSymbolicLink(),'ARTIFACT_TYPE:'+f.path);assert.equal(s.size,f.bytes,'ARTIFACT_BYTES:'+f.path);
    assert.equal(await hash(filename),f.sha256,'ARTIFACT_HASH:'+f.path);result.checkedFiles++;result.bytes+=s.size;
  }
  async function walk(folder){
    for await(const entry of await opendir(folder)){
      abort.signal.throwIfAborted();
      const filename=path.join(folder,entry.name);
      if(entry.isDirectory())await walk(filename);
      else{assert(entry.isFile(),'ARTIFACT_SPECIAL_FILE');assert(seen.has(path.relative(base,filename)),'ARTIFACT_UNLISTED_FILE');result.actualFiles++;}
    }
  }
  await walk(base);assert.equal(result.actualFiles,seen.size,'ARTIFACT_FILE_COUNT');
  result.passed=true;result.elapsedMs=performance.now()-began;return result;
}
function append(row){writeSync(rawFd,JSON.stringify(row)+'\n');fsyncSync(rawFd);}
function kill(child,signal){try{process.kill(-child.pid,signal);}catch(e){if(e.code!=='ESRCH')throw e;}}
async function stop(child){
  if(child.stopped)return child.stopped;
  child.stopped=(async()=>{
    const before=performance.now();let escalated=false,error=null;
    try{
      kill(child,'SIGTERM');
      const settled=await Promise.race([child.exited.then(()=>true),delay(2000).then(()=>false)]);
      // Kill the process group even if its leader exited: grandchildren may live.
      escalated=!settled;kill(child,'SIGKILL');
      const receipt=await Promise.race([child.exited,delay(2000).then(()=>{throw Error('CHILD_EXIT_NOT_OBSERVED');})]);
      return {label:child.label,pid:child.pid,...receipt,escalated,elapsedMs:performance.now()-before};
    }catch(e){error=safeError(e);return {label:child.label,pid:child.pid,error,escalated,elapsedMs:performance.now()-before};}
  })();
  return child.stopped;
}
function launch(label,args){
  abort.signal.throwIfAborted();
  const stdout=openSync(path.join(root,label+'.stdout.log'),'wx'),stderr=openSync(path.join(root,label+'.stderr.log'),'wx');
  let readyResolve,readyReject,line='';
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
  const proc=spawn(process.execPath,args,{cwd:root,detached:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
  const child={proc,pid:proc.pid,label,ready,stopped:null};children.add(child);
  proc.stdout.on('data',chunk=>{
    writeSync(stdout,chunk);line+=chunk.toString('utf8');
    if(line.length>131072){line=line.slice(-65536);}
    let end;
    while((end=line.indexOf('\n'))>=0){
      const text=line.slice(0,end);line=line.slice(end+1);
      try{const message=JSON.parse(text);if(message.ready===true&&typeof message.url==='string')readyResolve(message);}catch{}
    }
  });
  proc.stderr.on('data',chunk=>writeSync(stderr,chunk));
  child.exited=new Promise(resolve=>{
    let spawnError=null;proc.once('error',error=>{spawnError=safeError(error);readyReject(error);});
    proc.once('close',(code,signal)=>{
      fsyncSync(stdout);fsyncSync(stderr);closeSync(stdout);closeSync(stderr);
      readyReject(Error('SERVER_EXIT_BEFORE_READY'));
      resolve({code,signal,...(spawnError?{spawnError}:{})});
    });
  });
  return child;
}
async function interrupted(promise){
  abort.signal.throwIfAborted();let listener;
  const interruption=new Promise((_,reject)=>{listener=()=>reject(abort.signal.reason);abort.signal.addEventListener('abort',listener,{once:true});});
  try{return await Promise.race([promise,interruption]);}finally{abort.signal.removeEventListener('abort',listener);}
}
async function command(label,args){
  const before=performance.now(),child=launch(label,args),result=await interrupted(child.exited);
  outcome.phases.push({label,elapsedMs:performance.now()-before,...result});
  // Reap possible detached descendants even when the command leader succeeded.
  const cleanup=await stop(child);outcome.cleanup.push(cleanup);children.delete(child);
  assert(!cleanup.error,'COMMAND_CLEANUP_FAILED');assert.equal(result.code,0,label+'_FAILED');assert(!result.spawnError,label+'_SPAWN_FAILED');
}
async function markOperation(id){
  const temporary=watch+'.tmp';
  await writeFile(temporary,JSON.stringify({id,kind:'query',startedAtMs:Date.now()})+'\n',{flag:'wx'});
  await rename(temporary,watch);
}
async function clearOperation(){try{await unlink(watch);}catch(e){if(e.code!=='ENOENT')throw e;}}
async function query(group,test,origin,validate){
  assert(++searchRequests<=32,'SEARCH_REQUEST_BUDGET');
  const request=caseRequest(test,origin),row={group,id:test.id,request,expected:test.expected,startedAt:new Date().toISOString()};
  const before=performance.now();let timedOut=false;
  await markOperation(group+':'+test.id);
  try{
    const deadline=AbortSignal.timeout(5000),signal=AbortSignal.any([abort.signal,deadline]);
    const response=await fetch(request.url,{headers:request.headers,redirect:'error',signal});
    const chunks=[];let bytes=0;
    for await(const chunk of response.body){bytes+=chunk.length;if(bytes>2*1024*1024)throw Error('RESPONSE_SIZE_LIMIT');chunks.push(chunk);}
    const text=Buffer.concat(chunks,bytes).toString('utf8');let body;
    try{body=JSON.parse(text);}catch{row.invalidJson=text;throw Error('RESPONSE_NOT_JSON');}
    row.response={status:response.status,body};row.bytes=bytes;
    row.validator=validate(test,row.response);
  }catch(error){
    timedOut=error.name==='TimeoutError'||performance.now()-before>=5000;
    row.error=safeError(error);row.validator={passed:false,issues:[timedOut?'QUERY_TIMEOUT':error.message]};
  }finally{
    row.elapsedMs=performance.now()-before;
    if(row.elapsedMs>=5000){
      timedOut=true;
      row.validator={passed:false,issues:[...(row.validator?.issues??[]),'QUERY_DEADLINE_EXCEEDED']};
    }
    // Preserve timed-out marker for the external controller; HTTP cancellation
    // alone is not evidence that synchronous WASM stopped.
    if(!timedOut)await clearOperation();
    outcome.cases.push(row);append(row);
    await writeFile(path.join(root,'cases',String(searchRequests).padStart(2,'0')+'-'+test.id+'.json'),JSON.stringify(row,null,2)+'\n',{flag:'wx'});
  }
  assert(row.validator.passed,'CASE_FAILED:'+group+':'+test.id);
  return row;
}
async function suite(group,artifact,core,cases,validate){
  const child=launch('serve-'+group,[path.join(src,'serve.mjs'),api,artifact,core]);
  let timer;
  try{
    const ready=await interrupted(Promise.race([child.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SERVER_READY_TIMEOUT_30S')),30000);})]));
    clearTimeout(timer);
    const url=new URL(ready.url);assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');assert(url.port,'READY_URL_PORT');
    outcome.phases.push({label:'ready-'+group,pid:child.pid,url:ready.url,at:new Date().toISOString()});
    const records=[];
    for(const test of cases){
      records.push(await query(group,test,ready.url,validate));
      if(group==='ms1'&&records.some(r=>r.id==='ms1-common-huge-page1')&&test.id==='ms1-common-huge-page2'){
        const validation=validateMs1Pagination(records);outcome.pagination=validation;append({group,type:'pagination',validator:validation});
        assert(validation.passed,'PAGINATION_FAILED');
      }
    }
  }finally{
    clearTimeout(timer);const cleanup=await stop(child);outcome.cleanup.push(cleanup);children.delete(child);
    assert(!cleanup.error,'SERVER_CLEANUP_FAILED');
  }
}

try{
  assert.equal(MS1_CASES.length,12);assert.equal(SMALL_CASES.length,20);
  assert((await stat(artifacts)).isDirectory(),'controller must create fresh artifacts root');
  await mkdir(path.join(root,'cases'));
  rawFd=openSync(path.join(root,'cases.ndjson'),'wx');
  frozen=JSON.parse(await readFile(path.join(root,'freeze.json'),'utf8'));
  outcome.freezeBefore=await verifyFreeze();assert(outcome.freezeBefore.passed,'FREEZE_BEFORE_FAILED');
  const control=JSON.parse(await readFile(path.join(run,'evidence/g1-control/result.json'),'utf8'));
  const verified=JSON.parse(await readFile(path.join(run,'evidence/g1-verification.json'),'utf8'));
  assert.equal(control.status,'passed');assert.deepEqual(control.remainingPids,[]);assert.deepEqual(control.cleanupErrors,[]);
  assert.equal(verified.verified,true);assert.equal(verified.stage,'G1');assert.equal(verified.N,100000);
  outcome.g1Gate={controllerPassed:true,cleanupEmpty:true,verified:true,inventorySha256:verified.inventorySha256};
  const inventoryRaw=await readFile(path.join(run,'evidence/artifact-inventory.json'));
  const inventorySha256=createHash('sha256').update(inventoryRaw).digest('hex');
  assert.equal(inventorySha256,verified.inventorySha256,'G1_INVENTORY_PIN');
  artifactInventory={...JSON.parse(inventoryRaw),sha256:inventorySha256};
  await verifyArtifact('artifactFreezeBefore');
  await cp(path.join(root,'api-template'),api,{recursive:true,errorOnExist:true,force:false});
  await command('next-build',[path.join(root,'node_modules/next/dist/bin/next'),'build',api,'--webpack']);
  await command('small-build',[path.join(src,'small-build.mjs'),small]);
  await suite('ms1',path.join(run,'artifacts/artifact-100000'),pathToFileURL(path.join(run,'src/ms1-api-lab/core.mjs')).href,MS1_CASES,validateMs1Response);
  await suite('small',small,pathToFileURL(path.join(src,'small-core.mjs')).href,SMALL_CASES,validateSmallResponse);
  outcome.legacySearchRequests=null; // Unknown until the child writes its receipt.
  await command('legacy-node',[path.join(src,'legacy-node.mjs'),path.join(root,'legacy'),path.join(root,'legacy-node-result.json'),watch]);
  outcome.legacyObservation=JSON.parse(await readFile(path.join(root,'legacy-node-result.json'),'utf8'));
  assert.equal(outcome.legacyObservation.searchRequests,1,'LEGACY_REQUEST_BUDGET');
  assert.equal(outcome.legacyObservation.completed,true,'LEGACY_PROGRAM_INCOMPLETE');
  outcome.legacySearchRequests=1;
  outcome.passed=true;
}catch(error){outcome.error=safeError(error);process.exitCode=1;}
finally{
  for(const child of children){const cleanup=await stop(child);outcome.cleanup.push(cleanup);if(cleanup.error){outcome.passed=false;process.exitCode=1;}}
  try{if(outcome.artifactFreezeBefore?.passed)await verifyArtifact('artifactFreezeAfter');}
  catch(error){outcome.artifactFreezeAfter={...outcome.artifactFreezeAfter,passed:false,error:safeError(error)};outcome.passed=false;process.exitCode=1;}
  try{if(frozen){outcome.freezeAfter=await verifyFreeze();if(!outcome.freezeAfter.passed){outcome.passed=false;process.exitCode=1;}}}
  catch(error){outcome.freezeAfter={passed:false,error:safeError(error)};outcome.passed=false;process.exitCode=1;}
  clearTimeout(watchdog);process.off('SIGTERM',onSignal);process.off('SIGINT',onSignal);
  if(rawFd!==null)closeSync(rawFd);
  outcome.unexecutedCases=Object.entries(outcome.plannedCases).flatMap(([group,ids])=>ids.filter(id=>!outcome.cases.some(row=>row.group===group&&row.id===id)).map(id=>({group,id})));
  outcome.apiSearchRequests=searchRequests;
  outcome.searchRequests=outcome.legacySearchRequests===null?null:searchRequests+outcome.legacySearchRequests;
  outcome.elapsedMs=performance.now()-start;outcome.finishedAt=new Date().toISOString();
  await writeFile(path.join(root,'results.json'),JSON.stringify(outcome,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({stage:'G2',passed:outcome.passed,searchRequests:outcome.searchRequests,apiSearchRequests:searchRequests,error:outcome.error?.message}));
}
