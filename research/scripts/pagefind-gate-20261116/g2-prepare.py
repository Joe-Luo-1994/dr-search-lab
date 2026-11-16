"""Prepare/freeze G2 only after G1 gate. No server/build is executed."""
from pathlib import Path
import json,hashlib,shutil,sys,time
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
RUN=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo/.lab/pagefind-gate-20261116')
G2=RUN/'g2'
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def prepare():
    c=json.loads((RUN/'evidence/g1-control/result.json').read_text());v=json.loads((RUN/'evidence/g1-verification.json').read_text())
    assert c['status']=='passed' and c['remainingPids']==[] and c['cleanupErrors']==[] and v['verified'] is True
    G2.mkdir();src=G2/'src';src.mkdir()
    for n in ['oracle.mjs','small-build.mjs','small-core.mjs','serve.mjs','legacy-node.mjs','g2-runner.mjs','controller.py']:
        shutil.copy2(WIN/'scripts/pagefind-gate-20261116'/n,src/n)
    shutil.copytree(WIN/'scripts/pagefind-gate-20261116/api-template',G2/'api-template')
    (G2/'node_modules').symlink_to((RUN/'src/node_modules').resolve(),target_is_directory=True)
    (G2/'pagefind').symlink_to(RUN/'src/pagefind',target_is_directory=True)
    shutil.copytree(RUN.parent.parent/'.lab/pagefind/run-qgtS3h',G2/'legacy')
    files={}
    def add(p):files[str(p.resolve())]={'absolutePath':str(p.resolve()),'sha256':sha(p)}
    for folder in [src,G2/'api-template',G2/'legacy',(G2/'node_modules').resolve()]:
        for p in folder.rglob('*'):
            if p.is_file():add(p)
    prior=json.loads((RUN/'freeze.json').read_text())
    for rel in prior['files']:add(RUN/rel)
    for p in [RUN/'freeze.json',RUN/'evidence/g1-verification.json',RUN/'evidence/g1-control/result.json',RUN/'evidence/artifact-inventory.json'] : add(p)
    with (G2/'freeze.json').open('x') as f:json.dump({'at':time.time(),'files':list(files.values()),'sharedDependenciesFrozen':True,'g1Node':'22.18.0','cases':{'ms1':12,'small':20,'historicalNodeOnly':1},'historicalParity':'Retained historical path/current bytes frozen; no matched historical full inventory and no browser runtime available in inspected locations. No parity closure.'},f,indent=2)
    print(json.dumps({'g2Prepared':str(G2),'frozen':len(files)}))
def export():
    dest=WIN/'evidence/pagefind-gate-20261116/g2';dest.mkdir(exist_ok=True,parents=True)
    for p in G2.rglob('*'):
        if p.is_file() and not any(x in p.relative_to(G2).parts for x in ['node_modules','pagefind','artifacts','src','api-template','legacy']):
            out=dest/p.relative_to(G2);out.parent.mkdir(exist_ok=True,parents=True);shutil.copy2(p,out)
    print(json.dumps({'exported':str(dest)}))
if __name__=='__main__':{'prepare':prepare,'export':export}[sys.argv[1]]()
