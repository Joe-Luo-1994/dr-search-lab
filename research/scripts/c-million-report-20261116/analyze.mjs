import fs from 'node:fs';
const root='evidence/c-million-20261116';
const read=p=>JSON.parse(fs.readFileSync(root+'/'+p,'utf8'));
const lines=p=>fs.readFileSync(root+'/'+p,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const result=read('fallback-1/load/result.json'), raw=lines('fallback-1/load/raw.ndjson');
const resources=lines('fallback-1/load/resources.ndjson'), statuses=lines('fallback-1/load/status.ndjson');
const events=lines('fallback-1/events.ndjson');
const updateDownload=events.find(e=>e.type==='download-end'&&e.version==='v2');
const updateRows=raw.filter(r=>r.phase==='consumer-bulk-update'&&['web','consumer','bulk'].includes(r.lane)&&(r.lane!=='web'||r.record==='journey'||r.record==='arrival'));
const updateObservation={download:updateDownload??null,activation:events.find(e=>e.type==='activated')??null,
 downloadOverlap:updateDownload?updateRows.filter(r=>r.sentEpochMs<updateDownload.downloadEndedMs&&r.doneEpochMs>updateDownload.downloadStartedMs).length:null,
 sent:updateRows.filter(r=>r.sentMs!=null).length,successful:updateRows.filter(r=>r.check==='ok').length,canceled:updateRows.filter(r=>r.check==='aborted-after-stop').length,
 source:'Derived from durable download-end event and raw terminal lane rows; failed update response has no success receipt. Original result overlap=0 cannot establish absence of overlap.'};
const p95=xs=>xs.length?[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*.95)-1]:null;
const max=xs=>xs.length?Math.max(...xs):null;
const stages=result.stages.map(s=>{
 const rows=raw.filter(r=>r.phase===s.name), resource={};
 for(const name of ['reader','minio']){
  const samples=resources.filter(r=>r.ms>=s.startMs&&r.ms<=s.startMs+s.elapsedMs&&r.groups[name]);
  const first=samples[0],last=samples.at(-1),a=first?.groups[name],b=last?.groups[name];
  resource[name]={samples:samples.length,sampledPeakBytes:max(samples.map(r=>r.groups[name].current)),
   sampledWindowMs:first&&last?last.ms-first.ms:null,averageCpuCores:a&&b?(b.cpu.usage_usec-a.cpu.usage_usec)/((last.ms-first.ms)*1000):null,
   throttledMs:a&&b?(b.cpu.throttled_usec-a.cpu.throttled_usec)/1000:null,
   memoryMaxEvents:a&&b?b.events.max-a.events.max:null,oom:a&&b?b.events.oom-a.events.oom:null,
   ioAvailable:samples.some(r=>!!r.groups[name].io)};
 }
 const ss=statuses.filter(r=>r.ms>=s.startMs&&r.ms<=s.startMs+s.elapsedMs);
 const byQuery=Object.fromEntries([...new Set(rows.filter(r=>r.lane==='consumer').map(r=>r.queryId))].filter(Boolean).map(q=>{
  const rs=rows.filter(r=>r.lane==='consumer'&&r.queryId===q);return[q,{count:rs.length,ok:rs.filter(r=>r.check==='ok').length,p95Ms:p95(rs.map(r=>r.scheduledToDoneMs))}];
 }));
 return {...s,resource,byQuery,observations:{maxQueue:max(ss.map(r=>r.queue??0)),eventLoopP95MaxMs:max(ss.map(r=>r.metrics?.eventLoop?.p95Ms).filter(Number.isFinite)),eventLoopMaxMs:max(ss.map(r=>r.metrics?.eventLoop?.maxMs).filter(Number.isFinite))},
  rawCounts:{journeys:rows.filter(r=>r.record==='journey').length,http:rows.filter(r=>r.record==='http').length},
  laneRecalculation:Object.fromEntries(Object.keys(s.lanes).map(lane=>{const rs=rows.filter(r=>r.lane===lane&&(lane!=='web'||r.record==='journey'||r.record==='arrival'));return[lane,{terminal:rs.length,fulfilled:rs.filter(r=>r.check==='ok').length,canceled:rs.filter(r=>r.check==='aborted-after-stop').length,p95Successful:p95(rs.filter(r=>r.check==='ok').map(r=>r.scheduledToDoneMs))}]}))};
});
const a={result,stages,updateObservation,rawRows:raw.length,statusRows:statuses.length,resourceRows:resources.length,
 build:read('fixture-1000000/build-report.json'),publish:read('formal-1/publish.json'),ready:read('fallback-1/ready.json'),
 originalFailure:read('formal-1/ready-failure.json'),freezeOriginal:read('formal-1/freeze-after.json'),freezeFallback:read('fallback-1/freeze-after.json'),
 resourceMethod:'Samples wholly within phase incl drain; cpu/event deltas span first-last samples, not exact phase endpoints. Peak includes file cache; io empty is unavailable. Status pool timing buffers overlap and are not used as unique per-phase jobs.',
 note:'Original freeze was after readiness failure, for provenance only. Fallback freeze before load, after ready. Synthetic short windows; no A/B or production claim.'};
fs.writeFileSync(root+'/analysis.json',JSON.stringify(a,null,2));
console.log(JSON.stringify({stages:stages.map(s=>({name:s.name,qualifies:s.qualifies,lanes:s.laneRecalculation,resource:s.resource})),stop:result.stop,unexecuted:result.unexecutedPhases},null,2));
