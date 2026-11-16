from pathlib import Path
import hashlib,json,shutil
win=Path('/PUBLIC/WINDOWS_WORKSPACE')
native=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo')
marker='**2026-11-16 O1：重啟選版六案例通過，reviewer 有限結案。**'
intro=marker+' [手機報告](C_RESTART_RESULT_20261116.html)／[結果與維運責任](C_RESTART_RESULT_20261116.md)／[獨立審查](C_RESTART_POSTREVIEW_20261116.md)。固定遠端 approved→manifest→DB／cache驗證→Pool檢查→active→ready；同cache V1升V2、空cache V2、重用V2不重抓DB均通過，兩壞manifest pin案例503且cache/active不變。1000/1001頁低頻，非容量/RTO/Kubernetes。629凍結輸入不變，原K5未改；服務停止、有效V2指標恢復，原反例保留。新增bootstrap/publisher/啟動接縫維護責任，沒有新增常駐服務種類；人工工時仍未知。startup-only明確關閉熱更新，不能與K5拼成已整合系統；自動重試/告警/GC/rollback未驗。下一決策先界定指標壞掉時等待修復或容許受控舊版服務，再選最小整合；本輪停止，不擴故障矩陣或壓測。scripts/c-restart-20261116、scripts/c-restart-report-20261116、evidence/c-restart-20261116；native .lab/c-restart-20261116。\n\n'
for name in ['HANDOFF.md','LOCAL_E1_HANDOFF.md']:
    p=win/'docs'/name;t=p.read_text()
    if marker not in t:p.write_text(intro+t)
p=win/'docs/DR_DISCUSSION_REGISTER.md'
if marker not in p.read_text():p.write_text(p.read_text()+'\n'+intro)
files=list((win/'docs').glob('C_RESTART_*'))+[win/'docs'/x for x in ['HANDOFF.md','LOCAL_E1_HANDOFF.md','DR_DISCUSSION_REGISTER.md']]
for folder in ['scripts/c-restart-20261116','scripts/c-restart-report-20261116','evidence/c-restart-20261116']:
    files += [p for p in (win/folder).rglob('*') if p.is_file() and p.name!='delivery.json' and '__pycache__' not in p.parts]
records=[]
for p in files:
    rel=p.relative_to(win);dst=native/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst)
    digest=hashlib.sha256(p.read_bytes()).hexdigest();assert hashlib.sha256(dst.read_bytes()).hexdigest()==digest
    records.append({'path':str(rel),'bytes':p.stat().st_size,'sha256':digest,'readBackMatch':True})
receipt=win/'evidence/c-restart-20261116/delivery.json'
with receipt.open('x') as f:json.dump({'allMatch':True,'files':records,'scope':'reports, scripts, sanitized evidence; no credentials/DB exports/commit/push'},f,indent=2)
shutil.copy2(receipt,native/receipt.relative_to(win));print(json.dumps({'count':len(records),'allMatch':True}))
