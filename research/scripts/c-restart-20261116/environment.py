from pathlib import Path
import sys,os,json,time,subprocess,hashlib,shutil,threading,importlib.util,secrets,socket,signal,urllib.request,urllib.error
sys.dont_write_bytecode=True
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
spec=importlib.util.spec_from_file_location('base',WIN/'scripts/c-million-20261116/environment.py');e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
OLD=e.RUN;RUN=e.ROOT/'.lab/c-restart-20261116';RUNTIME=RUN/'runtime';PRIVATE=RUN/'private';OUT=WIN/'evidence/c-restart-20261116';FIXTURE=OLD/'fixture-1000';K5=e.ROOT/'.lab/c-scale-20261116/r2';e.RUN=RUN
MINIO_UNIT='dr-restart-minio-20261116';OWNED=[MINIO_UNIT]
STOP=threading.Event();STOP_REASON={};STOP_LOCK=threading.Lock()
def latch_stop(reason):
    with STOP_LOCK:
        if not STOP.is_set():STOP_REASON.update(reason=reason,at=time.time());STOP.set()
def ensure_running():
    if STOP.is_set():raise RuntimeError('EXTERNAL_STOP:'+str(STOP_REASON))
def sha(raw):return hashlib.sha256(raw).hexdigest()
def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('x') as f:json.dump(value,f,indent=2)
def stop(name):subprocess.run(['systemctl','--user','stop',name],env=e.ENV,capture_output=True,timeout=20)
def stopall():
    for name in reversed(OWNED):stop(name)
def available():return int(next(x.split()[1] for x in Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))*1024
def export():
    for p in RUN.rglob('*'):
        if not p.is_file() or any(x in p.relative_to(RUN).parts for x in ['private','minio-data','caches']):continue
        dst=OUT/p.relative_to(RUN);dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst)
def waitport(port):
    end=time.monotonic()+15
    while time.monotonic()<end:
        ensure_running()
        try:
            with socket.create_connection(('127.0.0.1',port),timeout=.3):return
        except OSError:time.sleep(.1)
    raise RuntimeError('LISTEN_TIMEOUT')
def limits(name):
    p=Path(e.cg(name));return {x:(p/x).read_text().strip() for x in ['cpu.max','memory.max','memory.swap.max','cgroup.procs','memory.events']}
def req(route,identity='all',method='GET'):
    ensure_running()
    start=time.monotonic();request=urllib.request.Request('http://127.0.0.1:3180'+route,headers={'x-cap-identity':identity},method=method)
    try:
        response=urllib.request.urlopen(request,timeout=60);status=response.status;data=response.read()
    except urllib.error.HTTPError as err:status=err.code;data=err.read()
    ensure_running()
    try:payload=json.loads(data)
    except (ValueError,UnicodeDecodeError):payload=None
    record={'route':route,'identity':identity,'method':method,'status':status,'bytes':len(data),'sha256':sha(data),'elapsedSeconds':time.monotonic()-start}
    if status!=200:record['error']=payload
    with (RUN/'http.ndjson').open('a') as f:f.write(json.dumps(record)+'\n')
    return status,payload,data
def publish(action,label=None):
    ensure_running()
    env=dict(e.ENV,CAP_CONFIG=str(PRIVATE/'publisher.json'))
    subprocess.run([e.NODE,str(RUNTIME/'publisher.mjs'),action,str(FIXTURE),str(RUN/('publish-'+(label or action)+'.json'))],cwd=RUNTIME,env=env,check=True,timeout=120)
    ensure_running()
def frozen():
    old=json.loads((K5/'freeze-before.json').read_text())['files'];changed=[p for p,v in old.items() if e.filehash(Path(p))!=v['sha256']]
    if changed:raise RuntimeError('K5_INPUT_CHANGED:'+str(changed))
    files=[Path(p) for p in old]
    files += [p for p in RUNTIME.glob('*') if p.is_file()]
    files += [p for p in (WIN/'scripts/c-restart-20261116').glob('*') if p.is_file()]
    files += [p for p in FIXTURE.rglob('*') if p.is_file()]
    files += [WIN/'docs/C_RESTART_PLAN_20261116.md',WIN/'docs/C_RESTART_DESIGN_REVIEW_20261116.md',RUN/'prepare.json']
    write(RUN/'freeze-before.json',{'at':time.time(),'k5Checked':len(old),'k5Mismatches':changed,'files':{str(p):{'bytes':p.stat().st_size,'sha256':e.filehash(p)} for p in files}})
def verify_case(name,cache,version,expected_source=None,negative=False,empty=False):
    ensure_running()
    directory=RUN/'cases'/name;directory.mkdir(parents=True);cache.mkdir(parents=True,exist_ok=True)
    before=[str(p.relative_to(cache)) for p in cache.rglob('*')]
    if empty:assert not before,'NOT_EMPTY_CACHE'
    active=cache/'active.json';before_active=active.read_bytes() if active.exists() else None
    before_files={str(p.relative_to(cache)):e.filehash(p) for p in cache.rglob('*') if p.is_file()}
    config=json.loads((PRIVATE/'publisher.json').read_text());config.update(cacheDir=str(cache),eventLog=str(directory/'events.ndjson'),testHooks=False)
    cfg=PRIVATE/(name+'.json');cfg.write_text(json.dumps(config));cfg.chmod(0o600)
    public={k:v for k,v in config.items() if k not in ['accessKey','secretKey','adminToken']};public['privateConfigSha256']=e.filehash(cfg)
    write(directory/'config-public.json',public)
    assert 'releases' not in config and 'artifactDir' not in config
    unit='dr-restart-'+name+'-20261116';OWNED.append(unit);begin=time.monotonic();record={'case':name,'cacheWasEmpty':not before,'versionExpected':version,'negative':negative,'beforeActiveSha256':sha(before_active) if before_active else None,'beforeFiles':before_files}
    def expired():latch_stop('READINESS_60_SECONDS:'+name);stop(unit)
    ready_timer=threading.Timer(60,expired);ready_timer.daemon=True;ready_timer.start()
    try:
        ensure_running()
        e.unit(unit,[e.NODE,str(e.PROJECT/'node_modules/next/dist/bin/next'),'start','--port','3180','--hostname','127.0.0.1'],800,12*1024**3,['--setenv=CAP_CONFIG='+str(cfg),'--setenv=CAP_SERVICE_URL='+(RUNTIME/'service.mjs').as_uri()])
        ensure_running()
        lim=limits(unit);write(directory/'limits.json',lim);assert lim['cpu.max']=='800000 100000' and lim['memory.max']==str(12*1024**3) and lim['memory.swap.max']=='0'
        waitport(3180);status,payload,_=req('/api/capi/status');ready_timer.cancel();ensure_running();record.update(status=status,payload=payload,startedToResponseSeconds=time.monotonic()-begin)
        assert record['startedToResponseSeconds']<60,'READINESS_DEADLINE'
        if negative:
            assert status==503 and payload['error']['code']=='MANIFEST_PIN_MISMATCH'
            assert (active.read_bytes() if active.exists() else None)==before_active,'ACTIVE_CHANGED_ON_FAILURE'
            assert {str(p.relative_to(cache)):e.filehash(p) for p in cache.rglob('*') if p.is_file()}==before_files,'CACHE_CHANGED_ON_BAD_MANIFEST'
            events=[json.loads(x) for x in (directory/'events.ndjson').read_text().splitlines()] if (directory/'events.ndjson').exists() else []
            assert not any(x['type']=='ready' for x in events)
            record.update(activeUnchanged=True,cacheUnchanged=True,ready=False,qualified=True)
        else:
            assert status==200 and payload['snapshotId']==version and not payload['fatal'] and len(payload['workers'])==8
            record['workers']={str(pid):{'cmdline':Path('/proc/'+str(pid)+'/cmdline').read_bytes().replace(b'\x00',b' ').decode(),'cgroup':Path('/proc/'+str(pid)+'/cgroup').read_text()} for pid in payload['workers']}
            assert all(str(RUNTIME/'worker.mjs') in v['cmdline'] and unit in v['cgroup'] for v in record['workers'].values())
            receipt=json.loads(active.read_text());record['active']=receipt
            assert receipt['releaseId']==version
            prep=next(x for x in payload['events'] if x['type']=='boot-prepared');record['prepared']=prep
            if expected_source:assert prep['source']==expected_source,prep
            startup_events=[json.loads(x) for x in (directory/'events.ndjson').read_text().splitlines()]
            storage_calls=[x for x in startup_events if x['type']=='storage-request'];record['startupStorageRequests']=storage_calls
            assert sum(x['method']=='GET' and x['key']=='control/approved.json' for x in storage_calls)==1
            assert sum(x['method']=='GET' and x['key']==version+'/manifest.json' for x in storage_calls)==1
            assert sum(x['method']=='GET' and x['key']==version+'/search.sqlite' for x in storage_calls)==(0 if expected_source=='cache' else 1)
            oracle=json.loads((FIXTURE/'oracle.json').read_text())['versions'][version]
            for query,identity,total in [('q=uniquep000003','all',1),('q=revisiontwo','all',1 if version=='v2' else 0),('q=uniquep000002&tagId=t8&tagId=t9','all',1 if version=='v2' else 0),('q=uniquep000001','a',0 if version=='v2' else 1)]:
                code,result,_=req('/api/capi/search?'+query,identity);assert code==200 and result['snapshotId']==version and result['total']==total,query
            expected=next(p for p in oracle['pages'] if p['pageId']=='p000003')
            code,page,raw=req('/api/capi/page?pageId=p000003&version='+version);assert code==200 and page['snapshotId']==version and sha(raw)==expected['bodySha']
            code,_,html=req('/docs/p000003?version='+version);assert code==200 and ('data-version="'+version+'"').encode() in html and expected['title'].encode() in html
            media=next(m for m in oracle['media'] if m['mediaId']=='m0')
            code,_,raw=req('/api/capi/media?pageId=p000001&mediaId=m0&version='+version);assert code==200 and sha(raw)==media['sha256']
            code,_,_=req('/api/capi/page?pageId=p000001&version='+version,'a');assert code==(200 if version=='v1' else 404)
            code,error,_=req('/api/capi/update',method='POST');assert code==404 and error['error']['code']=='STARTUP_ONLY'
            if version=='v2':assert req('/api/capi/page?pageId=p000003&version=v1')[0]==409
            for name,digest in before_files.items():
                if name!='active.json':assert e.filehash(cache/name)==digest,'EXISTING_CACHE_CHANGED'
            record.update(ready=True,qualified=True,afterActiveSha256=sha(active.read_bytes()))
    except Exception as ex:
        import traceback
        record['failure']={'type':type(ex).__name__,'message':str(ex),'traceback':traceback.format_exc()};raise
    finally:
        ready_timer.cancel()
        stop(unit);record['unitAfterStop']=subprocess.run(['systemctl','--user','show',unit,'--property=MainPID,ActiveState,Result,ExecMainStatus'],env=e.ENV,text=True,capture_output=True).stdout
        record['completedAt']=time.time();write(directory/'result.json',record)
    return record
action=sys.argv[1]
if action=='prepare':
    RUN.mkdir();RUNTIME.mkdir();PRIVATE.mkdir();(RUN/'caches').mkdir()
    for name in ['service.mjs','pool.mjs','worker.mjs','storage.mjs']:shutil.copy2(K5/'runtime'/name,RUNTIME/name)
    for name in ['bootstrap.mjs','publisher.mjs']:shutil.copy2(WIN/'scripts/c-restart-20261116'/name,RUNTIME/name)
    p=RUNTIME/'service.mjs';text=p.read_text();old="async function init(){if(active)return;if(!initializing)initializing=(async()=>{const x=await install('v1',{initial:true});active=x.pool;await event('ready',{snapshotId:'v1',...x.receipt});})();return initializing;}"
    replacement="async function init(){if(active)return;if(!initializing)initializing=(async()=>{let pool;try{const candidate=await prepareApproved();await event('boot-prepared',{...candidate});pool=new Pool(candidate.dbPath,candidate.version);await pool.start();const receipt=await commitActive(candidate);active=pool;await event('ready',{snapshotId:candidate.version,...receipt});}catch(error){if(pool)await pool.close();throw error;}})();return initializing;}"
    assert text.count(old)==1;text=text.replace(old,replacement).replace("import {Pool,fail} from './pool.mjs';","import {Pool,fail} from './pool.mjs';\nimport {prepareApproved,commitActive} from './bootstrap.mjs';")
    assert text.count("if(op==='update'){")==1;text=text.replace("if(op==='update'){","if(op==='update')throw fail('STARTUP_ONLY',404);\n    if(op==='update'){")
    p.write_text(text)
    p=RUNTIME/'storage.mjs';text=p.read_text();needle='  return fetch(url,{method,body,';assert text.count(needle)==1
    text=text.replace(needle,"  await appendFile(c.eventLog,JSON.stringify({type:'storage-request',at:Date.now(),method,key})+'\\n');\n"+needle);p.write_text(text)
    cfg={'endpoint':'http://127.0.0.1:19700','bucket':'c-restart-20261116','approvedKey':'control/approved.json','accessKey':'ops'+secrets.token_hex(8),'secretKey':secrets.token_hex(24),'adminToken':secrets.token_hex(16),'cacheDir':str(RUN/'caches/publisher-unused'),'eventLog':str(RUN/'publisher-events.ndjson')}
    (PRIVATE/'publisher.json').write_text(json.dumps(cfg));(PRIVATE/'publisher.json').chmod(0o600)
    (PRIVATE/'minio.env').write_text('MINIO_ROOT_USER='+cfg['accessKey']+'\nMINIO_ROOT_PASSWORD='+cfg['secretKey']+'\nMINIO_BROWSER=off\nMINIO_UPDATE=off\nGOMEMLIMIT=1GiB\n');(PRIVATE/'minio.env').chmod(0o600)
    write(RUN/'prepare.json',{'at':time.time(),'memAvailable':available(),'source':'K5 R2 runtime, unchanged pool/worker; service init+import+explicit unsupported hot update; storage only adds method/key request evidence without credentials','fixture':str(FIXTURE),'readerBudget':{'cpu':8,'memoryGiB':12},'minioBudget':{'cpu':4,'memoryGiB':4}})
    print('prepared isolated restart experiment')
elif action=='freeze':frozen();export();print('frozen; no service started')
elif action=='run':
    assert (RUN/'freeze-before.json').exists();assert available()>17.5*1024**3,'HOST_HEADROOM'
    if (RUN/'result.json').exists():raise RuntimeError('ATTEMPT_EXISTS')
    pin=json.loads((RUN/'freeze-before.json').read_text());assert all(e.filehash(Path(p))==v['sha256'] for p,v in pin['files'].items()),'PRE_RUN_HASH_CHANGED'
    done=threading.Event();cases=[];failure=None;begin=time.monotonic()
    def guard():
        while not done.is_set():
            try:
                row={'at':time.time(),'bytes':e.treebytes(RUN),'free':shutil.disk_usage(RUN).free,'available':available()}
                with (RUN/'guard.ndjson').open('a') as f:f.write(json.dumps(row)+'\n')
                assert row['bytes']<2*1024**3 and row['free']>20*1024**3 and row['available']>1.5*1024**3
            except Exception as ex:
                latch_stop('HOST_DISK_MONITOR:'+str(ex));(RUN/'guard-failure.json').write_text(json.dumps(STOP_REASON));stopall();return
            done.wait(5)
    thread=threading.Thread(target=guard,daemon=True);thread.start()
    def deadline(*_):latch_stop('TOTAL_600_SECONDS');raise TimeoutError('TOTAL_600_SECONDS')
    signal.signal(signal.SIGALRM,deadline);signal.alarm(600)
    try:
        assert not any(':'+str(p)+' ' in subprocess.run(['ss','-ltn'],capture_output=True,text=True).stdout for p in [3180,19700,19701]),'PORT_IN_USE'
        (RUN/'minio-data').mkdir()
        ensure_running();e.unit(MINIO_UNIT,[str(e.MINIO),'server',str(RUN/'minio-data'),'--address','127.0.0.1:19700','--console-address','127.0.0.1:19701'],400,4*1024**3,['-p','EnvironmentFile='+str(PRIVATE/'minio.env')]);ensure_running();waitport(19700)
        lim=limits(MINIO_UNIT);write(RUN/'minio-limits.json',lim);assert lim['cpu.max']=='400000 100000' and lim['memory.max']==str(4*1024**3) and lim['memory.swap.max']=='0'
        publish('publish');publish('v1');cases.append(verify_case('initial-v1',RUN/'caches/main','v1','download'))
        publish('v2');cases.append(verify_case('upgrade-v2',RUN/'caches/main','v2','download'))
        cases.append(verify_case('fresh-v2',RUN/'caches/fresh','v2','download',empty=True))
        cases.append(verify_case('reuse-v2',RUN/'caches/fresh','v2','cache'))
        publish('bad-v2');cases.append(verify_case('bad-cached',RUN/'caches/fresh','v2',negative=True))
        cases.append(verify_case('bad-empty',RUN/'caches/negative','v2',negative=True,empty=True))
        publish('v2','restore-v2')
    except Exception as ex:failure={'type':type(ex).__name__,'error':str(ex)}
    finally:
        signal.alarm(0);done.set();thread.join(10);stopall()
        if STOP.is_set() and failure is None:failure={'type':'ExternalStop','error':str(STOP_REASON)}
        write(RUN/'result.json',{'passed':failure is None and not STOP.is_set() and not (RUN/'guard-failure.json').exists() and len(cases)==6 and all(x['qualified'] for x in cases),'failure':failure,'stopReason':STOP_REASON,'elapsedSeconds':time.monotonic()-begin,'cases':cases,'scope':'low frequency 1000-row startup integration only; no capacity/real Kubernetes/IAM/continuous hot update claim'})
        before=json.loads((RUN/'freeze-before.json').read_text());changes=[p for p,v in before['files'].items() if not Path(p).exists() or e.filehash(Path(p))!=v['sha256']]
        write(RUN/'freeze-after.json',{'checked':len(before['files']),'mismatches':changes})
        ss=subprocess.run(['ss','-ltnp'],capture_output=True,text=True).stdout;listeners=[line for line in ss.splitlines() if any(':'+str(p)+' ' in line for p in [3180,19700,19701])]
        write(RUN/'cleanup.json',{'listeners':listeners,'units':{name:subprocess.run(['systemctl','--user','show',name,'--property=MainPID,ActiveState,Result,ExecMainStatus'],env=e.ENV,capture_output=True,text=True).stdout for name in OWNED}})
        export();print(json.dumps({'passed':failure is None and len(cases)==6,'failure':failure,'cases':len(cases),'mismatches':changes,'listeners':listeners}));assert not changes and not listeners
    if failure:sys.exit(1)
elif action=='export':export()
