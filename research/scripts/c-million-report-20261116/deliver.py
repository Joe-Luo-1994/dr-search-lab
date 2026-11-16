from pathlib import Path
import hashlib,json,shutil,time
WIN=Path('/PUBLIC/WINDOWS_WORKSPACE')
NATIVE=Path('/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo')
marker='**2026-11-16 百萬頁K2：保留失敗邊界，完整容量目標未通過。**'
intro=marker+''' 先看[手機連續圖解](C_MILLION_RESULT_20261116.html)、[結果／成本／續接](C_MILLION_RESULT_20261116.md)及[獨立事後裁定](C_MILLION_POSTREVIEW_20261116.md)。原2CPU/1GiB止於ready；唯一記憶體備案2CPU/4GiB可ready，固定Web1journey/s時consumer2/s的Web P95約439ms，4/s升至2978ms超過研究500ms門檻，8/16未跑。降回2/s再加附件2/s合格；更新V2下載49.4s後新pool30s啟動檢查逾時，未啟用。更新階423已送任務全成功、477預定工作未送取消，不能稱HTTP錯誤；事件重算246任務與下載重疊，原result overlap0由缺success receipt造成並保留。reader更新達4GiB／memory.max+28778；MinIO有reclaim但無OOM、不稱絕無瓶頸。兩組各68hash、兩installedDB相符，所有本輪負載及服務已停，資料保留；Next清理143非負載失敗。手機報告9browser checks通過，非真人接受。C新增每Pod3GiB上限與自有工程責任，仍未完成更新；A成本未知、未比較B代A。下一個建議先單變因4→8GiB驗更新重疊，但尚未執行／採用；Web保護是獨立問題。本輪停止，不自動追加。程式/證據c-million-20261116；native .lab/c-million-20261116。禁止覆寫原formal-1/fallback-1或放寬期限救結果。

'''
for name in ['HANDOFF.md','LOCAL_E1_HANDOFF.md']:
    p=WIN/'docs'/name;text=p.read_text(encoding='utf-8')
    if marker not in text:p.write_text(intro+text,encoding='utf-8')
p=WIN/'docs/DR_DISCUSSION_REGISTER.md';text=p.read_text(encoding='utf-8')
entry='2026-11-16 D18／D24 K2百萬頁已取得共享負載與更新反例'
if entry not in text:
    p.write_text(text+'\n- '+entry+'：原1GiB ready失敗；唯一4GiB備案可服務，consumer4/s使Web P95約2.98s；consumer2/s+bulk2/s可用但V2更新新pool逾時。423已送成功、477停止後未送；無V2啟用／失敗後長期恢復證據。詳[手機圖解](C_MILLION_RESULT_20261116.html)／[獨立事後裁定](C_MILLION_POSTREVIEW_20261116.md)。C容量與維運最低仍未證，正式流量／資料未知。下一步建議單變因4→8GiB優先驗更新，尚未執行，不把RAM改善當Web保護已解。原始失敗、凍結、服務清理與新增成本已保留；本輪停止，不自動更多備案。\n',encoding='utf-8')
files=list((WIN/'docs').glob('C_MILLION_*'))+[WIN/'docs'/x for x in ['HANDOFF.md','LOCAL_E1_HANDOFF.md','DR_DISCUSSION_REGISTER.md']]
for relative in ['scripts/c-million-20261116','scripts/c-million-report-20261116','evidence/c-million-20261116']:
    files += [p for p in (WIN/relative).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='delivery.json']
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
records=[]
for source in files:
    relative=source.relative_to(WIN);target=NATIVE/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
    a,b=digest(source),digest(target)
    assert a==b,str(relative)
    records.append({'path':str(relative),'bytes':source.stat().st_size,'sha256':a,'readBackMatch':True})
receipt={'at':time.time(),'count':len(records),'allMatch':True,'files':records,'scope':'Project sources, sanitized evidence and reports only; runtime credentials and databases excluded. No git commit/push.'}
out=WIN/'evidence/c-million-20261116/delivery.json'
with out.open('x') as f:json.dump(receipt,f,indent=2)
shutil.copy2(out,NATIVE/out.relative_to(WIN))
print(json.dumps({'mirrored':len(records),'allMatch':True}))
