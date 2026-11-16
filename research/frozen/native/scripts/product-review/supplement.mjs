import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [mode,base,metrics,out]=process.argv.slice(2);if(!['assets','missing-pagefind','corrupt-map'].includes(mode)||!base||!out)throw Error('mode base metrics output.json');
try{await access(out);throw Error('Do not overwrite previous output');}catch(e){if(e.code!=='ENOENT')throw e;}
const fixture=JSON.parse(await readFile(new URL('./fixture.json',import.meta.url),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');const traces=[];
async function get(relative,bytes=false){const start=performance.now();const t={path:relative};traces.push(t);try{const r=await fetch(new URL(relative,base),{headers:{'x-lab-user':'ops'},signal:AbortSignal.timeout(5000),redirect:'error'});const b=Buffer.from(await r.arrayBuffer());Object.assign(t,{status:r.status,elapsedMs:performance.now()-start,bytes:b.length,sha256:hash(b)});if(!bytes)t.body=JSON.parse(b.toString('utf8'));return {status:r.status,body:t.body,bytes:b};}catch(e){t.error=e.message;return {error:e.message};}}
const report={mode,startedAt:new Date().toISOString(),traces};
if(mode==='assets'){
 const before=await (await fetch(metrics)).json();const r=await get('/api/research/search?engine=pagefind&q=runbook&page=1&pageSize=2');const after=await (await fetch(metrics)).json();
 report.assetRequests=after.requests.slice(before.requests.length);const fragments=report.assetRequests.filter(r=>r.path.endsWith('.pf_fragment'));
 report.fragmentGets=fragments.length;report.fragmentBytes=fragments.reduce((n,r)=>n+(r.bytes||0),0);report.totalAssetGets=report.assetRequests.length;report.totalAssetBytes=report.assetRequests.reduce((n,r)=>n+(r.bytes||0),0);report.basicResponsePreserved=r.status===200&&r.body.total===5&&r.body.hits.length===2;
}else if(mode==='missing-pagefind'){
 const s=await get('/api/research/search?engine=sqlite&q=backup&page=1&pageSize=10');const p=await get('/api/research/pages/p01?release=review-v1');const a=await get('/api/research/attachments/a05?release=review-v1',true);const pf=await get('/api/research/search?engine=pagefind&q=backup&page=1&pageSize=10');
 report.sqliteAvailable=s.status===200&&s.body.hits?.some(h=>h.id==='p01');report.pageAvailable=p.status===200&&p.body.content===fixture.pages.find(p=>p.id==='p01').content;report.attachmentAvailable=a.status===200&&hash(a.bytes)===hash(Buffer.from(fixture.pages.find(p=>p.id==='p05').attachments[0].text));report.pagefindExplicitFailure=pf.status===503&&pf.body.error?.code==='SEARCH_UNAVAILABLE'&&pf.body.error?.retryable===true;report.meetsSupplement=report.sqliteAvailable&&report.pageAvailable&&report.attachmentAvailable&&report.pagefindExplicitFailure;
}else{const r=await get('/api/research/search?engine=pagefind&q=runbook&page=1&pageSize=2');report.explicitFailure=r.status===503&&r.body.error?.code==='SEARCH_UNAVAILABLE'&&r.body.error?.retryable===true;}
report.finishedAt=new Date().toISOString();await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,traces:undefined,assetRequests:undefined},null,2));
