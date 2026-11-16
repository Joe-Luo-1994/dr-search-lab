"""Prepare an isolated one-file-instrumented Pagefind bundle. No query."""
from pathlib import Path
import hashlib,json,shutil,subprocess,sys,time
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
RUN=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo/.lab/pagefind-gate-20261116')
D2=RUN/'d2'
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def prepare():
    D2.mkdir();(D2/'traces').mkdir()
    shutil.copytree(RUN/'d1/src',D2/'src')
    shutil.copytree(RUN/'d1/api',D2/'api')
    (D2/'node_modules').symlink_to((RUN/'d1/node_modules').resolve(),target_is_directory=True)
    original=RUN/'artifacts/artifact-100000';artifact=D2/'artifact'
    shutil.copytree(original,artifact)
    target=artifact/'pagefind/pagefind.js'
    # Generator creates new output exclusively; hold the pristine copied bytes separately.
    copied=D2/'original-pagefind.js';target.replace(copied)
    helper=(D2/'src/gate/trace.mjs').as_uri()
    instrumented=D2/'instrumented-pagefind.js'
    subprocess.run([sys.executable,str(WIN/'scripts/pagefind-d2-20261116/instrument-runtime.py'),str(copied),str(instrumented),helper],check=True)
    instrumented.replace(target)
    invpath=RUN/'evidence/artifact-inventory.json';originalInventory=json.loads(invpath.read_text())
    verification=json.loads((RUN/'evidence/g1-verification.json').read_text());assert sha(invpath)==verification['inventorySha256']
    expected=set();changes=[]
    for entry in originalInventory['files']:
        p=artifact/entry['path'];expected.add(entry['path']);actual=sha(p)
        if entry['path']=='pagefind/pagefind.js':
            assert sha(copied)==entry['sha256']
            changes.append({'path':entry['path'],'oldSha256':entry['sha256'],'newSha256':actual,'oldBytes':entry['bytes'],'newBytes':p.stat().st_size})
            entry.update(sha256=actual,bytes=p.stat().st_size)
        else:assert actual==entry['sha256'] and p.stat().st_size==entry['bytes'], 'Unexpected artifact change:'+entry['path']
    actualPaths=set()
    for p in artifact.rglob('*'):
        assert not p.is_symlink(),'Unexpected symlink'
        if p.is_file():actualPaths.add(p.relative_to(artifact).as_posix())
        else:assert p.is_dir(),'Special artifact'
    assert actualPaths==expected and len(changes)==1
    (D2/'artifact-inventory.json').write_text(json.dumps(originalInventory,indent=2)+'\n')
    provenance={'originalInventorySha256':sha(invpath),'modifiedInventorySha256':sha(D2/'artifact-inventory.json'),'changes':changes,'unchangedFiles':len(expected)-1,'fileCount':len(expected),'scope':'Diagnostic-only JS trace edit; not byte-identical original bundle'}
    (D2/'provenance.json').write_text(json.dumps(provenance,indent=2))
    # Preserve D1 runner semantics; only redirect its hash validation to this explicit diagnostic artifact.
    rp=D2/'src/gate/runner.mjs';code=rp.read_text()
    old="const inventoryBytes=await readFile(path.join(run,'evidence/artifact-inventory.json'));"
    new="const provenance=JSON.parse(await readFile(path.join(root,'provenance.json'),'utf8'));const inventoryBytes=await readFile(path.join(root,'artifact-inventory.json'));"
    assert code.count(old)==1;code=code.replace(old,new)
    old="assert.equal(createHash('sha256').update(inventoryBytes).digest('hex'),v.inventorySha256);assert(v.verified);"
    new="assert.equal(v.inventorySha256,provenance.originalInventorySha256);assert.equal(createHash('sha256').update(inventoryBytes).digest('hex'),provenance.modifiedInventorySha256);assert(v.verified);"
    assert code.count(old)==1;code=code.replace(old,new)
    old="const artifact=path.join(run,'artifacts/artifact-100000');"
    assert code.count(old)==1;code=code.replace(old,"const artifact=path.join(root,'artifact');")
    code=code.replace("stage:'D1'","stage:'D2'").replace("id:'D1-first-query'","id:'D2-first-query'")
    rp.write_text(code)
    # The helper now traces the generated runtime; keep its observer accounting unchanged.
    files={}
    def add(p):files[str(p.resolve())]={'absolutePath':str(p.resolve()),'sha256':sha(p),'bytes':p.stat().st_size}
    for folder in [D2/'src',D2/'api']:
        for p in folder.rglob('*'):
            if p.is_file():add(p)
    for name in ['provenance.json','artifact-inventory.json','original-pagefind.js','instrumented-pagefind.js.receipt.json','instrumented-pagefind.js.patch']:add(D2/name)
    prior=json.loads((RUN/'d1/freeze.json').read_text())
    for entry in prior['files']:
        p=Path(entry['absolutePath']);assert sha(p)==entry['sha256'];add(p)
    for p in [WIN/'docs/PAGEFIND_D2_PLAN_20261116.md',WIN/'scripts/pagefind-d2-20261116/environment.py',WIN/'scripts/pagefind-d2-20261116/instrument-runtime.py']:add(p)
    with (D2/'freeze.json').open('x') as f:json.dump({'at':time.time(),'files':list(files.values()),'provenance':provenance,'cases':1},f,indent=2)
    print(json.dumps({'prepared':str(D2),'files':len(files),'artifactFiles':len(expected),'changes':changes}))
def export():
    out=WIN/'evidence/pagefind-d2-20261116';out.mkdir(parents=True,exist_ok=True)
    for p in D2.rglob('*'):
        if p.is_file() and not any(x in p.relative_to(D2).parts for x in ['node_modules','api','src','runtime','artifact']):
            q=out/p.relative_to(D2);q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
    print(json.dumps({'exported':str(out)}))
if __name__=='__main__':{'prepare':prepare,'export':export}[sys.argv[1]]()
