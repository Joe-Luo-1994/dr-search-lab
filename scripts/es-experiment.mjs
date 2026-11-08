import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { controlES } from './es-control.mjs';
import { remote, indexName } from '../lib/engines.mjs';
import { provisionElastic, verifyElasticRelease } from '../lib/es-release.mjs';
import { newState, searchLab, control, readPage } from '../lib/lab.mjs';
import { readDataset, readManifest } from '../lib/artifacts.mjs';
import { users } from '../lib/dataset.mjs';

const runId = Date.now().toString(36);
process.env.LAB_INDEX_PREFIX = `drlab-it-${runId}-`;
const primary = 'http://127.0.0.1:19200', dr = 'http://127.0.0.1:19300';
const report = { runId, startedAt: new Date().toISOString(), node: process.version, prefix: process.env.LAB_INDEX_PREFIX, synthetic: true, checks: [], phases: [], limitations: [
  `Two native ES nodes on one ${process.platform}/${process.arch} host, 512MiB Java heap each; not independent regions for real disaster protection.`,
  'Shared local filesystem snapshot repository; not MinIO or cross-region replication.',
  'Function-level application flow and mock ReBAC; not formal consumer API compatibility.',
  'Recovery timing excludes incident detection, DNS, authentication, network transfer and human decisions; NOT RTO.',
  'A write block plus digest is an integrity guard, not protection against a privileged administrator changing data.'
] };
async function stage(name, fn) {
  console.log(`START ${name}`); const t=performance.now();
  try { const detail = await fn(); report.phases.push({ name, ms: performance.now()-t, status: 'passed', detail }); console.log(`PASS ${name}`); return detail; }
  catch(e) { report.phases.push({ name, ms: performance.now()-t, status: 'failed', error: e.message }); throw e; }
}
async function native(action, instance) {
  return controlES(action, instance);
}
async function waitReady(base, name) {
  const deadline=Date.now()+120000;
  while(Date.now()<deadline) {
    try { const r=await fetch(base,{signal:AbortSignal.timeout(1500)}); const d=await r.json(); if(r.ok && d.name===`drlab-${name}`) return d; }
    catch {}
    await new Promise(r=>setTimeout(r,1000));
  }
  throw new Error(`${name} readiness timeout`);
}
async function ensureNode(base, name) {
  try { const r=await fetch(base,{signal:AbortSignal.timeout(1500)}); const d=await r.json(); assert.equal(d.name,`drlab-${name}`); }
  catch(e) { if(e.code==='ERR_ASSERTION') throw e; await native('start',name); }
  const info=await waitReady(base,name); await native('status',name); return info;
}
async function collect(state,q) {
  let ids=[]; const first=await searchLab(state,'elasticsearch',{...q,page:1,pageSize:7}); ids.push(...first.hits.map(h=>h.id));
  for(let p=2;p<=Math.ceil(first.total/7);p++) ids.push(...(await searchLab(state,'elasticsearch',{...q,page:p,pageSize:7})).hits.map(h=>h.id));
  assert.equal(new Set(ids).size,ids.length); assert.equal(ids.length,first.total); return ids.sort();
}
async function contract(version) {
  const fixture=await readDataset(version); let combinations=0;
  for(const user of ['alice','bob','admin','guest']) for(const spaceId of ['','ops','restricted']) for(const tagIds of [[],['database'],['database','runbook']]) {
    const s=newState(); s.user=user; s.version=version;
    const expected=fixture.pages.filter(p=>users[user].spaces.includes(p.spaceId)&&(!spaceId||p.spaceId===spaceId)&&tagIds.every(t=>p.tagIds.includes(t))).map(p=>p.id).sort();
    assert.deepEqual(await collect(s,{keyword:'',spaceId,tagIds}),expected); combinations++;
  }
  const s=newState();s.version=version;
  assert((await searchLab(s,'elasticsearch',{keyword:'backup',spaceId:'ops',tagIds:['database','runbook']})).hits.some(h=>h.id==='p01'));
  assert.equal((await searchLab(s,'elasticsearch',{keyword:'quartzfalcon'})).total,0);
  assert.deepEqual((await searchLab(s,'elasticsearch',{keyword:'quartzfalcon',includeAttachments:true})).hits.map(h=>h.id),['p06']);
  assert.equal((await readPage(s,'p01')).id,'p01'); assert.match((await readPage(s,'p01','m-p01')).content,/Synthetic media/);
  await assert.rejects(readPage(s,'p01','m-p04'),e=>e.status===403);
  s.rebacDown=true;
  await assert.rejects(searchLab(s,'elasticsearch',{keyword:'backup'}),e=>e.status===503);
  await assert.rejects(readPage(s,'p01'),e=>e.status===503);
  await assert.rejects(readPage(s,'p01','m-p01'),e=>e.status===503);
  report.checks.push({ name:`${version} common contract`, combinations, passed:true }); return { combinations };
}
try {
  report.manifest=await readManifest();
  report.sourceHashes={};
  for(const file of ['lib/engines.mjs','lib/es-release.mjs','lib/lab.mjs','lib/artifacts.mjs','scripts/es-experiment.mjs','scripts/es-control.mjs', process.platform === 'win32' ? 'scripts/es-native.ps1' : 'scripts/es-native.sh']) report.sourceHashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
  process.env.ELASTICSEARCH_URL=primary;
  report.primary=await stage('primary readiness',()=>ensureNode(primary,'primary'));
  await stage('provision and seal four reference indices',async()=>{
    const releases=[];for(const version of ['v1','v2'])for(const attachments of [false,true])releases.push(await provisionElastic(version,attachments));return releases;
  });
  await stage('primary contract v1',()=>contract('v1'));
  await stage('primary contract v2',()=>contract('v2'));
  await stage('mixed content rejected despite same document count',async()=>{
    const name=indexName('v2',false), document=await remote('elasticsearch',`/${name}/_doc/p01`);
    await remote('elasticsearch',`/${name}/_settings`,{method:'PUT',body:JSON.stringify({'index.blocks.write':false})});
    try {
      await remote('elasticsearch',`/${name}/_doc/p01?refresh=true`,{method:'PUT',body:JSON.stringify({...document._source,body:'MIXED VERSION PAYLOAD'})});
      await remote('elasticsearch',`/${name}/_settings`,{method:'PUT',body:JSON.stringify({'index.blocks.write':true})});
      const state=newState();await assert.rejects(control(state,{action:'publish',version:'v2'}),/actual content mismatch/);assert.equal(state.version,'v1');
    } finally {
      await remote('elasticsearch',`/${name}/_settings`,{method:'PUT',body:JSON.stringify({'index.blocks.write':false})});
      await remote('elasticsearch',`/${name}/_doc/p01?refresh=true`,{method:'PUT',body:JSON.stringify(document._source)});
      await remote('elasticsearch',`/${name}/_settings`,{method:'PUT',body:JSON.stringify({'index.blocks.write':true})});
    }
    await verifyElasticRelease('v2',false); return { rejected:true, oldVersionPreserved:true };
  });
  const before={};
  for(const keyword of ['backup','disaster recovery','資料庫備份','ERR_CONN_RESET']) {
    const r=await searchLab(newState(),'elasticsearch',{keyword,pageSize:100});before[keyword]={total:r.total,ids:r.hits.map(h=>h.id)};
  }
  report.referenceSearch=before;
  const repo=`drlab-${runId}`, snapshot='daily';
  await stage('create filesystem snapshot',async()=>{
    await remote('elasticsearch',`/_snapshot/${repo}`,{method:'PUT',body:JSON.stringify({type:'fs',settings:{location:runId}})});
    const r=await remote('elasticsearch',`/_snapshot/${repo}/${snapshot}?wait_for_completion=true`,{method:'PUT',timeoutMs:120000,body:JSON.stringify({indices:`${process.env.LAB_INDEX_PREFIX}*`,include_global_state:false})});
    assert.equal(r.snapshot.state,'SUCCESS');assert.equal(r.snapshot.shards.failed,0);return r.snapshot;
  });
  report.resourcesPrimary=await remote('elasticsearch','/_nodes/stats/jvm,process,fs');
  await stage('stop primary and verify search fails',async()=>{
    await native('status','primary');await native('stop','primary');
    await assert.rejects(searchLab(newState(),'elasticsearch',{keyword:'backup'}));
    assert.equal((await readPage(newState(),'p01')).id,'p01');
    return { searchFails:true,localReadRemainsAvailable:true };
  });
  const recoveryStart=performance.now();
  process.env.ELASTICSEARCH_URL=dr;
  report.dr=await stage('start independent DR node',()=>ensureNode(dr,'dr'));
  await stage('restore snapshot with primary offline',async()=>{
    await remote('elasticsearch',`/_snapshot/${repo}`,{method:'PUT',body:JSON.stringify({type:'fs',settings:{location:runId,readonly:true}})});
    const restored=await remote('elasticsearch',`/_snapshot/${repo}/${snapshot}/_restore?wait_for_completion=true`,{method:'POST',timeoutMs:120000,body:JSON.stringify({indices:`${process.env.LAB_INDEX_PREFIX}*`,include_global_state:false,include_aliases:false})});
    assert.equal(restored.snapshot.shards.failed,0);
    await remote('elasticsearch',`/_cluster/health?wait_for_status=yellow&timeout=30s`);
    for(const version of ['v1','v2'])for(const attachments of [false,true])await verifyElasticRelease(version,attachments);
    return restored;
  });
  await stage('post-restore IDs and ordering equal original snapshot',async()=>{
    for(const [keyword,expected] of Object.entries(before)) { const r=await searchLab(newState(),'elasticsearch',{keyword,pageSize:100});assert.deepEqual({total:r.total,ids:r.hits.map(h=>h.id)},expected); }
    const s=newState();await control(s,{action:'publish',version:'v2'});assert.equal((await searchLab(s,'elasticsearch',{keyword:'transfermarker'})).total,0);
    assert.equal((await readPage(s,'p01')).id,'p01');assert.match((await readPage(s,'p01','m-p01')).content,/Version v2/);
    return {queries:Object.keys(before).length,searchReadDownload:true};
  });
  report.localRecoveryMs=performance.now()-recoveryStart;
  await stage('DR contract v1',()=>contract('v1'));await stage('DR contract v2',()=>contract('v2'));
  await stage('DR process restart preserves recovered indices',async()=>{
    await native('status','dr');await native('stop','dr');await ensureNode(dr,'dr');
    await verifyElasticRelease('v1',false);assert.deepEqual(await collect(newState(),{keyword:'backup'}),[...before.backup.ids].sort());
    return {passed:true};
  });
  report.resourcesDR=await remote('elasticsearch','/_nodes/stats/jvm,process,fs');report.passed=true;
} catch(e) { report.passed=false;report.error=e.stack;process.exitCode=1;console.error(e); }
finally {
  report.finishedAt=new Date().toISOString();await mkdir('.lab/reports',{recursive:true});
  await writeFile(`.lab/reports/es-experiment-${runId}.json`,JSON.stringify(report,null,2));
  await writeFile('.lab/reports/es-experiment-latest.json',JSON.stringify(report,null,2));
  console.log(`Evidence: .lab/reports/es-experiment-${runId}.json; passed=${report.passed}`);
}
