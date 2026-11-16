// Independent reviewer client: no imports from candidate implementation.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {doc,indexOf,idOf,oracle,effectiveSpaces,spaceOf,matches,attachmentText,RELEASE} from './corpus.mjs';
const [mode,base,engine,nArg,out]=process.argv.slice(2);const N=Number(nArg);
if(!['small','capacity'].includes(mode)||!base||!['sqlite','pagefind'].includes(engine)||!Number.isInteger(N)||N<1||!out)throw Error('Usage: review.mjs small|capacity base sqlite|pagefind N out');
await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={schema:'ms1-review-v1',mode,base,engine,N,startedAt:new Date().toISOString(),source:'Independent reviewer HTTP; formula oracle computed outside timing',tasks:[],requests:[],oraclePreparationMs:0,oracleCache:{},limitations:['Synthetic identities only','Local artifact reader; not MinIO','Short closed-loop window, not production SLO or full RP0']};
const oracleCache=new Map();const cases=[];
function key(user,q,spaces){return JSON.stringify([user,q,spaces]);}
function prepare(user,q,spaces){const k=key(user,q,spaces);if(!oracleCache.has(k)){const t=performance.now();const v=oracle(N,user,q,spaces);report.oraclePreparationMs+=performance.now()-t;oracleCache.set(k,v);report.oracleCache[k]=v;}return oracleCache.get(k);}
// All formula enumeration is done before timed HTTP, including mixed-load cases.
for(const user of ['huge','small','pair','multi','many','all','dup','none'])for(const q of ['commonterm','rarebeacon','備份','資料庫備份','ERR_CONN_RESET','absentquartz'])prepare(user,q);
prepare('pair','commonterm',['s0002']);prepare('small','commonterm',['s0000']);
const expectedFor=(user,q,spaces)=>{const v=oracleCache.get(key(user,q,spaces));if(!v)throw Error('Oracle must be prepared before timing');return v;};
function searchPath(q,page=1,pageSize=10,spaces){const params=new URLSearchParams({engine,q,page:String(page),pageSize:String(pageSize)});if(spaces!==undefined)params.set('spaces',spaces.join(','));return '/api/research/search?'+params;}
async function request(url,user){
 const target=new URL(url,base);assert.equal(target.origin,new URL(base).origin,'same-origin URL');
 const trace={path:target.pathname+target.search,user:user??null};const t=performance.now();
 try{const response=await fetch(target,{headers:user===undefined?{}:{'x-lab-user':user},signal:AbortSignal.timeout(5000)});const bytes=Buffer.from(await response.arrayBuffer());trace.elapsedMs=performance.now()-t;trace.status=response.status;trace.bytes=bytes.length;trace.sha256=hash(bytes);try{trace.body=JSON.parse(bytes.toString());}catch{trace.bodyText=bytes.toString();}report.requests.push(trace);return {trace,body:trace.body,bytes,status:response.status};}
 catch(e){trace.elapsedMs=performance.now()-t;trace.error=e.message;trace.timeout=e.name==='TimeoutError'||e.name==='AbortError';report.requests.push(trace);throw e;}
}
function validateSearch(r,user,q,page=1,pageSize=10,spaces){assert.equal(r.status,200);const b=r.body;assert(b);assert(['ms1-v1','c1-v1'].includes(b.schemaVersion));assert.equal(b.release,RELEASE);assert.equal(b.engine,engine);assert.equal(b.page,page);assert.equal(b.pageSize,pageSize);assert.equal(b.totalRelation,'exact');const expected=expectedFor(user,q,spaces);assert.equal(b.total,expected.total,'filtered exact total');assert.equal(b.hits.length,Math.max(0,Math.min(pageSize,expected.total-(page-1)*pageSize)));assert.equal(b.capabilities?.highlight,'none');assert.equal(new Set(b.hits.map(h=>h.id)).size,b.hits.length);
 const allow=effectiveSpaces(user,spaces);for(const h of b.hits){const i=indexOf(h.id);assert(Number.isInteger(i)&&i>=0&&i<N,'valid corpus id');assert(allow.has(spaceOf(i,N)),'authorized space');assert(matches(i,q),'query predicate');const p=doc(i,N);assert.equal(h.title,p.title);assert.equal(h.content,p.content);assert.equal(h.highlight,null);assert.equal(typeof h.url,'string');const link=new URL(h.url,base);assert.equal(link.origin,new URL(base).origin);assert.equal(link.searchParams.get('release'),RELEASE);assert(link.pathname.endsWith('/'+h.id));}return b;}
const firstOrder=new Map();
async function search(user,q,page=1,pageSize=10,spaces){const b=validateSearch(await request(searchPath(q,page,pageSize,spaces),user),user,q,page,pageSize,spaces);const k=JSON.stringify([user,q,page,pageSize,spaces]);const ids=b.hits.map(h=>h.id);if(firstOrder.has(k))assert.deepEqual(ids,firstOrder.get(k),'stable query replay');else firstOrder.set(k,ids);return b;}
async function error(url,user,status,code,retryable){const r=await request(url,user);assert.equal(r.status,status);assert.equal(r.body?.error?.code,code);assert.equal(r.body?.error?.retryable,retryable);return r;}
async function contentChain(){const b=await search('huge','rarebeacon');const h=b.hits.find(h=>h.id===idOf(0));const link=h?.url||`/api/research/pages/${idOf(0)}?release=${RELEASE}`;const r=await request(link,'huge');assert.equal(r.status,200);const d=doc(0,N);assert.equal(r.body.id,d.id);assert.equal(r.body.content,d.content);assert.equal(r.body.title,d.title);assert.equal(r.body.release,RELEASE);assert.equal(r.body.attachments.length,1);const a=await request(r.body.attachments[0].url,'huge');assert.equal(a.status,200);assert.equal(hash(a.bytes),hash(Buffer.from(attachmentText)));return {pageUrl:link,attachmentUrl:r.body.attachments[0].url};}
let stopped=false;
async function task(id,label,fn,{stopOnFail=false}={}){const t=performance.now();try{const detail=await fn();report.tasks.push({id,label,status:'pass',elapsedMs:performance.now()-t,detail});return true;}catch(e){report.tasks.push({id,label,status:'fail',elapsedMs:performance.now()-t,error:e.stack});if(stopOnFail)stopped=true;return false;}finally{await save();}}
async function save(){report.finishedAt=new Date().toISOString();report.requestsCount=report.requests.length;await writeFile(out+'/result.json',JSON.stringify(report,null,2)+'\n');}
if(mode==='small'){
 await task('A01','huge visible set',()=>search('huge','commonterm'));
 await task('A02','small visible set',()=>search('small','commonterm'));
 await task('A03','two-space union',()=>search('pair','commonterm'));
 await task('A04','duplicate and nonexistent grant IDs',()=>search('dup','commonterm'));
 await task('A05','empty grant set is valid empty',()=>search('none','commonterm'));
 await task('A06','unknown authorization source is error',()=>error(searchPath('commonterm'),'unknown',503,'AUTH_UNAVAILABLE',true));
 await task('A07','missing identity',()=>error(searchPath('commonterm'),undefined,401,'UNAUTHENTICATED',false));
 await task('A08','unrecognized identity',()=>error(searchPath('commonterm'),'stranger',403,'FORBIDDEN',false));
 await task('A09','requested intersection within pair',()=>search('pair','commonterm',1,10,['s0002']));
 await task('A10','requested space cannot grant access',()=>search('small','commonterm',1,10,['s0000']));
 await task('A11','complete pagination and stable replay',async()=>{const ids=[];let first;for(let page=1;page<=Math.ceil(N/10);page++){const b=await search('all','commonterm',page);if(page===1)first=b.hits.map(h=>h.id);ids.push(...b.hits.map(h=>h.id));}assert.equal(ids.length,N);assert.equal(new Set(ids).size,N);assert.deepEqual([...ids].sort(),Array.from({length:N},(_,i)=>idOf(i)).sort());const replay=await search('all','commonterm');assert.deepEqual(replay.hits.map(h=>h.id),first);return {uniqueIds:ids.length};});
 await task('A12','past last page',()=>search('all','commonterm',Math.ceil(N/10)+1));
 await task('A13','rare, short Chinese and technical-code predicates',async()=>{for(const q of ['rarebeacon','備份','ERR_CONN_RESET'])await search('all',q);return {queries:3};});
 await task('A14','valid no-result',()=>search('all','absentquartz'));
 await task('A15','interleaved authorization sets',async()=>{const a=await search('small','commonterm');await search('huge','commonterm');const b=await search('small','commonterm');assert.deepEqual(a.hits.map(h=>h.id),b.hits.map(h=>h.id));});
 await task('A16','content attachment chain and direct deny',async()=>{const links=await contentChain();await error(links.pageUrl,'small',403,'FORBIDDEN',false);return links;});
 await task('A17','invalid request inputs',async()=>{await error(searchPath('commonterm',0),'all',400,'INVALID_REQUEST',false);await error('/api/research/search?engine=unsupported&q=commonterm','all',400,'INVALID_REQUEST',false);});
 await task('A18','unsupported release',()=>error(`/api/research/pages/${idOf(0)}?release=wrong`,'huge',409,'VERSION_UNAVAILABLE',false));
 report.basicPassed=report.tasks.length===18&&report.tasks.every(t=>t.status==='pass');
}else{
 const work=[];for(const u of ['huge','small','pair','multi','many','all'])work.push([u,'commonterm',1]);for(const [u,q]of [['small','rarebeacon'],['all','rarebeacon'],['huge','備份'],['all','備份'],['small','ERR_CONN_RESET'],['all','ERR_CONN_RESET'],['all','absentquartz']])work.push([u,q,1]);work.push(['all','commonterm',Math.ceil(N/10)],['all','commonterm',Math.ceil(N/10)+1],['pair','commonterm',1],['small','commonterm',1],['huge','commonterm',1],['small','commonterm',1]);
 for(let i=0;i<work.length&&!stopped;i++){const [u,q,page]=work[i];await task('B'+String(i+1).padStart(2,'0'),`${u}/${q}/page${page}`,async()=>{const b=await search(u,q,page);return {...expectedFor(u,q),page,pageSize:10,returnedIds:b.hits.map(h=>h.id)};},{stopOnFail:true});}
 if(!stopped)await task('B20','body and attachment chain',contentChain,{stopOnFail:true});
 report.sequentialPassed=!stopped;
 if(!stopped){
  // Precomputed oracles above; each client is closed-loop, not a target open-loop QPS.
  const started=performance.now();const requestStart=report.requests.length;let failCount=0;
  const actions=[async()=>search('small','commonterm'),async()=>search('huge','rarebeacon'),async()=>search('all','備份'),async()=>{const r=await request(`/api/research/pages/${idOf(0)}?release=${RELEASE}`,'huge');assert.equal(r.status,200);assert.equal(r.body.content,doc(0,N).content);},async()=>{const r=await request(`/api/research/attachments/a000000000?release=${RELEASE}`,'huge');assert.equal(r.status,200);assert.equal(hash(r.bytes),hash(Buffer.from(attachmentText)));}];
  const outcomes=await Promise.all(Array.from({length:4},async(_,client)=>{const rows=[];for(let i=0;i<20;i++){try{await actions[i%5]();rows.push({client,i,passed:true});}catch(e){failCount++;rows.push({client,i,passed:false,error:e.message});}}return rows;}));
  const samples=report.requests.slice(requestStart);const elapsedMs=performance.now()-started;const elapsedSorted=samples.map(x=>x.elapsedMs).sort((a,b)=>a-b);report.mixed={clients:4,operations:80,windowMs:elapsedMs,completedRequests:samples.length,successfulOperations:80-failCount,failedOperations:failCount,timeouts:samples.filter(r=>r.timeout).length,completionRate:(80-failCount)/80,observedOperationsPerSecond:80/(elapsedMs/1000),p50Ms:elapsedSorted[Math.ceil(elapsedSorted.length*.5)-1],p95Ms:elapsedSorted[Math.ceil(elapsedSorted.length*.95)-1],latencyIncludesFailedRequests:true,withinProvisional2s:elapsedSorted[Math.ceil(elapsedSorted.length*.95)-1]<=2000,outcomes:outcomes.flat()};
 }
 report.capacityStagePassed=report.sequentialPassed&&report.mixed?.failedOperations===0;
 report.stopped=stopped;
}
await save();console.log(JSON.stringify({mode,N,engine,basicPassed:report.basicPassed,capacityStagePassed:report.capacityStagePassed,requests:report.requests.length,failedTasks:report.tasks.filter(t=>t.status==='fail').map(t=>({id:t.id,error:t.error})),mixed:report.mixed&&{p95Ms:report.mixed.p95Ms,failedOperations:report.mixed.failedOperations,timeouts:report.mixed.timeouts}},null,2));
process.exitCode=(mode==='small'?report.basicPassed:report.capacityStagePassed)?0:1;
