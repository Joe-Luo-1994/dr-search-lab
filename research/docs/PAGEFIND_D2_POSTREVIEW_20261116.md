# Pagefind D2：同步搜尋邊界與擴容裁定

2026-11-16。獨立讀取 trace、單題紀錄、runner 與 controller 原始樣本，重新計算查詢窗口並離線保全兩份產物；沒有再啟服務或查詢。

**裁定：D2 已把本次停止位置縮小到同步 `wasm.search(...)` 呼叫尚未返回；暫不啟動擴資源候選。** 尚未定位到 Rust 內部演算法、資料結構或特定熱點，也沒有完整能力／吞吐結論。使用者允許必要時擴容的授權仍有效，只是本次證據未達啟動條件。

## 獨立核對結果

唯一首題仍是 `huge/commonterm/page1/pageSize10`，來源預期 total=50,000、10 hits。`case.json` 保存 **5,004.821 ms／TimeoutError**，未收 HTTP response。這是研究預算停止，不是正式產品 5 秒 SLO，也不能拿 D1／D2 的數毫秒差當效能改善或退步。

trace 有 **82 筆連續序號**。metadata 與 WASM 收取、解壓、instantiate／init、index／filter chunk 收取／解壓／載入均有完成事件。其後依序為：

| 同 server 程序階段 | monoMs |
|---|---:|
| `d2.chunks.end` | 450.852 |
| `d2.backend-search.start` | 452.115 |
| `d2.wasm-search.start` | 454.843 |

最後事件約在 server `next.request` 後 **219.678 ms**；直到外部停止，沒有 `d2.wasm-search.end`。因此，本次未進入 WASM 回傳字串的 UTF-8 decode、JSON parse、全結果 JS 建構，也未進入自有 SQLite mapping。D1 的「pf.search 尚未返回」現有更窄的呼叫邊界證據；不能進一步聲稱已找出哪個 Rust 計算、迴圈或異常造成它。

最後一筆記錄的是此前 **81 筆** trace 已完成的同步 I/O **110.185 ms**、helper 累計 **111.688 ms**；第 82 筆自身成本未被後續事件記錄，維持未知。trace 存在直接與間接觀測擾動，不能簡單扣除這些數字便聲稱原版的純計算時間。

## 為何這次不擴 CPU／RAM

以 runner 的 query.begin／query.end wall 時間選取 controller 已觀測樣本，獨立重算為：

| 指標 | 已觀測窗口 |
|---|---:|
| 樣本數 | 5 |
| 首／末樣本相對 query.begin | +215.896／+4,234.797 ms |
| 樣本覆蓋時間 | 4.018901 s |
| cgroup CPU 增量 | 4.041201 CPU s，約 1.006 核 |
| CPU throttling 次數／時間增量 | 0／0 |
| 最高取樣 memory.current | 1,744,322,560 bytes |
| memory max／OOM 等事件增量 | 全部 0 |
| pgscan／pgsteal／file、anon refault／major fault 增量 | 全部 0 |

實際配額為 4 CPU／4 GiB／swap 0。這是跨程序 wall 時間對齊後、約覆蓋查詢的樣本區間，未覆蓋首尾不外推，也不是完整單查詢 CPU profile。不過同步呼叫尚未返回、整組約用一核且無 quota／RAM 壓力的證據，已足以否定「只因逾時就上 8 CPU／8 GiB」的啟動理由。

增加 CPU quota 不會自行把該同步呼叫平行化；本次也沒有增 RAM 可解決的回收／限額壓力證據。這不否定較多 worker 的未來併發吞吐收益，但需先有正確且可完成的任務，以及實際競爭證據，另立有界工作負載，不能用本次單題結果代替。

## 停止與兩份產物保全

controller 為 `stopped／QUERY_TIMEOUT`，全組 **40.731 秒**；remainingPids／cleanupErrors 皆空、MainPID=0。signal／status 9 保留為硬停止紀錄。runner `result.json` 未產生，不補成正常結束。

獨立事後核對：

- **10,707 個 freeze 檔案 SHA 零差異**。
- diagnostic artifact 的 **101,571 檔**大小／SHA／實際名稱集合全符新 inventory，沒有額外、遺失或特殊檔。
- G1 原索引的 **101,571 檔**大小／SHA／實際名稱集合全符原 inventory，原索引未變。
- 原／新 inventory pin 均正確。唯一允許差異仍是 `pagefind/pagefind.js`：47,228→49,540 bytes，原 SHA `02746cc5…`、診斷 SHA `3f640a92…`。不宣稱兩包原始 bytes 全同。

新 receipt：`evidence/pagefind-d2-20261116/reviewer-poststop-preservation.json`。原始來源為同目錄的 `case.json`、`runner.ndjson`、`traces/trace-1443.ndjson`、`control/metrics.ndjson` 與 `control/result.json`。事後保全不補成 G2 能力通過；G1 通過、G2 剩餘案例未執行及歷史中文 parity 未閉合的狀態維持。

## 下一項只建議做可維護路徑盤點

最有決策價值的下一步不是立即再剖析 Rust 熱點，而是 **一次有時間上限的唯讀 Pagefind 1.6.0 上游搜尋實作與受支持介面盤點**：是否存在不改必要搜尋語意、Space 授權與結果契約的低成本處理路徑，及其升級／維護責任。以約 30 分鐘為調查上限，不 build、不跑新 query，不預設官方已有可用選項。

若找到受支持且可明確否證的選項，再提一個最小實驗；若只能靠長期維護 Rust／WASM fork、改必要語意或持續深挖才可能改善，先停止這條優化線，將該責任帶回 A／C／Pagefind 選型比較。這不是永久排除 Pagefind，而是避免以「引擎內部還能研究」取代使用者關心的長期維運差額。該盤點目前只是建議，尚未執行。
