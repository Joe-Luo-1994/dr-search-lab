"""Read-only summary of observed D2 trace and the covered query resource window."""
from pathlib import Path
import json,sys
root=Path(sys.argv[1]);out=root/'analysis.json'
def rows(p):return [json.loads(s) for s in p.read_text().splitlines() if s.strip()]
trace=[]
for p in (root/'traces').glob('*.ndjson'):trace+=rows(p)
trace.sort(key=lambda x:(x['pid'],x['seq']))
request=next(x for x in trace if x['event']=='next.request')
runner=rows(root/'runner.ndjson');begin=next(x['atMs'] for x in runner if x['stage']=='query.begin')
end=next((x['atMs'] for x in runner if x['stage']=='query.end'),None)
metrics=rows(root/'control/metrics.ndjson')
samples=[m for m in metrics if m['kind']=='group' and m['at']*1000>=begin and (end is None or m['at']*1000<=end)]
window={'sampleCount':len(samples),'queryBeginWallMs':begin,'queryEndWallMs':end,'coverage':'only observed in-query samples; no extrapolation to missed endpoints'}
if len(samples)>=2:
 a,b=samples[0],samples[-1];seconds=b['at']-a['at']
 window.update(firstOffsetMs=a['at']*1000-begin,lastOffsetMs=b['at']*1000-begin,coveredSeconds=seconds,
    cpuSeconds=(b['cpu']['usage_usec']-a['cpu']['usage_usec'])/1e6,
    averageCores=(b['cpu']['usage_usec']-a['cpu']['usage_usec'])/1e6/seconds,
    throttleEvents=b['cpu']['nr_throttled']-a['cpu']['nr_throttled'],throttledUsec=b['cpu']['throttled_usec']-a['cpu']['throttled_usec'],
    maxSampledMemoryCurrent=max(m['memoryCurrent'] for m in samples),memoryEventsDelta={k:b['memoryEvents'][k]-a['memoryEvents'][k] for k in b['memoryEvents']},
    reclaimDeltas={k:b['memoryStat'].get(k,0)-a['memoryStat'].get(k,0) for k in ['pgscan','pgsteal','workingset_refault_file','workingset_refault_anon','pgmajfault']})
control=json.loads((root/'control/result.json').read_text())
data={'scope':'D2 partial observations, not throughput/capacity or original runtime equivalence',
 'reason':control['reason'],'controllerStatus':control['status'],'cleanupErrors':control['cleanupErrors'],'remainingPids':control['remainingPids'],
 'queryWindow':window,'traceCount':len(trace),'traceBytes':sum(p.stat().st_size for p in (root/'traces').glob('*.ndjson')),
 'events':[{'event':x['event'],'relativeToRequestMs':x['monoMs']-request['monoMs'],'details':x['details']} for x in trace],
 'lastObservedObserverCost':trace[-1]['observer'],'lastEventOwnCost':'unknown unless a later event records it'}
if (root/'case.json').exists():data['case']=json.loads((root/'case.json').read_text())
with out.open('x') as f:json.dump(data,f,indent=2,ensure_ascii=False)
print(json.dumps({'reason':data['reason'],'traceCount':len(trace),'lastEvent':trace[-1]['event'],'queryWindow':window},ensure_ascii=False))
