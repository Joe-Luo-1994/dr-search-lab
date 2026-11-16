from pathlib import Path
import hashlib,json,shutil
win=Path('/PUBLIC/WINDOWS_WORKSPACE')
native=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo')
data=json.loads((win/'evidence/c-scale-20261116/analysis.json').read_text())
passed=next((x for x in data if x['allTargetPhasesQualified']),None)
outcome=('找到'+('4CPU8GiB4workers' if passed['attempt']=='r1' else '8CPU12GiB8workers')+'可行工作點') if passed else '擴容後仍未完整達標'
marker='**2026-11-16 K5擴容：'+outcome+'，停止本輪擴容。**'
intro=marker+' [手機報告](C_SCALE_RESULT_20261116.html)／[結果續接](C_SCALE_RESULT_20261116.md)／[review](C_SCALE_POSTREVIEW_20261116.md)／[維運帳](C_SCALE_OPERATIONS_LEDGER_20261116.md)。主目標DevOps長期工時；資源是可行性與減少客製的手段。R1(4CPU8GiB4workers)前六階通過，更新能力完整但Web/reading延遲及5拒絕未全合格；CPU節流排隊支持唯一R2，不稱RAM不足已證。固定工作點Web4journeys/s+reading1/s+consumer2/s+bulk2/s及V1→V2更新180s；SQL/queue16/content4/deadline不變、MinIO4CPU4GiB。R1/R2為部署preset比較非純CPU因果；不證最低資源、正式容量或月工時。多版連續更新、V3/GC/rollback/告警與worker fatal自動復原仍未驗。每輪80freeze與installed DB核對、原失敗保留，清理結果見receipt。服務已停止，資料保留；不自動第三階／新引擎負載。下一價值是操作交接與生命週期缺口，ES/Pagefind等仍為待測對照，A成本未知。scripts/c-scale-20261116與c-scale-report-20261116；evidence/c-scale-20261116；native .lab/c-scale-20261116。\n\n'
for name in ['HANDOFF.md','LOCAL_E1_HANDOFF.md']:
    p=win/'docs'/name;t=p.read_text()
    if marker not in t:p.write_text(intro+t)
p=win/'docs/DR_DISCUSSION_REGISTER.md'
if marker not in p.read_text():p.write_text(p.read_text()+'\n'+intro)
files=list((win/'docs').glob('C_SCALE_*'))+[win/'docs'/x for x in ['HANDOFF.md','LOCAL_E1_HANDOFF.md','DR_DISCUSSION_REGISTER.md']]
for folder in ['scripts/c-scale-20261116','scripts/c-scale-report-20261116','evidence/c-scale-20261116']:
    files += [p for p in (win/folder).rglob('*') if p.is_file() and p.name!='delivery.json' and '__pycache__' not in p.parts]
records=[]
for p in files:
    rel=p.relative_to(win);dst=native/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst)
    digest=hashlib.sha256(p.read_bytes()).hexdigest();assert hashlib.sha256(dst.read_bytes()).hexdigest()==digest
    records.append({'path':str(rel),'bytes':p.stat().st_size,'sha256':digest,'readBackMatch':True})
receipt=win/'evidence/c-scale-20261116/delivery.json'
with receipt.open('x') as f:json.dump({'allMatch':True,'files':records,'scope':'reports, scripts and sanitized evidence only; no DB copies or credentials; no commit/push'},f,indent=2)
shutil.copy2(receipt,native/receipt.relative_to(win));print(json.dumps({'count':len(records),'allMatch':True}))
