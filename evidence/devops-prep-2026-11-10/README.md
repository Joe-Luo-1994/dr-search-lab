# 內部 DevOps 討論準備實測

2026-11-10（Asia/Taipei）。原始機器時間保留 UTC。來源 commit、保留 build 與未提交文件狀態見 initial.json；本輪未改應用程式／重建 fixture、build 或索引。

目的：用既有 Next.js HTTP API，判斷 Web 承擔搜尋／API 有哪些直接證據、哪些採用缺口。非正式 consumer 相容、MinIO 整合、容量或公司 ReBAC 驗收。

- 起初 3000、19200、19300 均離線；沙箱 start 因 /proc 權限拒絕，依 onboarding 使用同一 start 標準升級成功。log 保留。程序存活僅本輪觀察，不推論永久維持。
- 4 組封存索引驗證通過，digest 與歷史一致。
- `probe.mjs`：現有 Next.js HTTP 上 32 次查詢（4 engines × 8 cases），67 項明確 assertion 通過。此數包含 HTTP 狀態／合成授權規則，並非 67 個產品需求通過。
- `no-remote-probe.mjs`：三個嵌入式引擎在另一 Node 程序移除外部引擎 URL 且 fetch 一律拒絕時，均完成 Space＋Tags＋keyword 查詢，找到 p01、總數17、遠端 fetch 嘗試0。不是 OS 網路隔離；HTTP 主程序仍連有 ES。
- browser smoke 13 checks 通過，4 engines／ES verified；本輪前後 browser-smoke 文字報告都保存。
- 中文查詢、mock identity、示意媒體與未固定版本的操作鏈是重要限制，見 decision-observations.json 與 http-results.json。不能以 assertion 通過掩蓋它們。
- 所有新 probe 僅使用自己的 Lab session，結束 reset，不修改其他使用者 session。127 個初始 fixture/build/原 ES report checksum 保持不變。

重現（repository root，pinned Node，既有服務 ready）：

```
node evidence/devops-prep-2026-11-10/probe.mjs
node evidence/devops-prep-2026-11-10/no-remote-probe.mjs
```

為保留本輪紀錄，後續重現請先改用新的 evidence 目錄；不要覆蓋既有結果。API 及 fixture 原始碼 hash 在 final-state.json。證據只含 synthetic 結果、文字紀錄及 hash，不含 .env、cookie、憑證、binary 或正式資料。
