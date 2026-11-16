"""Single pre-execution reviewer fix; preserve the initial unexecuted freeze."""
from pathlib import Path
import json,hashlib,shutil,time
ROOT=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo/.lab/pagefind-gate-20261116/d1')
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
assert not (ROOT/'control').exists(), 'Cannot revise after execution'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
old=ROOT/'freeze.json';snapshot=ROOT/'freeze-pre-review-fix.json'
with snapshot.open('xb') as f:f.write(old.read_bytes())
data=json.loads(old.read_text());target=ROOT/'src/gate/runner.mjs';before=sha(target)
shutil.copy2(WIN/'scripts/pagefind-diagnostic-20261116/runner.mjs',target)
changed=[]
for entry in data['files']:
    p=Path(entry['absolutePath']);actual=sha(p)
    if actual!=entry['sha256']:
        assert p==target, 'Unexpected preflight change: '+str(p)
        changed.append({'file':str(p),'old':entry['sha256'],'new':actual})
        entry.update(sha256=actual,bytes=p.stat().st_size)
assert len(changed)==1 and changed[0]['old']==before
data['revision']={'at':time.time(),'reason':'Reviewer: verify actual artifact file set and reject extra/special files before the single query','priorFreezeSha256':sha(snapshot),'changes':changed,'noQueryExecuted':True}
temp=ROOT/'freeze-revised.tmp';temp.write_text(json.dumps(data,indent=2));temp.replace(old)
(ROOT/'preflight-revision.json').write_text(json.dumps(data['revision'],indent=2))
print(json.dumps(data['revision']))
