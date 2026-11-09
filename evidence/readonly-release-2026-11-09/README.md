# 唯讀資料包實驗證據

2026-11-09，本機 Windows / Node 22.21.1；不是雲端執行。假設與結果解讀見 [實驗文件](../../docs/READONLY_RELEASE_EXPERIMENT.md)。

- `first-fetch-failure/experiment.json`：一般權限首輪 `fetch failed`，無 worker 結果。標準升級後成功；未將此紀錄覆蓋。
- `initial-pass/`：第一輪完成的實驗，17 checks / 128 search comparisons / 417 page reads / 425 downloads。
- `verified-fault-reasons/`：加強 fault assertions 後重跑，同樣通過；`result.json` 額外保留 8 個具體拒絕原因及唯讀 ES 操作 trace。本輪以此結果為準。
- `reference-queries.json`：原合成 ES 流程產生的 128 組預期 ID、順序、metadata、score、total；不是正式 API 範例，也不是搜尋品質的人工標準答案。
- `v1-manifest.json`、`v2-manifest.json`：100/101 pages，101/102 個合成 binary 物件的版本與 hash 綁定。
- `unit-test-summary.json`：本次已觀察 TAP 輸出的摘要，36 pass / 0 fail / 0 skip，附測試檔案 hash；不是原始 TAP log。
- `SHA256SUMS`：本證據目錄檔案 checksum；不包含自己。

`experiment.json` 的 sourceCommit 是執行時的基底 commit；當時新增程式尚未提交，精確實作以 sourceHashes 為準。報告包含本機路徑及私有合成索引名，沒有公司正式文件或憑證。

必須保留的限制：producer 目錄改名及新程序只證明此 reader 不靠 producer 路徑；OS 未禁止讀其他路徑，沒有公司 Backend/DB 隔離。角色服務為 mock，儲存為 filesystem，未接 HTTP/MinIO。可信 manifest hash 不是簽章。測試拒絕不完整包，未測 active release 原子切換或回退。小型資料不能證明容量、RTO 或總成本。

反例：p09 在 V1 仍屬 ops，所以有 ops 角色的 Alice 可以讀取與下載；V2 搬至 restricted 後才拒絕。即時 Space 授權沒有修正副本內過舊的 Page/Media 關聯。
