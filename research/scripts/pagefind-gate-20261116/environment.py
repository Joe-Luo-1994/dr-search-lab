"""Isolated Pagefind gate setup. No builder or server is started here."""
from pathlib import Path
import os,sys,json,hashlib,shutil,subprocess,time
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
REPO=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo')
RUN=REPO/'.lab/pagefind-gate-20261116'
NODE=Path('/PUBLIC/LINUX_HOME/.nvm/versions/node/v22.18.0/bin/node')
ENV=dict(os.environ,PATH=str(NODE.parent)+':'+os.environ['PATH'],NEXT_TELEMETRY_DISABLED='1')
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def prepare():
    RUN.mkdir()
    (RUN/'evidence').mkdir();src=RUN/'src';src.mkdir()
    originals={}
    for group in ['ms1-experiment','ms1-review','ms1-api-lab']:
        origin=REPO/'scripts'/group;dest=src/group
        shutil.copytree(origin,dest,ignore=shutil.ignore_patterns('node_modules','.next*','__pycache__'))
        for p in dest.rglob('*'):
            if p.is_file():originals[str(p.relative_to(src))]={'sha256':sha(p),'originSha256':sha(origin/p.relative_to(dest))}
    pf=src/'pagefind';pf.mkdir()
    for n in ['package.json','package-lock.json']:shutil.copy2(REPO/'scripts/pagefind'/n,pf/n)
    # A separate dependency tree, pinned by the preserved lockfile. No repo package changes.
    with (RUN/'evidence/npm-pagefind.log').open('w') as log:
        subprocess.run([str(NODE.parent/'npm'),'ci','--no-audit','--no-fund'],cwd=pf,env=ENV,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=180)
    project=REPO/'.lab/c-million-20261116/project'
    assert (project/'node_modules/next/package.json').is_file()
    (src/'node_modules').symlink_to(project/'node_modules',target_is_directory=True)
    (RUN/'setup.json').write_text(json.dumps({'at':time.time(),'originals':originals,'node':str(NODE),'versions':json.loads(subprocess.check_output([str(NODE),'-p','JSON.stringify(process.versions)'],text=True)),'note':'Historical MS1 used Node22.21.1; this isolated run uses22.18.0, ICU77.1. No parity attribution to RAM alone.'},indent=2))
    print(json.dumps({'prepared':str(RUN),'originals':len(originals)}))
def freeze():
    dest=RUN/'src/gate';dest.mkdir(exist_ok=True)
    for p in (WIN/'scripts/pagefind-gate-20261116').iterdir():
        if p.is_file():shutil.copy2(p,dest/p.name)
    files={}
    for p in (RUN/'src').rglob('*'):
        if p.is_file() and not p.is_symlink() and '.next-review' not in p.parts:
            files[str(p.relative_to(RUN))]={'sha256':sha(p),'bytes':p.stat().st_size}
    with (RUN/'freeze.json').open('x') as f:json.dump({'at':time.time(),'files':files,'setupSha256':sha(RUN/'setup.json'),'nodeSha256':sha(NODE),'sharedNextVersion':json.loads((RUN/'src/node_modules/next/package.json').read_text())['version']},f,indent=2)
    print(json.dumps({'frozen':len(files)}))
def export():
    out=WIN/'evidence/pagefind-gate-20261116';out.mkdir(exist_ok=True,parents=True)
    for p in (RUN/'evidence').rglob('*'):
        if p.is_file():
            d=out/p.relative_to(RUN/'evidence');d.parent.mkdir(exist_ok=True,parents=True);shutil.copy2(p,d)
    for n in ['setup.json','freeze.json']:
        if (RUN/n).exists():shutil.copy2(RUN/n,out/n)
    print(json.dumps({'exported':str(out)}))
if __name__=='__main__':{'prepare':prepare,'freeze':freeze,'export':export}[sys.argv[1]]()
