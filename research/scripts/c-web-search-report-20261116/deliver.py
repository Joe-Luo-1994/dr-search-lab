from pathlib import Path
import hashlib,json,shutil,time
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
NATIVE=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo')
marker='**2026-11-16 K3：沒有API consumer，Web一般搜尋仍會拖慢閱讀。**'
intro=marker+''' [手機結果](C_WEB_SEARCH_RESULT_20261116.html)／[續接](C_WEB_SEARCH_RESULT_20261116.md)／[獨立review](C_WEB_SEARCH_POSTREVIEW_20261116.md)。使用者要求優先驗Web本身，暫緩K2建議的8GiB更新。沿用K2 frozen百萬V1/build、reader2CPU4GiB、MinIO4CPU4GiB；無consumer/bulk/update，九query的Web所需server任務SSR→results，獨立閱讀固定p1每秒1次。單次正式四階各30秒：reading-only P95 11.85ms；search1/s P951074ms/reading15.66；2/s1046ms/13.32；4/s1475ms/reading818.34超500ms。210search+120reading全成功，無取消/漏送/超時；stopnull是正常按門檻結束，非全通過。4/s avg1.924CPU、queue3，無memory.max/OOM增量；Next event-loop最大約22ms。五文字query browser表單通過；filter/identity UI缺，HTTP容量非render/真人接受，固定相位與hotset限制保留。74freeze及installedV1相符，服務端口已停、Next清理143非負載失敗。下個建議先只讀分解count/filter/top10時間，未認定count根因、未批准改total/結果/資源或追加負載；A成本未知、K2更新失敗仍未解。原K2/K1不覆寫，native .lab/c-web-search-20261116，證據evidence/c-web-search-20261116，runner scripts/c-web-search-20261116。

'''
for name in ['HANDOFF.md','LOCAL_E1_HANDOFF.md']:
    p=WIN/'docs'/name;t=p.read_text(encoding='utf-8')
    if marker not in t:p.write_text(intro+t,encoding='utf-8')
p=WIN/'docs/DR_DISCUSSION_REGISTER.md';t=p.read_text(encoding='utf-8')
if marker not in t:p.write_text(t+'\n- '+intro.strip()+'\n',encoding='utf-8')
files=list((WIN/'docs').glob('C_WEB_SEARCH_*'))+[WIN/'docs'/x for x in ['HANDOFF.md','LOCAL_E1_HANDOFF.md','DR_DISCUSSION_REGISTER.md']]
for name in ['scripts/c-web-search-20261116','scripts/c-web-search-report-20261116','evidence/c-web-search-20261116']:
    files += [p for p in (WIN/name).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='delivery.json']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
records=[]
for p in files:
    relative=p.relative_to(WIN);target=NATIVE/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
    expected=sha(p);assert sha(target)==expected,str(relative)
    records.append({'path':str(relative),'bytes':p.stat().st_size,'sha256':expected,'readBackMatch':True})
receipt=WIN/'evidence/c-web-search-20261116/delivery.json'
with receipt.open('x') as f:json.dump({'at':time.time(),'count':len(records),'allMatch':True,'files':records,'scope':'sanitized evidence and project files; no credentials, runtime DB, commit or push'},f,indent=2)
shutil.copy2(receipt,NATIVE/receipt.relative_to(WIN));print(json.dumps({'count':len(records),'allMatch':True}))
