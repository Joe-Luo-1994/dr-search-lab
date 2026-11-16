import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='evidence/c-scale-20261116';const checks=[];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const p95=xs=>xs.length?[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*.95)-1]:null;
for(const attempt of ['r1','r2']){
 const dir=root+'/'+attempt;if(!fs.existsSync(dir+'/load/result.json'))continue;
 const r=read(dir+'/load/result.json'),raw=fs.readFileSync(dir+'/load/raw.ndjson','utf8').trim().split('\n').map(JSON.parse);
 const tasks=raw.filter(x=>x.record==='journey'||x.record==='arrival'||(x.record==='http'&&['reading','consumer','bulk'].includes(x.lane)));
 let total=0;
 for(const phase of r.stages)for(const [lane,s]of Object.entries(phase.lanes)){
  const xs=tasks.filter(x=>x.phase===phase.name&&x.lane===lane),ok=xs.filter(x=>x.check==='ok');
  assert.equal(xs.length,s.offered,phase.name+'/'+lane);assert.equal(new Set(xs.map(x=>x.sequence)).size,xs.length);
  assert.equal(ok.length,s.fulfilled);assert.equal(xs.filter(x=>x.sentMs!==null).length,s.sent);
  assert.equal(p95(ok.map(x=>x.scheduledToDoneMs)),s.successfulP95Ms);
  assert.equal((s.offered-s.fulfilled)/s.offered,s.failureFraction);total+=xs.length;
 }
 const freeze=read(dir+'/freeze-after.json'),cleanup=read(dir+'/cleanup.json');
 assert.deepEqual(freeze.mismatches,[]);assert.deepEqual(cleanup.listeners,[]);
 assert(Object.values(cleanup.installed).every(x=>x.matches));
 if(r.allTargetPhasesQualified){assert.equal(r.stages.length,r.phasePlan.length);assert(r.stages.every(x=>x.qualifies));const u=r.stages.at(-1).updateEvidence;assert(u.evidenceComplete&&u.retirementComplete);}
 checks.push({attempt,verifiedPhaseLaneCountsAndP95:true,taskTotal:total,httpRows:raw.filter(x=>x.record==='http').length,rawRows:raw.length,freezeChecked:freeze.checked,cleanupVerified:true,allTargetPhasesQualified:r.allTargetPhasesQualified});
}
fs.writeFileSync(root+'/verification.json',JSON.stringify({passed:true,checks,scope:'independent recomputation from preserved raw task rows plus cleanup receipts; no new load'},null,2));console.log(JSON.stringify(checks,null,2));
