from pathlib import Path
import hashlib,json,shutil,time
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
NATIVE=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo')
marker='**2026-11-16 K4：查詢成本分散在count與Top10，診斷完成，尚未優化。**'
intro=marker+''' [手機分項圖解](C_QUERY_COST_RESULT_20261116.html)／[結果](C_QUERY_COST_RESULT_20261116.md)／[獨立裁定](C_QUERY_COST_POSTREVIEW_20261116.md)。原SQL/百萬V1/2CPU4GiB不改，只9原worker reference、45profile(9形×5輪)、後置9組EQP，27.15s完成。五次合計count42.47%、Top1057.51%、結果補Tags0.014%；兩大段都含FTS/JOIN/filter，不能稱純排序或獨立filter成本。common中位777.7ms、space5051結果仍497.4ms、雙Tags1041ms；無單一count根因。54source與45ordered reference均符，原worker退出後才profile，兩child在cgroup；Node/SQLite/PRAGMA實讀匹配。14freeze含DB前後相同、unit正常0退出；沒有Next/MinIO/Web負載或產品改造。下一唯一候選先核stat現況/compile options，再在新DB副本只補pages/page_tags統計、原SQL/結果/資源不變，與同時期原副本成對比較全九形與反例，記分析時間/大小/hash；未執行且不保證改善。K2更新失敗及K3Web競爭仍未解，8GiB仍暫緩，A增量成本未知。runner scripts/c-query-cost-20261116；evidence/c-query-cost-20261116；native .lab/c-query-cost-20261116。未改K2/K3凍結檔，停止本輪，不自動更多備案。

'''
for name in ['HANDOFF.md','LOCAL_E1_HANDOFF.md']:
    p=WIN/'docs'/name;t=p.read_text(encoding='utf-8')
    if marker not in t:p.write_text(intro+t,encoding='utf-8')
p=WIN/'docs/DR_DISCUSSION_REGISTER.md';t=p.read_text(encoding='utf-8')
if marker not in t:p.write_text(t+'\n- '+intro.strip()+'\n',encoding='utf-8')
files=list((WIN/'docs').glob('C_QUERY_COST_*'))+[WIN/'docs'/x for x in ['HANDOFF.md','LOCAL_E1_HANDOFF.md','DR_DISCUSSION_REGISTER.md']]
for name in ['scripts/c-query-cost-20261116','scripts/c-query-cost-report-20261116','evidence/c-query-cost-20261116']:
    files += [p for p in (WIN/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='delivery.json']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
records=[]
for p in files:
    relative=p.relative_to(WIN);target=NATIVE/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
    expected=sha(p);assert sha(target)==expected,str(relative)
    records.append({'path':str(relative),'bytes':p.stat().st_size,'sha256':expected,'readBackMatch':True})
receipt=WIN/'evidence/c-query-cost-20261116/delivery.json'
with receipt.open('x') as f:json.dump({'at':time.time(),'count':len(records),'allMatch':True,'files':records,'scope':'project scripts, reports and evidence only; no DB copy/credentials/commit/push'},f,indent=2)
shutil.copy2(receipt,NATIVE/receipt.relative_to(WIN));print(json.dumps({'count':len(records),'allMatch':True}))
