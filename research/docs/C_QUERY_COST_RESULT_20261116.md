# K4 查詢成本定位

[手機圖解](C_QUERY_COST_RESULT_20261116.html)／[獨立review](C_QUERY_COST_POSTREVIEW_20261116.md)。54次原查詢與9組後置EQP完成，45profile均符合source與原有序結果；未做優化或容量重跑。

|案例|命中數|整query中位ms|count中位ms|Top10中位ms|補tags中位ms|
|---|---:|---:|---:|---:|---:|
|常見詞|1000000|777.7|219.2|558.3|0.076|
|唯一詞|1|0.159|0.086|0.055|0.009|
|中文詞|200000|372.1|145.8|227.3|0.076|
|常見詞＋Space|5051|497.4|238.7|259.3|0.092|
|常見詞＋雙 Tags|100000|1,041|486.2|554.7|0.079|
|無命中|0|0.128|0.081|0.038|0|
|已發布文件 marker|256|0.346|0.109|0.163|0.051|
|常見詞＋Space 權限|500000|654.9|240.2|414.6|0.094|
|常見詞＋Space 權限＋雙 Tags|50000|858|452.6|405.5|0.085|

九shape各5次等權合計count42.5%、Top1057.5%、補tags0.014%；前兩段均含MATCH/join/filter，不能歸為純count或排序operator時間。無獨立filter成本。中央値不可當可相加的逐次時間，也不把5樣本P95當SLO。

下一候選是先核DB統計，再考慮新副本ANALYZE、SQL/結果/資源不改；尚未執行，也不保證加速。原builder無明示ANALYZE不等於已查DB統計。保持rare+filter等反例，若改進再回K3混合任務。K2更新失敗、正式需求/品質/A成本未知均保留；不自動加跑。

native .lab/c-query-cost-20261116；腳本scripts/c-query-cost-20261116；結果evidence/c-query-cost-20261116。14freeze無差異，DB前後SHA同、兩child及unit退出、無服務部署。2CPU4GiB包含Node controller與單SQL child；Python監督配額外。全DB hash會暖宿主cache，reference與profile不同connection。實際Node/SQLite/PRAGMA斷言通過。研究工時/token金額未知。
