// Independent C1 review client: oracle is reviewer-owned fixture + frozen standard-v1.
// This file never imports candidate adapters, indexing, or ranking code.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const [baseArg,outArg]=process.argv.slice(2);
if(!baseArg||!outArg)throw Error('Usage: node review.mjs http://127.0.0.1:PORT new-output-directory');
const base=new URL(baseArg);if(!['127.0.0.1','localhost'].includes(base.hostname))throw Error('Loopback research endpoints only');
const out=path.resolve(outArg);await mkdir(out,{recursive:true});
try {await access(path.join(out,'result.json'));throw Error('Existing result.json must not be overwritten');} catch(e){if(e.code!=='ENOENT')throw e;}
const fixture=JSON.parse(await readFile(new URL('./fixture.json',import.meta.url),'utf8'));
const pages=new Map(fixture.pages.map(p=>[p.id,p]));
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={schema:'c1-review-v1',startedAt:new Date().toISOString(),source:'independent reviewer client; no candidate implementation imports',base:base.origin,standardSha256:hash(await readFile('docs/reviews/two-rounds-2026-11-14/standard-v1.md')),fixtureSha256:hash(await readFile(new URL('./fixture.json',import.meta.url))),engines:[],requests:[]};
async function request(url,user='ops',bytes=false){
 const u=new URL(url,base);assert.equal(u.origin,base.origin,'same-origin follow URL');
 const t=performance.now();const trace={url:u.pathname+u.search,user:user??'missing',startedAt:new Date().toISOString()};report.requests.push(trace);
 try {const r=await fetch(u,{headers:user===null?{}:{'x-lab-user':user},signal:AbortSignal.timeout(5000),redirect:'error'});const raw=Buffer.from(await r.arrayBuffer());Object.assign(trace,{status:r.status,elapsedMs:performance.now()-t,bytes:raw.length,sha256:hash(raw)});
  if(bytes)return {status:r.status,bytes:raw};
  const body=JSON.parse(raw.toString('utf8'));trace.body=body;return {status:r.status,body};
 }catch(e){trace.error=e.message;trace.elapsedMs=performance.now()-t;throw e;}
}
function searchURL(engine,q,page=1,pageSize=10){return '/api/research/search?'+new URLSearchParams({engine,q,page:String(page),pageSize:String(pageSize)});}
function safeHighlight(h,cap){
 assert(Object.hasOwn(h,'highlight'),'highlight field required');
 if(cap==='none'){assert.equal(h.highlight,null);return;}
 assert.equal(cap,'html-mark');assert.equal(typeof h.highlight,'string');assert(h.highlight.length>0);
 assert(!/<(?!\/?mark>)/.test(h.highlight),'only literal mark tags allowed; source markup must be escaped');
 const opens=(h.highlight.match(/<mark>/g)||[]).length, closes=(h.highlight.match(/<\/mark>/g)||[]).length;assert.equal(opens,closes,'balanced mark tags');
}
function contract(r,engine,user='ops',page=1,pageSize=10){
 assert.equal(r.status,200);const b=r.body;
 assert.equal(b.schemaVersion,fixture.schemaVersion);assert.equal(b.release,fixture.release);assert.equal(b.engine,engine);assert.equal(b.page,page);assert.equal(b.pageSize,pageSize);assert.equal(b.totalRelation,'exact');assert(Number.isInteger(b.total)&&b.total>=0);assert(Array.isArray(b.hits));assert(b.hits.length<=pageSize);assert(b.total>=b.hits.length);
 assert(['none','html-mark'].includes(b.capabilities?.highlight));
 for(const h of b.hits){const p=pages.get(h.id);assert(p,'known page ID');assert.equal(p.scope,user);assert.equal(h.title,p.title);assert.equal(h.content,p.content);assert.equal(typeof h.url,'string');assert(h.url.startsWith('/')&&!h.url.startsWith('//'),'relative same-origin URL');const u=new URL(h.url,base);assert.equal(u.searchParams.get('release'),fixture.release,'pinned release URL');safeHighlight(h,b.capabilities.highlight);}
 assert.equal(new Set(b.hits.map(h=>h.id)).size,b.hits.length);return b;
}
function includes(b,ids){for(const id of ids)assert(b.hits.some(h=>h.id===id),`required result ${id}`);}
function error(r,status,code){assert.equal(r.status,status);assert.equal(r.body.error?.code,code);assert.equal(r.body.error?.retryable,false);assert(!JSON.stringify(r.body).includes(pages.get('p06').content),'no restricted body');}
function pageContract(r,id){assert.equal(r.status,200);const b=r.body,p=pages.get(id);assert.equal(b.schemaVersion,fixture.schemaVersion);assert.equal(b.release,fixture.release);assert.equal(b.id,id);assert.equal(b.title,p.title);assert.equal(b.content,p.content);assert(Array.isArray(b.attachments));assert.deepEqual(b.attachments.map(a=>a.id).sort(),p.attachments.map(a=>a.id).sort());for(const a of b.attachments){assert(a.url.startsWith('/')&&!a.url.startsWith('//'));assert.equal(new URL(a.url,base).searchParams.get('release'),fixture.release);}return b;}
for(const engine of ['sqlite','pagefind']){
 const er={engine,tasks:[],extras:[]};report.engines.push(er);const cache={};
 async function task(id,label,fn){const t=performance.now();try{const detail=await fn();er.tasks.push({id,label,status:'pass',elapsedMs:performance.now()-t,detail});}catch(e){er.tasks.push({id,label,status:'fail',elapsedMs:performance.now()-t,error:e.message});}}
 const search=async(q,user='ops',page=1,pageSize=10)=>contract(await request(searchURL(engine,q,page,pageSize),user),engine,user,page,pageSize);
 await task('T01','English recovery document',async()=>{const b=await search('backup');includes(b,['p01']);cache.english=b;return {ids:b.hits.map(h=>h.id)};});
 await task('T02','Contiguous Chinese',async()=>{const b=await search('資料庫備份');assert(b.hits.some(h=>['p01','p03'].includes(h.id)));return {ids:b.hits.map(h=>h.id)};});
 await task('T03','Two-character Chinese',async()=>{const b=await search('備份');includes(b,['p01','p02','p03']);cache.chinese=b;return {ids:b.hits.map(h=>h.id)};});
 await task('T04','Technical error code',async()=>{const b=await search('ERR_CONN_RESET');includes(b,['p04']);});
 await task('T05','Title search',async()=>{includes(await search('Evacuation'),['p12']);});
 await task('T06','Honest zero results',async()=>{const b=await search('absentquartz');assert.equal(b.total,0);assert.deepEqual(b.hits,[]);});
 await task('T07','No cross-scope search disclosure',async()=>{const b=await search('secretcobalt');assert.equal(b.total,0);assert.deepEqual(b.hits,[]);assert(!JSON.stringify(b).includes(pages.get('p06').content));});
 await task('T08','Restricted user can do own task',async()=>{const b=await search('secretcobalt','restricted');assert.equal(b.total,1);assert.deepEqual(b.hits.map(h=>h.id),['p06']);pageContract(await request(b.hits[0].url,'restricted'),'p06');});
 await task('T09','Complete stable pagination',async()=>{const bs=[];for(let page=1;page<=3;page++){const b=await search('runbook','ops',page,2);assert.equal(b.total,5);bs.push(b);}assert.deepEqual(bs.flatMap(b=>b.hits.map(h=>h.id)).sort(),['p01','p07','p08','p09','p10']);const repeat=await search('runbook','ops',1,2);assert.deepEqual(repeat.hits.map(h=>h.id),bs[0].hits.map(h=>h.id));return {pages:bs.map(b=>b.hits.map(h=>h.id))};});
 await task('T10','Page beyond end',async()=>{const b=await search('runbook','ops',4,2);assert.equal(b.total,5);assert.deepEqual(b.hits,[]);});
 await task('T11','Search to original page',async()=>{const b=await search('backup');const h=b.hits.find(h=>h.id==='p01');assert(h);pageContract(await request(h.url),'p01');});
 await task('T12','Search to page to exact attachment bytes',async()=>{const b=await search('amberchecklist');const h=b.hits.find(h=>h.id==='p05');assert(h);const p=pageContract(await request(h.url),'p05');const a=p.attachments.find(a=>a.id==='a05');assert(a);const r=await request(a.url,'ops',true);assert.equal(r.status,200);const expected=Buffer.from(pages.get('p05').attachments[0].text,'utf8');assert.equal(hash(r.bytes),hash(expected));return {bytes:r.bytes.length,sha256:hash(r.bytes)};});
 await task('T13','Direct restricted page rejected',async()=>{error(await request('/api/research/pages/p06?release=review-v1'),403,'FORBIDDEN');});
 await task('T14','Missing identity rejected',async()=>{error(await request(searchURL(engine,'backup'),null),401,'UNAUTHENTICATED');});
 await task('T15','Unknown identity rejected',async()=>{error(await request(searchURL(engine,'backup'),'unknown'),403,'FORBIDDEN');});
 await task('T16','Invalid client input',async()=>{error(await request(searchURL(engine,'backup',0)),400,'INVALID_REQUEST');error(await request(searchURL('unsupported','backup')),400,'INVALID_REQUEST');});
 await task('T17','Unknown release rejected',async()=>{error(await request('/api/research/pages/p01?release=other'),409,'VERSION_UNAVAILABLE');});
 await task('T18','Literal source text and honest highlight capability',async()=>{const b=await search('markertest');includes(b,['p11']);return {capability:b.capabilities.highlight};});
 const html=cache.english?.capabilities.highlight==='html-mark'&&cache.chinese?.capabilities.highlight==='html-mark';
 const decode=s=>s.replace(/<\/?mark>/g,'').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&amp;','&');
 const marked=b=>b?.hits.some(h=>{const pieces=[...(h.highlight||'').matchAll(/<mark>([\s\S]*?)<\/mark>/g)].map(m=>decode(m[1]).trim());return pieces.length>0&&pieces.every(x=>x.length>0&&(h.title+' '+h.content).includes(x));});
 er.extras.push({id:'H01',status:html?(marked(cache.english)&&marked(cache.chinese)?'pass':'fail'):'not-provided',note:'Optional: safe nonempty source-grounded marks in English and Chinese. Basic-level pass does not require H01.'});
 er.basicPassed=er.tasks.length===18&&er.tasks.every(t=>t.status==='pass');er.passedTasks=er.tasks.filter(t=>t.status==='pass').length;
}
report.finishedAt=new Date().toISOString();report.requestsCount=report.requests.length;report.basicPassed=report.engines.every(e=>e.basicPassed);report.claim='C1 synthetic Next HTTP contract only; no production authorization, MinIO, capacity, full DR or consumer acceptance claim';
await writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({basicPassed:report.basicPassed,requestsCount:report.requestsCount,engines:report.engines.map(e=>({engine:e.engine,passedTasks:e.passedTasks,basicPassed:e.basicPassed,failures:e.tasks.filter(t=>t.status!=='pass'),extras:e.extras}))},null,2));
if(!report.basicPassed)process.exitCode=1;
