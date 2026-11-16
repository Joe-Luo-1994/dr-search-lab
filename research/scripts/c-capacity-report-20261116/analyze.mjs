import fs from 'node:fs';
const root='evidence/c-capacity-20261115';
const read=p=>JSON.parse(fs.readFileSync(root+'/'+p,'utf8'));
const result=read('formal-1/load/result.json');
const resources=fs.readFileSync(root+'/formal-1/load/resources.ndjson','utf8').trim().split('\n').map(JSON.parse);
const raw=fs.readFileSync(root+'/formal-1/load/raw.ndjson','utf8').trim().split('\n').map(JSON.parse);
const stages=result.stages.map(stage=>{
 const samples=resources.filter(s=>s.ms>=stage.startedMs&&s.ms<=stage.endedMs);
 const groups={};
 for(const name of ['reader','minio']){
  const first=samples[0],last=samples.at(-1);
  groups[name]={sampleCount:samples.length,sampledPeakBytes:Math.max(...samples.map(s=>s.groups[name].current)),
   sampledFilePeakBytes:Math.max(...samples.map(s=>s.groups[name].memory.file)),
   sampledAnonPeakBytes:Math.max(...samples.map(s=>s.groups[name].memory.anon)),
   averageCores:first&&last?(last.groups[name].cpu.usage_usec-first.groups[name].cpu.usage_usec)/1000/(last.ms-first.ms):null,
   throttledUsecDelta:first&&last?last.groups[name].cpu.throttled_usec-first.groups[name].cpu.throttled_usec:null};
 }
 return {...stage,resources:groups};
});
const events=fs.readFileSync(root+'/formal-1/events.ndjson','utf8').trim().split('\n').map(JSON.parse);
const update=result.updates?.[0]?.result?.json;
const output={scope:'C only, synthetic hot working set; no A/B comparison or production SLO',
 fatal:result.fatal,elapsedMs:result.elapsedMs,stages,updates:result.updates,events,
 rawCount:raw.length,statusCounts:Object.fromEntries([...new Set(raw.map(x=>x.status))].map(s=>[String(s),raw.filter(x=>x.status===s).length])),
 queryKinds:[...new Set(raw.filter(x=>x.type==='search').map(x=>x.query))],
 naturalActivationCrossings:update?raw.filter(r=>r.phase==='update-mixed'&&r.sentEpochMs<update.activatedMs&&r.doneEpochMs>=update.activatedMs).length:null,
 sampledCombinedPeakBytes:Math.max(...resources.map(s=>s.groups.reader.current+s.groups.minio.current)),
 firstSample:result.firstSample,lastSample:result.lastSample,
 builder:read('fixture-100000-oracle2/build-report.json'),publish:read('formal-1/publish.json'),freeze:read('freeze-after.json')};
fs.writeFileSync(root+'/analysis.json',JSON.stringify(output,null,2),{flag:'wx'});
console.log(JSON.stringify({fatal:output.fatal,stages:stages.map(s=>({name:s.name,qualifies:s.qualifies,p95:s.scheduledToDoneP95Ms,refused:s.refused,timeouts:s.timeouts,late:s.generatorLate,readerMiB:s.resources.reader.sampledPeakBytes/2**20,cores:s.resources.reader.averageCores})),update,rawCount:output.rawCount,naturalActivationCrossings:output.naturalActivationCrossings},null,2));
