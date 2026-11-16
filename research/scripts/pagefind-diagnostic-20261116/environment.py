from pathlib import Path
import json,hashlib,shutil,subprocess,sys,time
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
RUN=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo/.lab/pagefind-gate-20261116')
D1=RUN/'d1'
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def prepare():
    D1.mkdir();(D1/'traces').mkdir()
    subprocess.run([sys.executable,str(WIN/'scripts/pagefind-diagnostic-20261116/prepare-instrumentation.py'),str(RUN),str(D1)],check=True)
    src=D1/'src/gate'
    shutil.copy2(WIN/'scripts/pagefind-diagnostic-20261116/runner.mjs',src/'runner.mjs')
    for name in ['oracle.mjs','controller.py']:shutil.copy2(RUN/'g2/src'/name,src/name)
    shutil.copytree(RUN/'g2/artifacts/api',D1/'api')
    (D1/'node_modules').symlink_to((RUN/'g2/node_modules').resolve(),target_is_directory=True)
    files={}
    def add(p):files[str(p.resolve())]={'absolutePath':str(p.resolve()),'sha256':sha(p),'bytes':p.stat().st_size}
    for folder in [D1/'src',D1/'api']:
        for p in folder.rglob('*'):
            if p.is_file():add(p)
    # Preserve earlier frozen dependency and evidence pins, then add this build.
    prior=json.loads((RUN/'g2/freeze.json').read_text())
    for f in prior['files']:
        p=Path(f['absolutePath']);assert sha(p)==f['sha256'];add(p)
    for p in [WIN/'docs/PAGEFIND_D1_PLAN_20261116.md',WIN/'scripts/pagefind-diagnostic-20261116/environment.py',WIN/'scripts/pagefind-diagnostic-20261116/prepare-instrumentation.py',RUN/'g2/freeze.json']:add(p)
    with (D1/'freeze.json').open('x') as f:json.dump({'at':time.time(),'files':list(files.values()),'reuse':'Copied completed G2 Next production build; new server, same query/artifact, trace only. No rebuild or warmup query.'},f,indent=2)
    print(json.dumps({'prepared':str(D1),'frozen':len(files)}))
def export():
    out=WIN/'evidence/pagefind-diagnostic-20261116';out.mkdir(parents=True,exist_ok=True)
    for p in D1.rglob('*'):
        if p.is_file() and not any(x in p.relative_to(D1).parts for x in ['node_modules','api','src','runtime']):
            dst=out/p.relative_to(D1);dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst)
    print(json.dumps({'exported':str(out)}))
if __name__=='__main__':{'prepare':prepare,'export':export}[sys.argv[1]]()
