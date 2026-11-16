# Pagefind D2：同步 WASM 搜尋邊界未返回，暫不擴資源

2026-11-16。**這次有界診斷已縮到 `wasm.search` 的直接同步呼叫邊界；查詢窗約使用一個CPU核心，沒有觀察到配額限流或記憶體壓力。因此本輪不啟動8CPU／8GiB擴容。** 使用者的條件式擴容授權仍有效，未來若有併發競爭或壓力證據再使用。

這不是 Pagefind 永久淘汰或 Rust 演算法根因結論。100k中央建置通過仍有效，完整reader能力、百萬頁、真實query分布與A／C維運成本勝負仍未知。

## 這次唯一查詢發生了什麼

同 D1 query：`huge/commonterm/page=1/pageSize=10`，100k合成來源、oracle預期50k命中；同4CPU quota／4GiB／swap0／5秒研究截止，新server、不預熱。沿用已完成的Next build。只有generated `pagefind.js`增加內部trace，其餘101570產物檔案與原G1相同；不是完全未修改的引擎基準測試。

| 階段 | 相對server收到request的觀察 |
|---|---|
| 資產body取得、解壓、WASM instantiate／metadata初始化 | 全部有完成事件；WASM init於約144.7ms完成 |
| index與filter chunk body／解壓／載入 | 全部完成，chunks.end於約215.7ms |
| 直接 `wasm.search(...)` 邊界 | 約219.7ms記錄start，截止前沒有end |
| WASM返回字串的UTF-8 decode、JSON.parse、JS results.map | 尚未到達其start |
| 自有SQLite映射／Space核對／十筆正文組裝 | 尚未到達其start |
| 完整client操作 | **5,004.821ms TimeoutError**，沒有HTTP response |

因此本次後段等待已不在觀測到的資產接收/解壓/載入階段，也未進入後續結果轉換與自有mapping。它定位到直接同步WASM呼叫邊界，**尚未定位WASM內部哪項運算或資料結構造成時間**。開始事件先於呼叫，最後trace自身成本仍未回填；不能單憑一個start事件聲稱取得完整函式CPU profile。下方查詢窗的持續使用者CPU提供另一條證據，仍不取代函式級profile。

## 為何暫不擴容

controller每秒取樣，只採runner query.begin到query.end之間的5個已落盤樣本。其覆蓋query後約 **0.216–4.235秒**，共 **4.019秒**，不是完整5秒，也不外推缺少的兩端。

| 已觀察資源 | 結果 | 對擴容的意義 |
|---|---|---|
| 程序組CPU | 4.041 CPU秒／4.019牆鐘秒，約 **1.006個核心**；user4.024秒、system0.017秒 | 有持續CPU工作，但不是4核心quota耗盡的證據 |
| CPU配額限制 | throttling次數與時間增量均0 | 目前不支持只增加vCPU quota會加速此單題 |
| 記憶體 | 窗內最大取樣memory.current約1.745GB（含檔案cache等） | 不是reader最低RAM需求，也未碰4GiB上限 |
| 記憶體壓力 | max/OOM/OOM kill、pgscan/pgsteal、refault/majorfault增量均0 | 目前沒有單純加RAM的收益假說 |

這些是程序組的局部窗口，不是每執行緒精確歸因、整段WASM CPU時間或容量承諾。未來如果增加worker且出現同時運算競爭，額外CPU可能有吞吐／隔離價值；那是另一個架構與實驗，不可把「Pod多給核心」當作已經實作平行搜尋。

原始證據：[唯一案例](../evidence/pagefind-d2-20261116/case.json)、[trace目錄](../evidence/pagefind-d2-20261116/traces/)、[分析與窗口](../evidence/pagefind-d2-20261116/analysis.json)、[user/system CPU拆解](../evidence/pagefind-d2-20261116/query-cpu-breakdown.json)、[控制器原始取樣](../evidence/pagefind-d2-20261116/control/metrics.ndjson)。

## 觀察成本與停止保全

82筆連續trace，共32,304bytes，低於1000筆／1MiB護欄。末筆記錄前81筆同步IO成本110.185ms、helper成本111.688ms；末筆自身成本未知，間接擾動也未量到，不從耗時扣掉來製造無trace效能結果。

外控以`QUERY_TIMEOUT`停止，整組含前置hash/啟動/清理約40.731秒；remainingPids及cleanupErrors皆空。case已落盤，runner最終result.json未及寫出；不補成正常完成。只有一筆query，沒有延長截止、加RAM、改total或再試暖查詢。

原runtime47,228bytes／SHA`02746cc529f88f853275720dcb1c2b6a18b0c7a92b73fae82ca2738e64500bcd`；診斷runtime49,540bytes／SHA`3f640a92e7563294bf360bf77462a5ce237c5770c552cb92e3bce07905db9d9c`。18個精確替換可逆還原原檔，雙inventory與唯一異動見[provenance](../evidence/pagefind-d2-20261116/provenance.json)及[變更receipt](../evidence/pagefind-d2-20261116/instrumented-pagefind.js.receipt.json)。不能說新包整體bytes與原完全相同。

[獨立review](PAGEFIND_D2_POSTREVIEW_20261116.md)核對定位與不擴容判斷，並保全10707個freeze檔、101571個修改包產物及原G1包。事後保全不代表搜尋通過。

## 對方案取捨與下一步的意義

目前 server adapter 直接在 Next Node 程序呼叫同步搜尋，若該呼叫長時間未返回，共用事件迴圈的其他工作存在被延遲風險；**本輪沒有Web/consumer混合壓測，不能量化影響**。worker隔離可以是候選，但會新增worker生命週期、記憶體與併發控制責任，也不自動縮短單次搜尋。

最有價值的下一步是一次有時間上限的**上游Pagefind 1.6.0／官方介面成本盤點**：有沒有受支持、且不犧牲必要搜尋與授權語義的簡單路徑？若希望只剩維護Rust/WASM fork或大量版本綁定客製，先把這個成本帶回團隊選型，不自動繼續引擎內部研究。也不能用單一高命中合成題代表所有正式搜尋體驗。

本輪未啟動擴容壓測或下一項研究，未推送新研究包到GitHub。正式DevOps人力、agent token帳務與真實SLO仍未知；新增trace為研究儀器，並不是已決定要維護的正式runtime fork。
