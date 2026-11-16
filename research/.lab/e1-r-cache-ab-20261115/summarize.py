from pathlib import Path
import json, hashlib, collections, subprocess, shutil, datetime
repo=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo')
label='e1-r-cache-ab-20261115'
ev=repo/'evidence'/label
win=Path('/PUBLIC/WINDOWS_WORKSPACE/.lab')/label
read=lambda n:json.loads((ev/n).read_text())
rows=lambda n:[json.loads(x) for x in (ev/n).read_text().splitlines() if x]
r=read('result.json'); jobs=rows('jobs.jsonl'); phases=rows('phases.jsonl'); proxy=rows('proxy.jsonl'); resources=rows('resources.jsonl')
assert r['diagnosticComplete'] and not r.get('failure') and not r.get('fatal') and not r['auditErrors']
assert not r['remainingChildren'] and not r.get('traceOverflow')
expected=['control-L-16384','p1-A-R-16384','p1-B-R-65536','p2-B-R-65536','p2-A-R-16384','p3-A-R-16384','p3-B-R-65536']
assert [c['label'] for c in r['cells']]==expected
starts=[x for x in proxy if x['edge']=='start']; ends=[x for x in proxy if x['edge']=='end']
assert len(starts)==len(ends)==len({x['id'] for x in starts})
assert {x['id'] for x in starts}=={x['id'] for x in ends}
assert read('objects-before.json')==read('objects-after.json')
checks={}
for kind in ('e1-r-diagnostic-20261115',label):
    frozen=(repo/'scripts'/kind/'FROZEN.sha256').read_text().splitlines()
    for line in frozen:
        sha,name=line.split('  ',1)
        assert hashlib.sha256((repo/name).read_bytes()).hexdigest()==sha,name
    checks[kind]=len(frozen)
assert read('source-after.json')['sha256']=='70905a85dc7bfd5499eebd1253fb2e889b81aff1d5223d220f1bb8ec881d0cfa'
baseline={x['task']:x.get('payload') for x in jobs if x['cell']==expected[0] and x['kind']=='search'}
summaries=[]
for c in r['cells']:
    labelcell=c['label']; jj=[x for x in jobs if x['cell']==labelcell]
    assert c['prefixValidated'] and [x['task'] for x in jj]==['exact','exact','exact','exact','rare-small','rare-huge','rare-all','common-small']
    assert all(not x.get('error') for x in jj[:-1])
    assert c['reader']['cacheSize']==-c['cacheKiB']
    for j in jj:
        if j['kind']=='search' and not j.get('error'):
            for key in ('result','rawCount','rankRows'):
                assert j['payload'][key]==baseline[j['task']][key],(labelcell,j['task'],key)
    target=jj[-1]
    if c['state']=='deadline':
        assert target['error']=='WORKER_4800MS_DEADLINE'
    else:
        assert c['state']=='validated' and not target.get('error')
    pp=[x for x in phases if x['cell']==labelcell and x['id']==target['id']]
    rq=[x for x in ends if x.get('cell')==labelcell and x.get('jobId')==target['id']]
    ranges=[(x['path'],x['range']) for x in rq if x['range']]
    cr={(x['path'],x['range']) for x in rq if x['range'] and x['phase']=='count'}
    rr={(x['path'],x['range']) for x in rq if x['range'] and x['phase']=='rank'}
    perphase={}
    for name in sorted({x['name'] for x in pp}):
        pe=[x for x in pp if x['name']==name and x['edge']=='end']
        ps=[x for x in pp if x['name']==name and x['edge']=='start']
        perphase[name]={'completedCalls':len(pe),'startedCalls':len(ps),'elapsedMs':sum(x['elapsedMs'] for x in pe) if len(pe)==len(ps) else None}
    samples=[x for x in resources if x.get('cell')==labelcell]
    rss=[p['rss'] for x in samples for p in x['processes'] if p['pid']==c['readerPid']]
    summaries.append(dict(cell=labelcell,cacheKiB=c['cacheKiB'],state=c['state'],targetMs=target['elapsedMs'],phases=perphase,
        targetRequests=len(rq),targetBytes=sum(x['bytes'] for x in rq),uniqueRanges=len(set(ranges)),repeatedRanges=len(ranges)-len(set(ranges)),countRankIntersection=len(cr&rr),
        responseStatus=dict(collections.Counter(str(x['status']) for x in rq)),incompleteResponses=sum(not x['complete'] for x in rq),
        readerPeakRss=max(rss,default=0),readerSampleCount=len(rss),cellTotalPeakRss=max((x['rss'] for x in samples),default=0)))
pairs=[]
for i in (1,2,3):
    a=next(s for s in summaries if s['cell']==f'p{i}-A-R-16384')
    b=next(s for s in summaries if s['cell']==f'p{i}-B-R-65536')
    duration=4800 if a['state']=='deadline' else a['targetMs']
    reduction=1-b['countRankIntersection']/a['countRankIntersection'] if a['countRankIntersection'] else None
    elapsedReduction=1-b['targetMs']/duration if b['state']=='validated' else None
    support=b['state']=='validated' and reduction is not None and reduction>=0.8 and elapsedReduction>=0.2
    pairs.append(dict(pair=i,rangeIntersectionReduction=reduction,fullElapsedReduction=elapsedReduction,AElapsedRightCensored=a['state']=='deadline',strongSupport=support))
ss=subprocess.check_output(['ss','-ltnH'],text=True)
assert not [line for line in ss.splitlines() if any(':'+str(port)+' ' in line for port in (19440,19441,19442))]
summary=dict(cells=summaries,pairs=pairs,strongLocalSupport=all(p['strongSupport'] for p in pairs),elapsedMs=r['elapsedMs'],peakRss=r['peakRss'],peakBytes=r['peakBytes'])
audit=dict(passed=True,reviewType='Parent raw-record self-review, not independent acceptance',at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    jobs=len(jobs),proxyPairs=len(starts),incompleteResponses=sum(not x['complete'] for x in ends),sourceAndObjectsUnchanged=True,frozenInputs=checks,portsFree=[19440,19441,19442])
for name,obj in [('summary.json',summary),('POSTRUN_AUDIT.json',audit)]:
    with (win/name).open('x') as f:json.dump(obj,f,indent=2)
shutil.copytree(ev,win/'evidence')
shutil.copytree(repo/'scripts'/label,win/'scripts')
for directory in ('evidence','scripts'):
    origin=ev if directory=='evidence' else repo/'scripts'/label
    for f in origin.rglob('*'):
        if f.is_file():assert hashlib.sha256(f.read_bytes()).digest()==hashlib.sha256((win/directory/f.relative_to(origin)).read_bytes()).digest()
print(json.dumps(dict(summary=summary,audit=audit),indent=2))
