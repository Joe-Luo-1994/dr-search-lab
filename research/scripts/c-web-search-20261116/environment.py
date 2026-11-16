from pathlib import Path
import sys,os,json,time,subprocess,hashlib,shutil,threading,importlib.util
sys.dont_write_bytecode=True
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
spec=importlib.util.spec_from_file_location('base',WIN/'scripts/c-million-20261116/environment.py')
e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
OLD=e.RUN;RUN=e.ROOT/'.lab/c-web-search-20261116';RUN.mkdir(exist_ok=True)
e.RUN=RUN
SERVICES=['dr-web-reader-20261116','dr-web-minio-20261116']
NATIVE=e.ROOT/'scripts/c-web-search-20261116'
OUT=WIN/'evidence/c-web-search-20261116'
def stop():
    for name in SERVICES:subprocess.run(['systemctl','--user','stop',name],env=e.ENV,capture_output=True)
def export():
    OUT.mkdir(exist_ok=True)
    for p in RUN.rglob('*'):
        if not p.is_file() or 'cache' in p.relative_to(RUN).parts or p.name in ['config.json','minio.env']:continue
        target=OUT/p.relative_to(RUN);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
def freeze():
    cfg=json.loads((RUN/'config.json').read_text());public={k:v for k,v in cfg.items() if k not in ['accessKey','secretKey','adminToken']};public['privateConfigSha256']=e.filehash(RUN/'config.json')
    (RUN/'config-public.json').write_text(json.dumps(public,indent=2))
    prior=json.loads((OLD/'fallback-1/freeze-before.json').read_text())['files']
    files=[Path(p) for p in prior if '/fallback-1/' not in p and 'C_MILLION_PLAN' not in p]
    reused=[str(p) for p in files if e.filehash(p)!=prior[str(p)]['sha256']]
    if reused:raise RuntimeError('K2 reused input changed: '+str(reused))
    files += [RUN/'config-public.json',RUN/'limits.json',WIN/'docs/C_WEB_SEARCH_DESIGN_REVIEW_20261116.md',e.MINIO]
    files += [p for p in (WIN/'scripts/c-web-search-20261116').glob('*') if p.is_file()]
    files += [NATIVE/'load.mjs']
    for name in ['source.mjs','load.mjs']:
        dependency=e.ROOT/'scripts/c-million-20261116'/name
        if e.filehash(dependency)!=prior[str(e.PROJECT/name)]['sha256']:raise RuntimeError('Imported K2 dependency differs: '+name)
        files.append(dependency)
    with (RUN/'freeze-before.json').open('x') as f:json.dump({'at':time.time(),'k2ReusedMismatches':reused,'files':{str(p):{'sha256':e.filehash(p),'bytes':p.stat().st_size} for p in files}},f,indent=2)
    print('frozen',len(files))
action=sys.argv[1]
if action=='hold':
    begin=time.monotonic();print('K3 bounded lifetime active',flush=True)
    while not (RUN/'supervisor.stop').exists() and time.monotonic()-begin<1800:time.sleep(1)
    print('K3 lifetime ended',flush=True)
elif action=='start':
    if (RUN/'config.json').exists():raise RuntimeError('attempt already exists')
    NATIVE.mkdir(parents=True,exist_ok=True);shutil.copy2(WIN/'scripts/c-web-search-20261116/load.mjs',NATIVE/'load.mjs')
    old=json.loads((OLD/'fallback-1/config.json').read_text())
    old.update(endpoint='http://127.0.0.1:19660',baseUrl='http://127.0.0.1:3176/api/capi',webBase='http://127.0.0.1:3176',webBaseUrl='http://127.0.0.1:3176',cacheDir=str(RUN/'cache'),eventLog=str(RUN/'events.ndjson'),runtimeDir=str(RUN),diskGuardFile=str(RUN/'disk-guard.json'),diskBaselineBytes=0)
    # Same versioned object data; no upload or new index build.
    e.unit(SERVICES[1],[str(e.MINIO),'server',str(OLD/'minio-data'),'--address','127.0.0.1:19660','--console-address','127.0.0.1:19661'],400,4*1024**3,['-p','EnvironmentFile='+str(OLD/'minio.env')])
    (RUN/'config.json').write_text(json.dumps(old));(RUN/'config.json').chmod(0o600)
    e.unit(SERVICES[0],[e.NODE,str(e.PROJECT/'node_modules/next/dist/bin/next'),'start','--port','3176','--hostname','127.0.0.1'],200,4*1024**3,['--setenv=CAP_CONFIG='+str(RUN/'config.json'),'--setenv=CAP_SERVICE_URL='+(e.PROJECT/'service.mjs').as_uri()])
    old.update(readerCgroup=e.cg(SERVICES[0]),minioCgroup=e.cg(SERVICES[1]));(RUN/'config.json').write_text(json.dumps(old))
    limits={k:{x:(Path(old[k])/x).read_text().strip() for x in ['cpu.max','memory.max','memory.swap.max','cgroup.procs','memory.events']} for k in ['readerCgroup','minioCgroup']}
    (RUN/'limits.json').write_text(json.dumps(limits,indent=2));print(json.dumps(limits))
elif action=='ready':
    import urllib.request
    try:
        with urllib.request.urlopen('http://127.0.0.1:3176/api/capi/status',timeout=140) as response:data=json.load(response)
        (RUN/'ready.json').write_text(json.dumps(data,indent=2));print(json.dumps({'snapshotId':data['snapshotId'],'fatal':data['fatal'],'events':data['events']}))
    except Exception as ex:
        (RUN/'ready-failure.json').write_text(json.dumps({'error':str(ex),'at':time.time()}));stop();export();raise
elif action=='freeze':freeze()
elif action=='load':
    done=threading.Event()
    def monitor():
        while not done.is_set():
            row={'at':time.time(),'logicalBytes':e.treebytes(RUN)+e.treebytes(OLD),'freeBytes':shutil.disk_usage(RUN).free}
            with (RUN/'disk.ndjson').open('a') as f:f.write(json.dumps(row)+'\n')
            if row['logicalBytes']>40*1024**3 or row['freeBytes']<20*1024**3:(RUN/'disk-guard.json').write_text(json.dumps(row));return
            done.wait(5)
    t=threading.Thread(target=monitor,daemon=True);t.start()
    try:e.call([e.NODE,str(NATIVE/'load.mjs'),'--config',str(RUN/'config.json'),'--oracle',str(OLD/'fixture-1000000/oracle.json'),'--out',str(RUN/'load'),'--mode','formal'],cwd=NATIVE)
    finally:done.set();t.join(10);stop();export()
elif action=='finish':
    before=json.loads((RUN/'freeze-before.json').read_text());mismatches=[p for p,v in before['files'].items() if not Path(p).exists() or e.filehash(Path(p))!=v['sha256']]
    with (RUN/'freeze-after.json').open('x') as f:json.dump({'checked':len(before['files']),'mismatches':mismatches,'at':time.time()},f,indent=2)
    ss=subprocess.run(['ss','-ltnp'],capture_output=True,text=True,check=True).stdout
    listeners=[s for s in ss.splitlines() if any(':'+str(p)+' ' in s for p in [3176,19660,19661])]
    units={name:subprocess.run(['systemctl','--user','show',name,'--property=MainPID,ActiveState,Result,ExecMainStatus'],capture_output=True,text=True).stdout for name in SERVICES}
    actual=e.filehash(RUN/'cache/v1/search.sqlite');expected=e.filehash(OLD/'fixture-1000000/v1/search.sqlite')
    with (RUN/'cleanup.json').open('x') as f:json.dump({'at':time.time(),'listeners':listeners,'units':units,'installedV1HashMatches':actual==expected,'sha256':actual},f,indent=2)
    (RUN/'supervisor.stop').write_text('stopped');export()
    print(json.dumps({'mismatches':mismatches,'listeners':listeners,'installedV1HashMatches':actual==expected}));assert not mismatches and not listeners and actual==expected
elif action=='export':export()
elif action=='stop':stop();(RUN/'supervisor.stop').write_text('stopped');export()
