# K2 百萬頁共享負載：有用的反例，尚未通過完整容量驗收

2026-11-16。手機入口：[連續圖解與數據](C_MILLION_RESULT_20261116.html)。[事前卡](C_MILLION_PLAN_20261116.md)／[設計review](C_MILLION_DESIGN_REVIEW_20261116.md)／[唯一備案review](C_MILLION_FALLBACK_REVIEW_20261116.md)／[獨立事後審查](C_MILLION_POSTREVIEW_20261116.md)。不重寫K1，不把B當A，不宣稱C總成本勝出。

## 結論與實際任務

原reader 2CPU／1GiB未通過百萬頁ready：3,312,799,744byte下載與hash約9.75s成功，但pool啟動完整性檢查超過固定30s。無正式負載；不是consumer干擾結果。memory.max事件34,832、file-refault682,372、CPU throttle0.016s、OOM0支持優先測記憶體，尚未證唯一根因。

Reviewer批准唯一單變因備案：reader2CPU／4GiB，2workers、SQL、查詢／啟動期限、資料、負載全部不改。fresh cache/PID，但主機快取與順序仍有干擾。備案下載9.000s、quick_check5.031s，約14.07s ready；不是RTO或冷快取因果證明。

Web固定1journey/s：SSR→搜尋→跟隨實際命中pageId取正文。consumer為9種query等輪替，包含exact total、BM25 top10、Space與Tags AND。Web只用rare／published-marker已知文件，非所有廣泛查詢。正文256頁hotset、8附件；百萬筆只有完整搜尋資料，不是百萬遠端正文交付驗證。

|階段|預定窗|Web完成/預定；P95|consumer完成/預定；P95|附件完成/預定；P95|判讀|
|---|---:|---|---|---|---|
|Web only|30s|30/30；22.8ms|—|—|基準|
|consumer1/s|30s|30/30；19.2ms|30/30；1079.0ms|—|符合|
|consumer2/s|30s|30/30；439.2ms|60/60；1082.6ms|—|符合|
|consumer4/s|30s|30/30；2978.2ms|120/120；1806.0ms|—|Web不合，停止升階|
|consumer2/s＋附件2/s|30s|30/30；444.5ms|60/60；1077.1ms|60/60；431.8ms|符合|
|同上＋V2更新|180s，約84.44s停止|85/180；553.1ms|169/360；1111.8ms|169/360；459.3ms|更新未完成，停止|

P95是成功任務含排程等待；研究Web門檻≤3s且≤max(2×baseline,500ms)，consumer／附件≤2s，各lane失敗≤1%。這不是正式SLO。30個Web樣本很少、短窗；最高合格2/s只是此profile觀察值，不是SQLite／Next的普遍上限。4/s消費者全部成功不代表Web體感未變；Tags子類13例P95約2125ms也比整體consumer P95慢，不能只讀總體值。8／16/s因4/s的Web門檻不合而未跑，不是因之後的update timeout。

## 下載與更新：完成下載，未能啟用

- V2為3,313,811,456bytes，應用最高64MiB/s節流；49.397s完成下載與hash。之後新pool在30s啟動期限失敗，update API503 `WORKER_START_TIMEOUT`，沒有activated事件。
- 更新階實際送出Web85、consumer169、附件169，423項全部成功。停止後Web95、consumer191、附件191，共477項預定工作未送出；不是477個HTTP錯誤。沒有負載漏送、late、錯資料、越權、OOM。
- 以持久download-end事件與raw lane終端記錄重算：246項任務與V2下載重疊。原result因失敗response無success receipt而寫overlap0，不能當「沒有重疊」；原raw/result未修改。亦不使用原allOfferedP95作更新延遲，因未送出工作有零長度記錄。
- 觀察期間V1繼續服務、沒有V2成功觀察。控制器依原卡立即停止，未驗失敗後長時間復原或自動重試。V2檔案hash正確不代表可啟用。

## 資源與原因界線

讀者cgroup涵蓋Next、2個SQL child、新舊pool、內容代理、下載與hash。metadata與search共用queue，並未隔離Web／consumer。MinIO獨立4CPU／4GiB、swap0、Go heap軟靶1GiB；與reader同WSL主機及loopback，配額不是獨占硬體。兩者memory含OS file cache。

|階段|reader平均CPU核等值|reader取樣記憶體峰|reader memory.max事件增量|MinIO觀察|
|---|---:|---:|---:|---|
|consumer2/s|1.01|3.30GiB|0|約0.002核；無max增量|
|consumer4/s|1.98|3.32GiB|0|約0.003核；無max增量|
|2/s＋附件2/s|1.02|3.36GiB|0|約0.006核；無max增量|
|更新未完成窗|1.26|4.00GiB|28,778|約0.035核；max增1,334；無OOM|

4/s時queue取樣最多8、Next event-loop最大約24ms（解析度20ms）；支持SQL執行／共享排隊及CPU預算方向，不證主event loop是瓶頸。2/s rare P95約3.7ms、tags約1109ms；4/s rare也被拖到1328ms。pool歷史timing buffer重複且無job ID，不把累積觀察當獨立每階job統計。

更新reader memory/refault壓力支持新舊版本重疊假說，但未量block I/O（io.stat空）；MinIO同時也回收快取，不宣稱它完全無瓶頸。已完成3.314GB傳輸，逾時位置是reader pool start，沒有證據優先調MinIO。保留此依賴配置，不追加MinIO壓測。

## 具體新增成本

|責任|本輪已知代價|不可推論|
|---|---|---|
|reader資源|唯一備案每Pod記憶體上限+3GiB，CPU仍2；更新仍失敗|4GiB足夠完整DR或全部都需常駐RAM|
|本地檔案|V1 3.313GB＋V2 3.314GB，其他staging／保留版需另計|索引一定小到可忽略|
|集中builder|兩版65.97s、RSS峰182.65MiB；無reader配額|正式資料建置時間；每站都重建|
|集中發布|stream PUT及GEThash26.06s、RSS峰117.87MiB；PUT6.657GB、校驗GET6.657GB|跨區吞吐或實際每日全量流量|
|MinIO研究配置|4CPU／4GiB獨立預算，版本資料保留|這就是公司每站新增成本|
|測試generator|reader外程序RSS峰154.55MiB，負載約240.51s|產品常駐資源|
|自有實作|長駐workers／queue／硬期限、SSR共享模型、下載hash、版本pin與切換、清理與磁碟護欄|不部署Backend/ES就沒有維運|
|研究工具|compact獨立source oracle、分lane到達與驗證、freeze與browser smoke|這些全都需帶入產品|
|尚待估計|正式ReBAC／API／editor接線、owner、人時、token金額、infra單價、A原完整方案可重用自動化與每站淨增量|C總成本優於A|

源資料99%約1KiB／1%約8KiB，合成且重複詞多；PDF marker也在正文，不證新的PDF-only抽取品質；未與ES正式query／排序作等價比較。

## 下一個決策與停止理由

本輪原配置與唯一備案已用完，停止負載。下一個有界驗證建議先解更新：若另授權，單變因reader RAM4→8GiB、其他條件不變，確認新舊版本重疊所需成本，仍保留期限與失敗；不在本輪追加。若成本不值得，可比較獨立新reader準備後切流與A完整服務。這不解決4/s的CPU／共享排隊問題；consumer限流、Web優先或獨立搜尋資源是另一個決策，不能用增加RAM當已解答。

可帶去團隊的具體候選仍是C，但要附條件：已知文件Web＋受控consumer流量在短窗可用，百萬頁無中斷更新尚未通過；不能稱第一版整體ready。需要正式流量、延遲容忍及A增量成本，才能決定自有控制是否值得。

## 證據、清理與續接

- 本機證據：`evidence/c-million-20261116/`，包含原`formal-1` ready失敗、`fallback-1/load` raw／status／resources／result、builder／publisher、`analysis.json`、`cleanup.json`。沒有覆寫歷史失敗或憑證匯出。
- native runtime：`/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo/.lab/c-million-20261116`。原始DB、MinIO store保留，只停止自有服務。runtime config/private含憑證，不能公開或當結果文件。
- 程式：`scripts/c-million-20261116/`；報告／只讀重算：`scripts/c-million-report-20261116/`。Node22.18、Next16.4.5、SQLite3.50.2。MinIO source-build指紋見limits/設計卡，不是公司正式版本。
- 原formal-1在ready失敗後才freeze，只是provenance；fallback在ready後／load前freeze。兩者各68檔後驗無差異；兩份安裝DBhash都符合來源，V2未啟用。
- reader3174、MinIO19640/19641端口已閉、最後觀察PID均不存在。Next受控SIGTERM143標failed，與負載失敗分開；MinIO正常退出。
- 1000筆真browser preflight三項通過：SSR頁→輸入搜尋→點命中→SSR內容，顯式合成identity；非百萬頁browser render／正式editor／真人可用性。
- 手機報告browser檢查與獨立事後裁定另附。沒有commit／push／公開發布、永久規則或記憶更新。
