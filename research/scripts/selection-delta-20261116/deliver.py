from pathlib import Path
import json,hashlib,shutil
win=Path('/PUBLIC/WINDOWS_WORKSPACE')
native=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo')
marker='**2026-11-16 選型校正：比較 A／C 維運差額，不先把 C 產品化做完。**'
intro=marker+' 使用者已明確確認。共同資料新鮮度／舊版服務政策先列共同需求，只有實作差異影響選型才深入；取代O1「下一步先展開stale-serving」建議，歷史報告保留。[手機材料](DR_SELECTION_DELTA_20261116.html)／[差額帳與操作卡](DR_SELECTION_DELTA_20261116.md)／[獨立審查](DR_SELECTION_DELTA_REVIEW_20261116.md)。唯一優先行動：用A公司既有runbook/IaC或相似站點紀錄走查新增一站及常態維護，核可重用量、一次性/持續/每站增量、owner與頻率；每日更新/失敗復原為同次輔助卡。不外發、不要求新演練。A資料缺乏則保留未知並停止勝負判斷，不能用B或更多C實驗代答。A維持完整可行基準，C有受控候選資格；K5 reader8CPU12GiB另MinIO4CPU4GiB，O1 startup-only不拼成已整合容量版。C移除BE/MariaDB與換ES是兩軸；有客製本身不淘汰，必要行為不成立或維護抵銷淨省才支持偏A。暫停新容量/引擎/復原矩陣，不擅自選成本勝者。\n\n'
for name in ['HANDOFF.md','LOCAL_E1_HANDOFF.md','DR_OPERATIONS_PRIORITY_20261116.md']:
    p=win/'docs'/name;t=p.read_text()
    if marker not in t:p.write_text(intro+t)
p=win/'docs/DR_DISCUSSION_REGISTER.md'
if marker not in p.read_text():p.write_text(p.read_text()+'\n'+intro)
files=[win/'docs'/x for x in ['DR_SELECTION_DELTA_20261116.md','DR_SELECTION_DELTA_20261116.html','DR_SELECTION_DELTA_REVIEW_20261116.md','HANDOFF.md','LOCAL_E1_HANDOFF.md','DR_OPERATIONS_PRIORITY_20261116.md','DR_DISCUSSION_REGISTER.md']]
for folder in ['scripts/selection-delta-20261116','evidence/selection-delta-20261116']:
    files += [p for p in (win/folder).rglob('*') if p.is_file() and p.name!='delivery.json' and '__pycache__' not in p.parts]
records=[]
for p in files:
    rel=p.relative_to(win);dst=native/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dst)
    sha=hashlib.sha256(p.read_bytes()).hexdigest();assert hashlib.sha256(dst.read_bytes()).hexdigest()==sha
    records.append({'path':str(rel),'sha256':sha,'readBackMatch':True})
receipt=win/'evidence/selection-delta-20261116/delivery.json'
with receipt.open('x') as f:json.dump({'allMatch':True,'files':records,'scope':'decision materials, scripts, UI evidence and continuation; no experiments/credentials/commit/push'},f,indent=2)
shutil.copy2(receipt,native/receipt.relative_to(win));print(json.dumps({'files':len(records),'allMatch':True}))
