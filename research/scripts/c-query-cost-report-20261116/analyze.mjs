import fs from 'node:fs';
const root='evidence/c-query-cost-20261116';
const read=p=>JSON.parse(fs.readFileSync(root+'/'+p,'utf8'));
const r=read('profile/result.json'),plans=read('profile/plan.json');
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const describe=xs=>{const s=[...xs].sort((a,b)=>a-b);return {n:s.length,min:s[0]??null,median:s.length?s[Math.floor(s.length/2)]:null,max:s.at(-1)??null};};
const groups=[...new Set(r.measurements.map(x=>x.queryId))].map(id=>{
 const ms=r.measurements.filter(x=>x.queryId===id),component=key=>ms.map(x=>x.message.timings[key].prepareMs+x.message.timings[key].executeMs);
 const count=component('count'),top10=component('top10'),tags=component('tags'),whole=ms.map(x=>x.message.workerMs);
 const remainder=whole.map((x,i)=>x-count[i]-top10[i]-tags[i]);
 if(remainder.some(x=>x<-.01))throw Error('Negative timing remainder');
 const s=sum(whole),p=plans.plans.find(x=>x.queryId===id)?.message.result;
 return {queryId:id,total:ms[0].message.result.total,rounds:ms.map(x=>x.round),whole:describe(whole),count:describe(count),top10:describe(top10),tags:describe(tags),remainder:describe(remainder),
  aggregateFraction:{count:sum(count)/s,top10:sum(top10)/s,tags:sum(tags)/s,remainder:sum(remainder)/s},
  sameOrderedResults:ms.every(x=>x.exactOrderedReferenceMatch&&x.sourceVerified),countPlan:p?.count,top10Plan:p?.top10,
  countPrepare:describe(ms.map(x=>x.message.timings.count.prepareMs)),top10Prepare:describe(ms.map(x=>x.message.timings.top10.prepareMs))};
});
const total=sum(r.measurements.map(x=>x.message.workerMs));
const aggregate=Object.fromEntries(['count','top10','tags'].map(k=>[k,sum(r.measurements.map(x=>x.message.timings[k].prepareMs+x.message.timings[k].executeMs))/total]));
const resources=fs.readFileSync(root+'/resources.ndjson','utf8').trim().split('\n').map(JSON.parse);
const pidEvidence=r.workers.map(w=>({label:w.label,pid:w.pid,seenInCgroup:resources.some(x=>(x.values['cgroup.procs']??'').split('\n').includes(String(w.pid))),exit:w.exit}));
const analysis={completed:r.completed,failure:r.failure,elapsedMs:r.elapsedMs,groups,aggregate,pidEvidence,
 resourceSampleCount:resources.length,limits:read('limits.json'),freeze:read('freeze-after.json'),completion:read('completion.json'),profileReady:r.profileReady,
 scope:'Single sequential SQL process, 5 samples per shape, no HTTP/pool or throughput claim. Each component includes its own matching/filtering work. Fractions use sums of five samples; medians are not additive.',
 referenceCount:r.referenceCount,measurementCount:r.measurementCount,explainCount:r.explainCount};
fs.writeFileSync(root+'/analysis.json',JSON.stringify(analysis,null,2));
console.log(JSON.stringify({completed:r.completed,failure:r.failure,elapsedMs:r.elapsedMs,aggregate,pidEvidence,groups:groups.map(g=>({id:g.queryId,total:g.total,whole:g.whole,count:g.count.median,top10:g.top10.median,tags:g.tags.median}))},null,2));
