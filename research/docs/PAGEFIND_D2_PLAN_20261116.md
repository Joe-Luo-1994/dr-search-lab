# Pagefind D2：搜尋呼叫內部定位與擴容條件

2026-11-16。使用者授權繼續，也允許必要時擴充資源壓測。先執行一次有判別力的內部定位，再依證據決定是否使用擴容備案，不因授權而自動展開矩陣。

固定 D1 首題 `huge/commonterm/page1/pageSize10`，100k來源、預期total50k、exact total/排序/Space授權與全結果mapping不變。新server、無預熱，4CPU quota/4GiB/swap0、完整操作5秒外控、全組15分鐘。只1query，不增加觀察窗口。

本輪沿用 D1 外層 trace 與已完成的 Next production build；在 **獨立完整索引副本** 的 generated Pagefind1.6.0 `pagefind.js` 插入少量資產接收/解碼、WASM初始化或載入、搜尋呼叫與JS結果轉換邊界。精確replace唯一匹配，差異僅觀測，不改Promise並行順序、語言、filter或結果。這是研究儀器，不是正式維運必須持有的runtime fork。

原G1/G2/D1與原索引不變。新包有單一明確允許的JS異動：保留其原SHA/新SHA/差異，其他101570檔保持原bytes與名稱集合。原inventory pin與新diagnostic inventory分開，不能聲稱整包與原完全相同；執行前及停止後獨立核對。沿用1000筆/1MiB每程序trace限制、fsync耐停止，未結束span與最後自身observer成本保持未知。

查詢窗資源判讀以runner query.begin與controller每秒cgroup樣本時間對齊：列實際覆蓋的樣本窗口、CPU使用增量/牆鐘秒、throttling/memory事件與可得page reclaim/refault計數。未覆蓋末端不推估；整組hash/啟動用量不能代表query。直接trace成本與間接擾動不可混同。

## 擴容候選的啟動條件

最多新增一組資源候選（上限8CPU/8GiB，宿主餘裕仍須核對），先有reviewer核對的瓶頸與可否證預測：

| 證據 | 可支持的候選 | 不能據此做什麼 |
|---|---|---|
| 查詢窗OOM、持續回收/refault或記憶體上限壓力 | 只增RAM，保持CPU與請求契約 | 不能用總process峰值直接推斷RAM不足 |
| 查詢窗CPU quota throttling且有可利用平行度，或已觀察併發CPU競爭 | 只增CPU，保持RAM與契約 | 同步單線程且未受quota限制，不支持多給vCPU能加速單題 |
| 只停在等待/邏輯或尚無pressure證據 | 不啟擴容；先釐清該階段 | 不能把timeout本身當資源不足 |

如果要做併發壓測，需先有可完成且正確的查詢，另凍結少量代表工作集與Web/consumer操作、負載/期限/停止標準；不以本次單題取代壓測、不用未完成查詢堆出吞吐。此次使用者授權不需要重複詢問，但不得用放寬正確性或5秒門檻製造改善。

D2定位後先停止並彙整；僅在上述條件成立、資源候選具體且review通過時，才可接一組有界補驗。若條件不成立，清楚說明為何暫不擴容。正式DevOps工時、token帳務及真實SLO仍未知。
