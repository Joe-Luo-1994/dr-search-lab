from pathlib import Path
import os, subprocess, json, sys, time, hashlib, shutil, secrets, threading

ROOT=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo')
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
RUN=ROOT/'.lab/c-capacity-20261115'
NODE='/PUBLIC/LINUX_HOME/.nvm/versions/node/v22.18.0/bin/node'
ENV=dict(os.environ, PATH=str(Path(NODE).parent)+':/usr/local/bin:/usr/bin:/bin',NEXT_TELEMETRY_DISABLED='1')
PROJECT=RUN/'project'
SOURCE=WIN/'scripts/c-capacity-20261115'
MINIO=ROOT/'work/minio-official-build/bin/minio'

def call(cmd,**kwargs):
    result=subprocess.run(cmd,env=ENV,**kwargs)
    if result.returncode: raise RuntimeError('command failed '+str(result.returncode))
    return result

def unit(name,cmd,cpu,memory,extra=[]):
    call(['systemd-run','--user','--unit='+name,'-p','CPUQuota='+str(cpu)+'%','-p','MemoryMax='+str(memory),
          '-p','MemorySwapMax=0','-p','TasksMax=128','-p','RuntimeMaxSec=1800',
          '-p','StandardOutput=append:'+str(RUN/(name+'.log')),'-p','StandardError=append:'+str(RUN/(name+'.log')),
          '--working-directory='+str(PROJECT),'--setenv=PATH='+ENV['PATH'],'--setenv=NEXT_TELEMETRY_DISABLED=1']+extra+cmd)

def cg(name):
    r=subprocess.run(['systemctl','--user','show',name,'--property=ControlGroup','--value'],env=ENV,text=True,capture_output=True,check=True)
    return '/sys/fs/cgroup'+r.stdout.strip()

def sync():
    shutil.copytree(SOURCE,PROJECT,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__'))

def treebytes(p):return sum(x.stat().st_size for x in p.rglob('*') if x.is_file())

def filehash(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def export():
    dest=WIN/'evidence/c-capacity-20261115';dest.mkdir(exist_ok=True)
    for name in ['smoke-1','smoke-2','smoke-3','formal-1']:
        root=RUN/name
        if not root.exists():continue
        for p in root.rglob('*'):
            if not p.is_file() or 'cache' in p.relative_to(root).parts or p.name=='config.json':continue
            target=dest/name/p.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
    for count in ['10000','100000','10000-oracle2','100000-oracle2']:
        root=RUN/('fixture-'+count)
        if not root.exists():continue
        target=dest/('fixture-'+count);target.mkdir(exist_ok=True)
        shutil.copy2(root/'build-report.json',target/'build-report.json')
        for v in ['v1','v2']:shutil.copy2(root/v/'manifest.json',target/(v+'-manifest.json'))
    for name in ['next-build-receipt.json','freeze-before.json','freeze-after.json','dr-cap-reader-20261115.log','dr-cap-minio-20261115.log']:
        if (RUN/name).exists():shutil.copy2(RUN/name,dest/name)
    print('exported sanitized evidence; credentials/runtime objects excluded')

if __name__=='__main__':
    RUN.mkdir(exist_ok=True)
    action=sys.argv[1]
    if action=='hold':
        # WSL systemd services alone do not keep the distribution alive between host calls.
        stop=RUN/'supervisor.stop';start=time.monotonic()
        (RUN/'supervisor.json').write_text(json.dumps({'pid':os.getpid(),'started':time.time(),'maxSeconds':1800}))
        print('WSL experiment lifetime supervisor active',flush=True)
        while not stop.exists() and time.monotonic()-start<1800:time.sleep(1)
        print('WSL experiment lifetime supervisor ended',flush=True)
    elif action=='inventory':
        for cmd in [[NODE,'--version'],[NODE,'-e',"console.log(require('node:sqlite').DatabaseSync!==undefined)"],['npm','cache','ls','next']]:
            p=subprocess.run(cmd,env=ENV,text=True,capture_output=True)
            print(json.dumps({'cmd':cmd,'exit':p.returncode,'out':p.stdout[:2000],'err':p.stderr[:1000]}))
    elif action in ('deps','deps-online'):
        project=RUN/'project';project.mkdir(exist_ok=True)
        package={'private':True,'type':'module','dependencies':{'next':'16.4.5','react':'19.3.1','react-dom':'19.3.1'}}
        (project/'package.json').write_text(json.dumps(package))
        p=subprocess.run(['npm','install','--ignore-scripts','--no-audit','--no-fund']+(['--offline'] if action=='deps' else []),cwd=project,env=ENV)
        sys.exit(p.returncode)
    elif action=='sync':
        sync();print('synced new capacity sources only')
    elif action=='build':
        sync();start=time.monotonic()
        call([NODE,str(PROJECT/'node_modules/next/dist/bin/next'),'build','--webpack'],cwd=PROJECT)
        (RUN/'next-build-receipt.json').write_text(json.dumps({'elapsedSeconds':time.monotonic()-start,'node':NODE,'next':'16.4.5'}))
    elif action=='fixture':
        sync();count=sys.argv[2];target=RUN/('fixture-'+count+(('-'+sys.argv[3]) if len(sys.argv)>3 else ''))
        call([NODE,str(PROJECT/'fixture.mjs'),str(target),count],cwd=PROJECT)
    elif action=='minio':
        private=RUN/'private.json'
        if not private.exists():
            private.write_text(json.dumps({'accessKey':'cap'+secrets.token_hex(8),'secretKey':secrets.token_hex(24),'adminToken':secrets.token_hex(24)}));private.chmod(0o600)
        c=json.loads(private.read_text());data=RUN/'minio-data';data.mkdir(exist_ok=True)
        envfile=RUN/'minio.env';envfile.write_text('MINIO_ROOT_USER='+c['accessKey']+'\nMINIO_ROOT_PASSWORD='+c['secretKey']+'\nMINIO_BROWSER=off\nMINIO_UPDATE=off\n');envfile.chmod(0o600)
        unit('dr-cap-minio-20261115',[str(MINIO),'server',str(data),'--address','127.0.0.1:19540','--console-address','127.0.0.1:19541'],100,536870912,['-p','EnvironmentFile='+str(envfile)])
        print(json.dumps({'cgroup':cg('dr-cap-minio-20261115'),'binarySha256':hashlib.sha256(MINIO.read_bytes()).hexdigest()}))
    elif action=='configure':
        count,name=sys.argv[2:4];fixture=RUN/('fixture-'+count+(('-'+sys.argv[4]) if len(sys.argv)>4 else ''));target=RUN/name;target.mkdir()
        c=json.loads((RUN/'private.json').read_text());c.update({'endpoint':'http://127.0.0.1:19540','bucket':'c-capacity-'+count,'baseUrl':'http://127.0.0.1:3172/api/capi','cacheDir':str(target/'cache'),'eventLog':str(target/'events.ndjson'),'runtimeDir':str(RUN),'artifactDir':str(fixture),'releases':{}})
        for v in ['v1','v2']:c['releases'][v]=json.loads((fixture/v/'manifest.json').read_text())['db']
        c['testHooks']=name.startswith('smoke');c['diskBaselineBytes']=treebytes(RUN);c['diskGuardFile']=str(target/'disk-guard.json')
        config=target/'config.json';config.write_text(json.dumps(c));config.chmod(0o600)
        print('configured '+name)
    elif action=='publish':
        name=sys.argv[2];target=RUN/name;c=json.loads((target/'config.json').read_text());ENV['CAP_CONFIG']=str(target/'config.json')
        call([NODE,str(PROJECT/'publish.mjs'),c['artifactDir'],str(target/'publish.json')],cwd=PROJECT)
    elif action=='reader':
        name=sys.argv[2];target=RUN/name;cfg=target/'config.json'
        unit('dr-cap-reader-20261115',[NODE,str(PROJECT/'node_modules/next/dist/bin/next'),'start','--port','3172','--hostname','127.0.0.1'],200,1073741824,
             ['--setenv=CAP_CONFIG='+str(cfg),'--setenv=CAP_SERVICE_URL='+(PROJECT/'service.mjs').as_uri()])
        c=json.loads(cfg.read_text());c.update({'readerCgroup':cg('dr-cap-reader-20261115'),'minioCgroup':cg('dr-cap-minio-20261115')});cfg.write_text(json.dumps(c));cfg.chmod(0o600)
        limits={}
        for key in ['readerCgroup','minioCgroup']:
            p=Path(c[key]);limits[key]={f:(p/f).read_text().strip() for f in ['cpu.max','memory.max','memory.swap.max','cgroup.procs','memory.events']}
        (target/'limits.json').write_text(json.dumps(limits,indent=2));print(json.dumps(limits))
    elif action=='ready':
        import urllib.request
        name=sys.argv[2];last=None
        for attempt in range(20):
            try:
                with urllib.request.urlopen('http://127.0.0.1:3172/api/capi/status',timeout=55) as response:
                    data=json.load(response)
                (RUN/name/'ready.json').write_text(json.dumps(data,indent=2));print(json.dumps(data));break
            except Exception as e:
                last=str(e);time.sleep(.5)
        else:raise RuntimeError(last)
    elif action=='load':
        name,mode=sys.argv[2:4];target=RUN/name;c=json.loads((target/'config.json').read_text())
        if treebytes(RUN)>8*1024**3:raise RuntimeError('8GiB disk guard')
        stop=threading.Event()
        def monitor():
            while not stop.is_set():
                used=treebytes(RUN);free=shutil.disk_usage(RUN).free
                row={'at':time.time(),'logicalBytes':used,'freeBytes':free}
                with (target/'disk.ndjson').open('a') as f:f.write(json.dumps(row)+'\n')
                if used>8*1024**3 or free<10*1024**3:
                    Path(c['diskGuardFile']).write_text(json.dumps(row));break
                stop.wait(5)
        monitorThread=threading.Thread(target=monitor,daemon=True);monitorThread.start()
        try:call([NODE,str(PROJECT/'load.mjs'),'--config',str(target/'config.json'),'--oracle',str(Path(c['artifactDir'])/'oracle.json'),'--out',str(target/'load'),'--mode',mode],cwd=PROJECT)
        finally:
            stop.set();monitorThread.join(timeout=10)
            if mode=='formal':
                for service in ['dr-cap-reader-20261115','dr-cap-minio-20261115']:
                    subprocess.run(['systemctl','--user','stop',service+'.service'],env=ENV)
    elif action=='stop-reader':
        call(['systemctl','--user','stop','dr-cap-reader-20261115.service'])
        subprocess.run(['systemctl','--user','reset-failed','dr-cap-reader-20261115.service'],env=ENV,capture_output=True)
    elif action=='freeze':
        files=[p for p in SOURCE.rglob('*') if p.is_file() and '__pycache__' not in p.parts]
        files += [PROJECT/p.relative_to(SOURCE) for p in list(files)]
        private=json.loads((RUN/'formal-1/config.json').read_text())
        public={k:v for k,v in private.items() if k not in ['accessKey','secretKey','adminToken']}
        public['privateConfigSha256']=filehash(RUN/'formal-1/config.json')
        (RUN/'formal-1/config-public.json').write_text(json.dumps(public,indent=2))
        files += [RUN/'formal-1/config-public.json',RUN/'formal-1/limits.json',WIN/'docs/C_CAPACITY_PLAN_20261115.md']
        files += [PROJECT/'package-lock.json',PROJECT/'node_modules/next/package.json',PROJECT/'node_modules/react/package.json',Path(NODE)]
        files += [p for p in (PROJECT/'.next/server').rglob('*') if p.is_file()]
        for v in ['v1','v2']:files += [RUN/'fixture-100000-oracle2'/v/'search.sqlite',RUN/'fixture-100000-oracle2'/v/'manifest.json']
        files += [RUN/'fixture-100000-oracle2'/'oracle.json']
        receipt={'at':time.time(),'files':{str(p):{'sha256':filehash(p),'bytes':p.stat().st_size} for p in files}}
        with (RUN/'freeze-before.json').open('x') as f:json.dump(receipt,f,indent=2)
        print('frozen '+str(len(files))+' inputs/build outputs')
    elif action=='verify':
        before=json.loads((RUN/'freeze-before.json').read_text());mismatches=[]
        for name,expected in before['files'].items():
            p=Path(name)
            if not p.exists() or filehash(p)!=expected['sha256']:mismatches.append(name)
        with (RUN/'freeze-after.json').open('x') as f:json.dump({'at':time.time(),'checked':len(before['files']),'mismatches':mismatches},f,indent=2)
        print(json.dumps({'checked':len(before['files']),'mismatches':mismatches}))
    elif action=='export':export()
    elif action=='stop':
        for name in ['dr-cap-reader-20261115','dr-cap-minio-20261115']:
            subprocess.run(['systemctl','--user','stop',name+'.service'],env=ENV)
        (RUN/'supervisor.stop').write_text('stopped')
        print('stopped this experiment units only')
