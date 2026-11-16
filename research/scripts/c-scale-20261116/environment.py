from pathlib import Path
import sys,os,json,time,subprocess,hashlib,shutil,threading,importlib.util
sys.dont_write_bytecode=True
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
spec=importlib.util.spec_from_file_location('base',WIN/'scripts/c-million-20261116/environment.py')
e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
OLD=e.RUN;ROOT=e.ROOT/'.lab/c-scale-20261116';ROOT.mkdir(exist_ok=True)
NATIVE=e.ROOT/'scripts/c-scale-20261116'
OUT=WIN/'evidence/c-scale-20261116'
attempt=sys.argv[2] if len(sys.argv)>2 else 'r1'
assert attempt in ['r1','r2']
RUN=ROOT/attempt;e.RUN=RUN
SERVICES=['dr-scale-'+attempt+'-reader-20261116','dr-scale-'+attempt+'-minio-20261116']
def stop():
    for name in SERVICES:subprocess.run(['systemctl','--user','stop',name],env=e.ENV,capture_output=True)
def export():
    for p in RUN.rglob('*'):
        if not p.is_file() or 'cache' in p.relative_to(RUN).parts or p.name=='config.json':continue
        dst=OUT/attempt/p.relative_to(RUN);dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst)
def available():
    return int(next(x.split()[1] for x in Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))*1024
def guard_begin(stage):
    done=threading.Event()
    def monitor():
        while not done.is_set():
            try:
                row={'at':time.time(),'stage':stage,'logicalBytes':e.treebytes(ROOT),'freeBytes':shutil.disk_usage(RUN).free,'hostAvailableBytes':available()}
                with (RUN/'disk.ndjson').open('a') as f:f.write(json.dumps(row)+'\n')
                exceeded=row['logicalBytes']>24*1024**3 or row['freeBytes']<20*1024**3 or row['hostAvailableBytes']<1.5*1024**3
            except Exception as ex:
                row={'at':time.time(),'stage':stage,'monitorFailure':str(ex)};exceeded=True
            if exceeded:
                (RUN/'disk-guard.json').write_text(json.dumps(row));stop();return
            done.wait(5)
    thread=threading.Thread(target=monitor,daemon=True);thread.start();return done,thread
def freeze():
    cfg=json.loads((RUN/'config.json').read_text());public={k:v for k,v in cfg.items() if k not in ['accessKey','secretKey','adminToken']};public['privateConfigSha256']=e.filehash(RUN/'config.json')
    (RUN/'config-public.json').write_text(json.dumps(public,indent=2))
    prior=json.loads((OLD/'fallback-1/freeze-before.json').read_text())['files']
    files=[Path(p) for p in prior if '/fallback-1/' not in p and 'C_MILLION_PLAN' not in p]
    changed=[str(p) for p in files if e.filehash(p)!=prior[str(p)]['sha256']]
    if changed:raise RuntimeError('K2 INPUT CHANGED '+str(changed))
    files += [RUN/'config-public.json',RUN/'limits.json',RUN/'prepare.json',e.MINIO,WIN/'docs/C_SCALE_PLAN_20261116.md',WIN/'docs/C_SCALE_DESIGN_REVIEW_20261116.md']
    files += [p for p in (WIN/'scripts/c-scale-20261116').glob('*') if p.is_file()]
    files += [p for p in (RUN/'runtime').glob('*') if p.is_file()]+[NATIVE/'load.mjs']
    for name in ['source.mjs','load.mjs']:
        dep=e.ROOT/'scripts/c-million-20261116'/name
        assert e.filehash(dep)==prior[str(e.PROJECT/name)]['sha256']
        files.append(dep)
    with (RUN/'freeze-before.json').open('x') as f:json.dump({'at':time.time(),'k2ReusedMismatches':changed,'files':{str(p):{'sha256':e.filehash(p),'bytes':p.stat().st_size} for p in files}},f,indent=2)
    print(json.dumps({'frozen':len(files),'k2ReusedMismatches':changed}))
action=sys.argv[1]
if action=='hold':
    begin=time.monotonic();print('K5 bounded WSL lifetime active',flush=True)
    while not (ROOT/'supervisor.stop').exists() and time.monotonic()-begin<3600:time.sleep(1)
elif action=='prepare':
    RUN.mkdir();runtime=RUN/'runtime';runtime.mkdir();NATIVE.mkdir(parents=True,exist_ok=True)
    cpu,mem,workers=(400,8*1024**3,4) if attempt=='r1' else (800,12*1024**3,8)
    # No rebuild of Next or changes to its frozen output; dynamic service import is the existing seam.
    changes=[]
    for name in ['service.mjs','pool.mjs','worker.mjs','storage.mjs']:
        src=e.PROJECT/name;dst=runtime/name;shutil.copy2(src,dst)
        if name=='pool.mjs':
            text=dst.read_text();assert text.count('Promise.all([0,1].map(')==1
            text=text.replace('Promise.all([0,1].map(',f'Promise.all(Array.from({{length:{workers}}}).map(')
            dst.write_text(text);changes.append({'file':name,'change':'fixed worker count 2 -> '+str(workers)})
    shutil.copy2(WIN/'scripts/c-scale-20261116/load.mjs',NATIVE/'load.mjs')
    cfg=json.loads((OLD/'fallback-1/config.json').read_text())
    cfg.update(endpoint='http://127.0.0.1:19680',baseUrl='http://127.0.0.1:3178/api/capi',webBase='http://127.0.0.1:3178',webBaseUrl='http://127.0.0.1:3178',cacheDir=str(RUN/'cache'),eventLog=str(RUN/'events.ndjson'),runtimeDir=str(RUN),diskGuardFile=str(RUN/'disk-guard.json'),diskBaselineBytes=0,readerCpu=cpu,readerMemory=mem,workerCount=workers,minioCpu=400,minioMemory=4*1024**3)
    (RUN/'config.json').write_text(json.dumps(cfg));(RUN/'config.json').chmod(0o600)
    (RUN/'prepare.json').write_text(json.dumps({'at':time.time(),'attempt':attempt,'changes':changes,'readerCpu':cpu,'readerMemory':mem,'workerCount':workers,'availableBytes':available(),'meminfo':Path('/proc/meminfo').read_text(),'note':'same frozen Next build; isolated service copy; only pool width changed'},indent=2))
    print(json.dumps({'attempt':attempt,'workers':workers,'readerCpu':cpu,'readerMemory':mem}))
elif action=='start':
    cfg=json.loads((RUN/'config.json').read_text())
    if available()<cfg['readerMemory']+4*1024**3+int(1.5*1024**3):raise RuntimeError('HOST_HEADROOM_PRECHECK')
    ss=subprocess.run(['ss','-ltn'],capture_output=True,text=True,check=True).stdout
    if any(':'+str(p)+' ' in ss for p in [3178,19680,19681]):raise RuntimeError('PORT_ALREADY_USED')
    e.unit(SERVICES[1],[str(e.MINIO),'server',str(OLD/'minio-data'),'--address','127.0.0.1:19680','--console-address','127.0.0.1:19681'],400,4*1024**3,['-p','EnvironmentFile='+str(OLD/'minio.env')])
    e.unit(SERVICES[0],[e.NODE,str(e.PROJECT/'node_modules/next/dist/bin/next'),'start','--port','3178','--hostname','127.0.0.1'],cfg['readerCpu'],cfg['readerMemory'],['--setenv=CAP_CONFIG='+str(RUN/'config.json'),'--setenv=CAP_SERVICE_URL='+(RUN/'runtime/service.mjs').as_uri()])
    cfg.update(readerCgroup=e.cg(SERVICES[0]),minioCgroup=e.cg(SERVICES[1]));(RUN/'config.json').write_text(json.dumps(cfg))
    limits={k:{x:(Path(cfg[k])/x).read_text().strip() for x in ['cpu.max','memory.max','memory.swap.max','cgroup.procs','memory.events']} for k in ['readerCgroup','minioCgroup']}
    (RUN/'limits.json').write_text(json.dumps(limits,indent=2));print(json.dumps(limits))
elif action=='freeze':freeze();export()
elif action=='ready':
    import urllib.request
    begin=time.monotonic();done,thread=guard_begin('ready')
    try:
        with urllib.request.urlopen('http://127.0.0.1:3178/api/capi/status',timeout=140) as response:data=json.load(response)
        cfg=json.loads((RUN/'config.json').read_text());assert data['snapshotId']=='v1' and not data['fatal'] and len(data['workers'])==cfg['workerCount']
        data['observedReadySeconds']=time.monotonic()-begin
        data['workerProcesses']={str(pid):{'cmdline':Path('/proc/'+str(pid)+'/cmdline').read_bytes().replace(b'\x00',b' ').decode(),'cgroup':Path('/proc/'+str(pid)+'/cgroup').read_text()} for pid in data['workers']}
        for item in data['workerProcesses'].values():
            assert str(RUN/'runtime/worker.mjs') in item['cmdline'] and SERVICES[0] in item['cgroup']
        (RUN/'ready.json').write_text(json.dumps(data,indent=2));print(json.dumps({'snapshotId':data['snapshotId'],'workers':len(data['workers']),'elapsedSeconds':data['observedReadySeconds'],'events':data['events']}))
    except Exception as ex:
        (RUN/'ready-failure.json').write_text(json.dumps({'error':str(ex),'at':time.time()}));stop();export();raise
    finally:done.set();thread.join(10)
    export()
elif action=='load':
    done,t=guard_begin('load')
    try:e.call([e.NODE,str(NATIVE/'load.mjs'),'--config',str(RUN/'config.json'),'--oracle',str(OLD/'fixture-1000000/oracle.json'),'--out',str(RUN/'load'),'--mode','formal'],cwd=NATIVE,timeout=960)
    finally:done.set();t.join(10);stop();export()
elif action=='finish':
    stop();before=json.loads((RUN/'freeze-before.json').read_text());mismatches=[p for p,v in before['files'].items() if not Path(p).exists() or e.filehash(Path(p))!=v['sha256']]
    with (RUN/'freeze-after.json').open('x') as f:json.dump({'checked':len(before['files']),'mismatches':mismatches,'at':time.time()},f,indent=2)
    ss=subprocess.run(['ss','-ltnp'],capture_output=True,text=True,check=True).stdout;listeners=[s for s in ss.splitlines() if any(':'+str(p)+' ' in s for p in [3178,19680,19681])]
    units={name:subprocess.run(['systemctl','--user','show',name,'--property=MainPID,ActiveState,Result,ExecMainStatus'],capture_output=True,text=True).stdout for name in SERVICES}
    hashes={}
    for v in ['v1','v2']:
        db=RUN/'cache'/v/'search.sqlite'
        if db.exists():hashes[v]={'sha256':e.filehash(db),'matches':e.filehash(db)==e.filehash(OLD/'fixture-1000000'/v/'search.sqlite')}
    with (RUN/'cleanup.json').open('x') as f:json.dump({'at':time.time(),'listeners':listeners,'units':units,'installed':hashes},f,indent=2)
    export();print(json.dumps({'mismatches':mismatches,'listeners':listeners,'installed':hashes}));assert not mismatches and not listeners and all(x['matches'] for x in hashes.values())
elif action=='stop':stop();export()
elif action=='end':stop();(ROOT/'supervisor.stop').write_text('stopped');export()
elif action=='export':export()
