# R 的 10k 查詢逾時診斷（2026-11-15，v1）

**主要 V4：**對同一個 Space 範圍、同一個搜尋，在期限內取得正確結果。**輔助 V8：**讓值班人員能分辨逾時是發生在 count、rank 還是查詢後的頁面讀取／highlight，並知道與多少遠端讀取同時發生。共同服務承諾仍是事故時能在授權範圍內找到意圖中的頁面、讀取可信正文並取得附件；此卡只處理已發生逾時的合成研究子問題。

原本機 smoke 的首個 R cell 在完成 exact 搜尋→正文→附件及後續四個搜尋後，於 `common-small` 觸及 4,800 ms worker deadline。該 cell 有 4,614 次 proxy 請求，4,595 次 206；是整個 cell 的觀察，歷史 log 無法分配到 count/rank。該反例、後續五組跳過及 L/H 結果照原判保留。本卡有兩個可被否證的線索：相同 SQL 的本機階段耗時是否也高；R 是否在某個同步 SQL 或後處理階段累積較多 Range 請求或未完成讀取。

## 凍結輸入與排序

- 只讀 `.lab/e1-source-local-smoke-20261115/data.sqlite`（22,724,608 bytes，SHA256 `70905a85dc7bfd5499eebd1253fb2e889b81aff1d5223d220f1bb8ec881d0cfa`）。Node 26.13.1／SQLite 3.54.1，Litestream CLI/VFS 0.5.18，同一本機官方原始碼 MinIO build（RELEASE.2025-04-22T22-12-26Z）。完整雜湊見 `scripts/e1-r-diagnostic-20261115/FROZEN.sha256`。兩份保存的 oracle JSON SHA256 同為 `1ed85d9d91384d7dab981d5d6398d496ee286c96fe63a89dff0c83fe74c150a9`；舊卡的 `oracleSha256` 是生成器腳本的 SHA256。診斷直接使用既有 JSON，並用獨立合成公式核對。先記錄 card、script、來源和工具雜湊，再啟動新服務。
- 依序六個 cell：**L full → R full → L count-only → R count-only → L rank-only → R rank-only**。每個都是 fresh process 和 cwd、無 pacing，R 不啟用 hydration，不清 OS／MinIO cache。L 走同一 proxy 下載原始 WAL 模式 SQLite release 副本，核對 hash，然後開本地檔。R 由相同 source 副本一次產製 LTX，僅經唯讀 proxy 讀取。LTX 重新產製的 hash 不需與歷史產製逐位元相同。
- 每個 cell 的 prefix 完全相同：`exact` search、`exact` body、`exact` media；再 `exact`、`rare-small`、`rare-huge`、`rare-all` 四個 full 搜尋。接著且只接著跑一次 `common-small`（`commonterm`、`s0001`、第 1 頁、10 筆上限），依該 cell 的模式。沒有其他 query、重試、時間延長或 H cell。
- Exact / rare-small / rare-huge / rare-all / common-small 的 raw count 預期 1 / 0 / 6 / 11 / 6，回傳上限下的 hit count 預期 1 / 0 / 6 / 10 / 6。完整 prefix 檢查 Scope、命中、筆數、唯一性、標題、highlight、正文／附件 hash，並核對有序 L 結果。Count-only 獨立驗 raw count、公開 total 和 L full 投影；rank-only 只執行 rank SQL 並保存實際有序 rowid/score，不取正文或 highlight，依既有 builder 的 `rowid=i+1` 驗證命中／Scope／唯一／數量並比對 L full 的 rank 投影。Full 保留既有 SQL、bind order、statement cache、normalization、highlight 及輸出欄位。
- Query plan 只對另一份本機 disposable copy 跑 `EXPLAIN QUERY PLAN`，使用實際 target 綁定值，在工作集之前獨立程序完成。Plan 只描述 SQLite 選用的本機查詢策略。

## 預定停止與證據

每個 SQLite job 使用 4,800 ms deadline。R 的 job deadline 終止該 cell、保留最後觀測 phase，確認 worker 退出並清除舊的 proxy 請求後，繼續下個預定 cell。若 deadline 先發生在 prefix，該 cell 沒有 target 證據。L control 或任何不符合 oracle、來源／物件雜湊、預檢、意外 reader／服務／資源失敗，停止整輪 workload。MinIO ready 後意外退出會中止工作，記為 `MINIO_UNEXPECTED_EXIT`。完成診斷可包含 R deadline，`diagnosticComplete` 與各 cell 狀態分開；不修改原 smoke 結果。未執行 cell 保留在凍結排程，無結果。

使用既有工具，不安裝。Windows C: 和 RAM 由準備者執行前檢查，WSL 可用空間 ≥32 GiB；使用新 `.lab/e1-r-diagnostic-20261115/`、兩個 MinIO loopback port 19440/19441 及 proxy 19442；fresh-only。五分鐘總上限，298 秒發出停止以留短時間收尾，另有準備／啟動子期限；500 ms 取樣本輪 subprocess RSS ≤4 GiB、本輪 runtime 加證據 ≤1 GiB、WSL free ≥4 GiB。取樣及 JS 計時器不是 OS 硬配額。只停止本輪建立的程序；憑證只由程序環境傳入、不記錄原始 header／query string，私有 runtime 可能含 MinIO 自有內部設定，不作發布證據。原本機 smoke、百萬頁、incoming 保存本及舊服務不啟動或修改。

保存原始 `jobs.jsonl`、`phases.jsonl`、`proxy.jsonl`、`resources.jsonl`、local plan、工具與輸入 provenance、來源 before/after SHA 與新 release 全部物件（LTX／rawDB／附件）的前後 hash。若全域停止使驗後資料不可得，標成缺失，不能聲稱已核對。Phase IPC 送出與 parent 收到分別記錄；同步 SQL 開始前等 send callback，未同步到 proxy，可能有送達延遲、無 phase 或背景讀取。Proxy 在 request start 凍結 task/phase 標籤。Proxy 和 phase 事件先在記憶體保存時間戳與資料，每個 cell 的 worker 與 proxy 清理後成批寫入。整輪清理也會寫出剩餘事件。未寫入的事件上限為 100,000 筆，超過會以 `TRACE_BUFFER_LIMIT` 停止，並保存首筆超限事件與未收錄的筆數。Proxy 記錄結果與中止，一般等待時間或 bytes 不是精確的 SQLite page 因果歸因。逾時階段的資料是右設限；CPU 只在完成 phase 有差值。

使用 direct worker IPC，附件仍走同一 MinIO proxy。量測含儀器擾動、是 worker 診斷；不是歷史 HTTP 端到端重播。獨立 rank 沒有 target count 先暖 cache，分段時長不可相加當 full 時間；單次結果不是延遲分布，也不代表百萬、Next、consumer／權限、正式 DR 或 RTO。若 R 只在某階段逾時且有高度集中的 Range 活動，該階段可作為下一次有界檢查目標；若結果不一致或 R 不重現，保留不確定性，不自動啟動百萬。執行後補作者／非作者審查、運算和操作成本及下一個決定，另行記錄。

預檢先 `sha256sum -c scripts/e1-r-diagnostic-20261115/FROZEN.sha256`；再由準備者從 repo 根目錄使用 `../toolchains/node-v26.13.1-linux-x64/bin/node scripts/e1-r-diagnostic-20261115/run.mjs` 單次執行。
