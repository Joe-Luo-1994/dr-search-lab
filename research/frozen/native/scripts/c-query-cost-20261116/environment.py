from pathlib import Path
import sys,os,json,time,subprocess,shutil,importlib.util
sys.dont_write_bytecode=True
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
spec=importlib.util.spec_from_file_location('base',WIN/'scripts/c-million-20261116/environment.py')
e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
OLD=e.RUN;RUN=e.ROOT/'.lab/c-query-cost-20261116';RUN.mkdir(exist_ok=True);e.RUN=RUN
NATIVE=e.ROOT/'scripts/c-query-cost-20261116';OUT=WIN/'evidence/c-query-cost-20261116'
UNIT='dr-query-cost-20261116';DB=OLD/'fixture-1000000/v1/search.sqlite';ORACLE=OLD/'fixture-1000000/oracle.json';ORIGINAL=e.PROJECT/'worker.mjs'
def export():
    OUT.mkdir(exist_ok=True)
    for p in RUN.rglob('*'):
        if p.is_file():
            target=OUT/p.relative_to(RUN);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
def unit_state():return subprocess.run(['systemctl','--user','show',UNIT,'--property=MainPID,ActiveState,Result,ExecMainStatus'],env=e.ENV,capture_output=True,text=True).stdout
action=sys.argv[1]
if action=='hold':
    begin=time.monotonic();print('K4 bounded lifetime active',flush=True)
    while not (RUN/'supervisor.stop').exists() and time.monotonic()-begin<1200:time.sleep(1)
    print('K4 lifetime ended',flush=True)
elif action=='worker-gate':
    begin=time.monotonic()
    while not (RUN/'go').exists():
        if time.monotonic()-begin>600:raise RuntimeError('GATE_TIMEOUT')
        time.sleep(.1)
    argv=[e.NODE,str(NATIVE/'run.mjs'),'--db',str(DB),'--oracle',str(ORACLE),'--original-worker',str(ORIGINAL),'--out',str(RUN/'profile')]
    os.execv(e.NODE,argv)
elif action=='prepare':
    if (RUN/'freeze-before.json').exists():raise RuntimeError('attempt already prepared')
    NATIVE.mkdir(parents=True,exist_ok=True)
    files=[]
    for p in (WIN/'scripts/c-query-cost-20261116').glob('*'):
        if p.is_file():
            target=NATIVE/p.name;shutil.copy2(p,target);files.extend([p,target])
    old=json.loads((OLD/'fallback-1/freeze-before.json').read_text())['files']
    source=e.ROOT/'scripts/c-million-20261116/source.mjs'
    fixed=[ORIGINAL,DB,ORACLE,Path(e.NODE),WIN/'scripts/c-million-20261116/environment.py']
    for p in fixed:
        if e.filehash(p)!=old[str(p)]['sha256']:raise RuntimeError('K2 source changed '+str(p))
    if e.filehash(source)!=old[str(e.PROJECT/'source.mjs')]['sha256']:raise RuntimeError('source oracle module changed')
    e.unit(UNIT,['/usr/bin/python3',str(NATIVE/'environment.py'),'worker-gate'],200,4*1024**3)
    cg=Path(e.cg(UNIT));limits={x:(cg/x).read_text().strip() for x in ['cpu.max','memory.max','memory.swap.max','cgroup.procs']}
    assert limits['cpu.max']=='200000 100000' and limits['memory.max']==str(4*1024**3) and limits['memory.swap.max']=='0'
    (RUN/'limits.json').write_text(json.dumps({'cgroup':str(cg),**limits},indent=2))
    files += fixed+[source,RUN/'limits.json',WIN/'docs/C_QUERY_COST_DESIGN_REVIEW_20261116.md']
    before={'at':time.time(),'k2ReusedMismatches':[],'cacheNote':'Pre-run full DB SHA validation may warm host cache; not cold-cache latency. Reference and profile use distinct SQLite connections.',
        'files':{str(p):{'sha256':e.filehash(p),'bytes':p.stat().st_size} for p in files}}
    with (RUN/'freeze-before.json').open('x') as f:json.dump(before,f,indent=2)
    export();print(json.dumps({'files':len(files),'limits':limits,'state':'GATED_NO_SQL'}))
elif action=='go':
    if (RUN/'go').exists():raise RuntimeError('already started')
    cg=Path(json.loads((RUN/'limits.json').read_text())['cgroup']);start=time.monotonic();(RUN/'go').write_text(str(time.time()))
    samples=0
    try:
        while time.monotonic()-start<180:
            row={'at':time.time(),'elapsedSeconds':time.monotonic()-start,'values':{}}
            for name in ['cpu.max','cpu.stat','memory.max','memory.current','memory.peak','memory.events','memory.stat','memory.swap.max','cgroup.procs','io.stat']:
                try:row['values'][name]=(cg/name).read_text().strip()
                except FileNotFoundError:row['values'][name]=None
            with (RUN/'resources.ndjson').open('a') as f:f.write(json.dumps(row)+'\n')
            samples+=1;state=unit_state()
            if 'ActiveState=inactive' in state or 'ActiveState=failed' in state:break
            if row['values']['cpu.max']!='200000 100000' or row['values']['memory.max']!=str(4*1024**3) or row['values']['memory.swap.max']!='0':
                (RUN/'controller-stop.json').write_text(json.dumps({'reason':'LIMIT_DRIFT','at':time.time()}));break
            events=row['values'].get('memory.events') or ''
            if any(line.startswith(('oom ','oom_kill ')) and int(line.split()[1])>0 for line in events.splitlines()):
                (RUN/'controller-stop.json').write_text(json.dumps({'reason':'CGROUP_OOM','at':time.time()}));break
            time.sleep(.25)
        else:(RUN/'controller-stop.json').write_text(json.dumps({'reason':'TOTAL_DEADLINE_180_SECONDS','at':time.time()}))
    finally:
        beforeStop=unit_state();subprocess.run(['systemctl','--user','stop',UNIT],env=e.ENV,capture_output=True)
        (RUN/'completion.json').write_text(json.dumps({'at':time.time(),'elapsedSeconds':time.monotonic()-start,'samples':samples,'unitBeforeStop':beforeStop,'unitAfterStop':unit_state()},indent=2));export()
    print((RUN/'completion.json').read_text())
elif action=='finish':
    before=json.loads((RUN/'freeze-before.json').read_text());mismatches=[p for p,v in before['files'].items() if not Path(p).exists() or e.filehash(Path(p))!=v['sha256']]
    with (RUN/'freeze-after.json').open('x') as f:json.dump({'at':time.time(),'checked':len(before['files']),'mismatches':mismatches},f,indent=2)
    (RUN/'supervisor.stop').write_text('stopped');export();print(json.dumps({'checked':len(before['files']),'mismatches':mismatches}));assert not mismatches
elif action=='export':export()
elif action=='stop':
    subprocess.run(['systemctl','--user','stop',UNIT],env=e.ENV,capture_output=True);(RUN/'supervisor.stop').write_text('stopped');export()
