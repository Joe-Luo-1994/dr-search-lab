from pathlib import Path
import shutil,json,hashlib
src=Path('/PUBLIC/WINDOWS_WORKSPACE')
dst=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo')
folders=['scripts/c-capacity-20261115','scripts/c-capacity-report-20261116','evidence/c-capacity-20261115']
docs=['HANDOFF.md','LOCAL_E1_HANDOFF.md','DR_DISCUSSION_REGISTER.md','C_CAPACITY_PLAN_20261115.md','C_CAPACITY_DESIGN_REVIEW_20261115.md','C_CAPACITY_POSTREVIEW_20261116.md','C_CAPACITY_COST_LEDGER_20261116.md','C_CAPACITY_RESULT_20261116.md','C_CAPACITY_RESULT_20261116.html']
files=[src/'docs'/name for name in docs]
for folder in folders:files.extend(p for p in (src/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='handoff-sync.json')
rows=[]
for p in files:
    target=dst/p.relative_to(src);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
    h=hashlib.sha256(p.read_bytes()).hexdigest()
    assert hashlib.sha256(target.read_bytes()).hexdigest()==h
    rows.append({'path':str(p.relative_to(src)),'bytes':p.stat().st_size,'sha256':h})
receipt={'scope':'docs, new source, sanitized evidence only; runtime secrets/data not copied','count':len(rows),'files':rows}
for root in [src,dst]:(root/'evidence/c-capacity-20261115/handoff-sync.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps({'copiedAndVerified':len(rows)}))
