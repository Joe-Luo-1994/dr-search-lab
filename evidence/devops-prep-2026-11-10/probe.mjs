// Run from repository root with pinned Node. Uses only a fresh synthetic lab session.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='evidence/devops-prep-2026-11-10';
const report={at:new Date().toISOString(),scope:'Existing Next.js synthetic HTTP API, mock identity/ReBAC, demo media text; not production or binary/MinIO acceptance',checks:[],searches:[],requests:[],observations:[]};
let cookie='';
async function request(route,body){
 const r=await fetch('http://127.0.0.1:3000/api/lab/'+route,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}
 report.requests.push({route,body,status:r.status});return {status:r.status,data};
}
function check(name,fn){try{fn();report.checks.push({name,passed:true})}catch(e){report.checks.push({name,passed:false,error:e.message});throw e}}
async function control(body){const r=await request('control',body);assert.equal(r.status,200);return r.data}
try{
 const initial=await request('status');check('four reference engines ready',()=>assert.equal(initial.data.engines.filter(e=>e.ready).length,4));
 report.observations.push({name:'Lab request without real credentials',user:initial.data.state.user,limitation:'Default mock Alice; not a production authentication implementation.'});
 const cases=[['english',{keyword:'disaster recovery'}],['chinese',{keyword:'資料庫備份'}],['tags',{keyword:'backup',spaceId:'ops',tagIds:['database','runbook']}],['typo',{keyword:'bakcup'}],['code',{keyword:'ERR_CONN_RESET'}],['attachment-on',{keyword:'quartzfalcon',includeAttachments:true}],['attachment-off',{keyword:'quartzfalcon',includeAttachments:false}],['forbidden-space',{keyword:'backup',spaceId:'restricted'}]];
 for(const engine of ['sqlite','minisearch','orama','elasticsearch']){
  for(const [name,q]of cases){const r=await request('search/'+engine,{...q,pageSize:100});check(engine+': '+name+' HTTP',()=>assert.equal(r.status,200));const ids=r.data.hits.map(h=>h.id);report.searches.push({engine,name,total:r.data.total,ids});
   if(name==='tags')check(engine+': tags task p01 and authorized metadata',()=>{assert(ids.includes('p01'));assert(r.data.hits.every(h=>h.spaceId==='ops'&&['database','runbook'].every(t=>h.tagIds.includes(t))))});
   if(name==='code')check(engine+': technical code p05 found',()=>assert(ids.includes('p05')));
   if(name==='attachment-on')check(engine+': extracted attachment p06 found',()=>assert(ids.includes('p06')));
   if(name==='attachment-off'||name==='forbidden-space')check(engine+': '+name+' no hits',()=>assert.equal(r.data.total,0));
  }
 }
 const p=await request('pages/p01');check('page JSON via Next',()=>assert.equal(p.data.id,'p01'));
 const m=await request('pages/p01?mediaId=m-p01');check('demo media HTTP path',()=>{assert.equal(m.status,200);assert(m.data.startsWith('Synthetic media'))});
 const forged=await request('pages/p01?mediaId=m-p04');check('forged media relation rejected',()=>assert.equal(forged.status,403));
 await control({action:'user',user:'guest'});
 for(const engine of ['sqlite','minisearch','orama','elasticsearch']){const r=await request('search/'+engine,{keyword:'backup'});check(engine+': guest denied',()=>assert.equal(r.data.total,0))}
 for(const route of ['pages/p01','pages/p01?mediaId=m-p01']){const r=await request(route);check('guest '+route,()=>assert.equal(r.status,404))}
 await control({action:'user',user:'alice'});await control({action:'rebac',down:true});
 for(const route of ['search/sqlite','pages/p01','pages/p01?mediaId=m-p01']){const r=await request(route,route.startsWith('search')?{keyword:'backup'}:undefined);check('mock ReBAC failure '+route,()=>assert.equal(r.status,503))}
 await control({action:'reset'});
 const old=await request('search/sqlite',{keyword:'transfermarker'});check('stale lineage counterexample present',()=>assert(old.data.hits.some(x=>x.id==='p09')));
 await control({action:'publish',version:'v2'});const after=await request('pages/p09');
 report.observations.push({name:'Unpinned cross-request version',searchVersion:old.data.version,pageAfterPublishStatus:after.status,meaning:'Search V1 p09 then publish V2: page read follows current session version, not search release. Existing demo does not implement pinned operation chains.'});
 check('version transition observation reproduced',()=>assert.equal(after.status,404));
 report.passed=true;
}catch(e){report.passed=false;report.failure=e.stack;process.exitCode=1}
finally{if(cookie){try{await control({action:'reset'})}catch(e){report.cleanupFailure=e.message;process.exitCode=1}}await writeFile(dir+'/http-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,searches:report.searches.length,observations:report.observations,failure:report.failure},null,2))}
