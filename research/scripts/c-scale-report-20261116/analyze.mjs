import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2]||'evidence/c-scale-20261116';
const rows=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
const result=[];
for(const attempt of ['r1','r2']){
 const dir=path.join(root,attempt);if(!fs.existsSync(path.join(dir,'load/result.json')))continue;
 const r=JSON.parse(fs.readFileSync(path.join(dir,'load/result.json'))),resources=rows(path.join(dir,'load/resources.ndjson')),status=rows(path.join(dir,'load/status.ndjson'));
 const stages=r.stages.map(s=>{
  const samples=resources.filter(x=>x.ms>=s.startMs&&x.ms<=s.startMs+s.elapsedMs);
  const metrics={};for(const name of ['reader','minio']){
   const xs=samples.filter(x=>x.groups[name]);const first=xs[0],last=xs.at(-1);if(!first)continue;
   const a=first.groups[name],z=last.groups[name];metrics[name]={samples:xs.length,averageCpuCores:(z.cpu.usage_usec-a.cpu.usage_usec)/((last.ms-first.ms)*1000),peakObservedBytes:Math.max(...xs.map(x=>x.groups[name].current)),maxEventsDelta:z.events.max-a.events.max,oomDelta:z.events.oom-a.events.oom,oomKillDelta:z.events.oom_kill-a.events.oom_kill,throttledUsecDelta:z.cpu.throttled_usec-a.cpu.throttled_usec};
  }
  const states=status.filter(x=>x.ms>=s.startMs&&x.ms<=s.startMs+s.elapsedMs);
  return {name:s.name,qualifies:s.qualifies,seconds:s.seconds,lanes:s.lanes,resources:metrics,queueMax:states.length?Math.max(...states.map(x=>x.queue)):null,eventLoopMaxMs:states.length?Math.max(...states.map(x=>x.metrics?.eventLoop?.maxMs||0)):null,updateEvidence:s.updateEvidence};
 });
 const raw=rows(path.join(dir,'load/raw.ndjson'));const task=raw.filter(x=>x.record==='journey'||x.record==='arrival'||(x.record==='http'&&['reading','consumer','bulk'].includes(x.lane)));
 result.push({attempt,allTargetPhasesQualified:r.allTargetPhasesQualified,stop:r.stop,thresholdStop:r.thresholdStop,elapsedMs:r.elapsedMs,stages,rawRows:raw.length,statusSamples:status.length,rawRecordKinds:[...new Set(raw.map(x=>x.record??'(none)'))],taskRowDiagnostic:task.length,scope:'phase resources from samples within phase; not production capacity or human operating effort'});
}
const output=path.join(root,'analysis.json');fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result.map(r=>({attempt:r.attempt,allTargetPhasesQualified:r.allTargetPhasesQualified,stop:r.stop,thresholdStop:r.thresholdStop,stages:r.stages.map(s=>({name:s.name,qualifies:s.qualifies,p95:Object.fromEntries(Object.entries(s.lanes).map(([k,v])=>[k,v.successfulP95Ms])),resources:s.resources}))})),null,2));
