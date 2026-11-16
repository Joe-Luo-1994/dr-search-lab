# Pagefind D1：停止階段獨立事後審查

2026-11-16。已讀單題原始紀錄、40 筆 trace、外部 controller 與 runner 紀錄，另做離線 hash 保全；未再執行查詢或服務。

**裁定：D1 已達成有限定位目的，這輪停止。** 在本次同首題、4 CPU／4 GiB／swap 0 的觀察中，初始化完成並進入 `pf.search`，直到 5 秒截止仍沒有觀察到它返回；自有的全結果 mapping 尚未開始。這不是 G2 通過，也沒有把根因定位到純 WASM 計算、CPU、檔案 cache 或某個 Pagefind 演算法。

## 原始證據支持什麼

`case.json` 保留單次 `huge/commonterm/page1/pageSize10` 請求：**5,005.051 ms／TimeoutError**，沒有 HTTP response，來源預期 total=50,000／10 hits 仍未接受實際結果驗證。原 G2 的 5,003.314 ms 失敗不變。

單一 server PID 的 trace 有 **40 筆連續序號**。以下相對時間均由同程序 monoMs 相減，不以跨程序 wall clock 推算：

| 觀測 | 相對於 server next.request |
|---|---:|
| `pf.search.start` | 46.695 ms |
| 最後一個已觀測資產 `asset.finish` | 145.778 ms |

state／manifest、SQLite 開啟與設定、Pagefind import／options 均有結束事件。5 個已觀測資產各有 read.end 與 server finish=200，合 **843,740 bytes**；包括 entry、metadata、WASM、index 與 filter。沒有 `pf.search.end`、`mapping.start`、正文組裝或正常 Next response finish。

因此，本次停止窗口中的後續耗時不能歸到尚未開始的自有逐筆 SQLite mapping。但資產 server finish 只證明 server 的傳輸完成事件，不證明 Pagefind 已收完、解壓、解析、初始化或執行完搜尋；也不能證明後續沒有等待尚未發出的工作。未完成 span 不等於已識別 CPU 熱點。

最後 trace 記錄了此前 **39 筆**已完成事件的觀測成本：同步 I/O 累計 **58.746 ms**，helper 累計 **59.537 ms**，包含 startup 觀測；第 40 筆自身成本未知。這些是已量到的觀察介入，不能直接從總時間扣掉就當作無 trace 的純查詢時間。

## 停止與保全

- controller `stopped／QUERY_TIMEOUT`，整組含前置核驗與清理 **40.077 秒**。memory.peak=1,657,253,888 bytes，memory max／OOM／CPU throttling 事件均為零。這是整組資料，不是獨立搜尋 CPU profile，也不構成「資源絕無瓶頸」的證明。
- remainingPids 與 cleanupErrors 皆空，MainPID=0；signal／status 9 是硬停止結果。case 已保存，runner `result.json` 未產生，不補造正常結束。
- 獨立重新計算 **10,586 個 freeze 檔案 SHA，零差異**；G1 inventory pin 正確，實際 **101,571 個產物檔案**大小／SHA 全符，名稱集合沒有新增、遺失或特殊檔。
- 新 receipt：`evidence/pagefind-diagnostic-20261116/reviewer-poststop-preservation.json`。這是停止後保全，不替代 runtime after 檢查、不讓 D1／G2 變成能力通過。

原始入口：`evidence/pagefind-diagnostic-20261116/case.json`、`traces/trace-1461.ndjson`、`runner.ndjson`、`control/result.json`。G1 建置通過、G2 剩餘 31 必要案例與歷史 Node 觀察未執行的狀態不變。

## 唯一後續建議：先評估內部邊界觀測

若仍值得投入，下一步只評估 **Pagefind 1.6.0 `pf.search` 內部的單次有界階段剖析**：先唯讀定位實際程式中的少數 await、資產讀取／解析、WASM 初始化／呼叫與結果轉換邊界，再在新隔離副本加開始／完成事件。保持同 query、同來源、同資源與 5 秒外部截止；不取消 filter、不縮 total、不改排序、不補第二次暖查詢。修改前須核語義差異與觀察成本，不能先假定哪個內部分支最慢。

採納條件是少量觀測能區分「等待輸入／初始化」與「已進入同步運算或結果轉換」，足以支持一項具體 adapter／部署取捨；若必須大幅改寫版本綁定的 generated runtime 才能取得可信紀錄，先把維護成本帶回選型討論，不自動深挖。該方案尚未實作或執行；本輪不追加查詢、不增加窗口、不擴資源。

本輪新增的是停止位置的線索，沒有吞吐、正式 5 秒 SLO、完整 100k 能力、中文 parity 或 A／C 維運勝負的結論。
