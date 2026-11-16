from pathlib import Path
import hashlib,json,shutil,os
root=Path('/PUBLIC/WINDOWS_WORKSPACE')
target=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo')
assert (target/'package.json').is_file()
names=['docs/DR_ENGINE_COMPARISON_20261116.html','docs/DR_ENGINE_COMPARISON_REVIEW_20261116.md','docs/HANDOFF.md','docs/LOCAL_E1_HANDOFF.md','docs/DR_DISCUSSION_REGISTER.md']
names.append('docs/DR_OPERATIONS_PRIORITY_20261116.md')
for folder in ['scripts/engine-comparison-20261116','evidence/engine-comparison-20261116']:
    names.extend(str(p.relative_to(root)) for p in (root/folder).rglob('*') if p.is_file() and p.name!='delivery.json')
rows=[]
for name in names:
    src=root/name;dst=target/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
    sha=hashlib.sha256(src.read_bytes()).hexdigest();assert hashlib.sha256(dst.read_bytes()).hexdigest()==sha
    rows.append({'path':name,'sha256':sha,'readBackMatch':True})
receipt=root/('evidence/engine-comparison-20261116/'+os.environ.get('DELIVERY_RECEIPT','delivery.json'))
receipt.write_text(json.dumps({'allMatch':True,'files':rows,'scope':'plan, reviewer, handoff and report QA only; no benchmark or database changes'},indent=2))
shutil.copy2(receipt,target/receipt.relative_to(root))
print(json.dumps({'count':len(rows),'allMatch':True}))
