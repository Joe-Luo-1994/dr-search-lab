from pathlib import Path
import json,hashlib,subprocess,time
ROOT=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo')
RUN=ROOT/'.lab/c-million-20261116'
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
installed=[]
for v in ['v1','v2']:
    source=RUN/'fixture-1000000'/v/'search.sqlite';local=RUN/'fallback-1/cache'/v/'search.sqlite'
    expected=digest(source);actual=digest(local)
    installed.append({'version':v,'source':str(source),'installed':str(local),'bytes':local.stat().st_size,'sourceSha256':expected,'installedSha256':actual,'match':expected==actual,'activated':v=='v1'})
units={name:subprocess.run(['systemctl','--user','show',name,'--property=ActiveState,SubState,Result,ExecMainStatus,MainPID'],text=True,capture_output=True).stdout for name in ['dr-million-reader-20261116','dr-million-minio-20261116']}
ss=subprocess.run(['ss','-ltnp'],capture_output=True,text=True,check=True).stdout
ports=[line for line in ss.splitlines() if any(':'+str(p)+' ' in line for p in [3174,19640,19641])]
last=json.loads((RUN/'fallback-1/load/result.json').read_text())['lastResources']
pids=sorted(set(p for g in last['groups'].values() for p in g['processes']))
live=[pid for pid in pids if Path('/proc/'+str(pid)).exists()]
record={'at':time.time(),'installed':installed,'units':units,'remainingListeners':ports,'lastObservedPids':pids,'remainingObservedPids':live,'note':'Next SIGTERM exit143 is controller cleanup, not load failure. V2 byte hash matches but failed ready and never activated. No sustained post-update-failure recovery test.'}
out=WIN/'evidence/c-million-20261116/cleanup.json'
with out.open('x') as f:json.dump(record,f,indent=2)
assert all(x['match'] for x in installed)
assert not ports and not live
print(json.dumps({'installedHashesMatch':True,'portsClosed':True,'observedPidsGone':True}))
