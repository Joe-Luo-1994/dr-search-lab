# 新版快照冷啟動驗收

## 2026-11-09 新版快照冷啟動驗收（最新）

- **新快照啟動通過**：初始 commit `4bdef0f3e41be7de7ea47ac42a9f39fd3c9d1e34`，未 pull、改程式、手動修補 lock、重建 fixture/build/索引或重跑 ES 實驗。沙箱 start 因 `/proc/1/environ` PermissionError 按防護拒絕；依 `onboarding/start.md` 標準升級執行同一 start，首個具備所需權限的正常啟動成功，自動 materialize 7 個既有零位元組 lock。保留兩次 log。
- 4 組 verifyElasticRelease、33 tests（無 skip）、14 Linux 防護、13 browser checks 全通過；`engineCount=4`、`elasticsearchVerified=true`。133 個已保存檔案 checksum（含 fixture、build、原成功 report）未變；四個封存索引 digest 與原報告相符。build `wzRiI8-PQTbmoPXeo4ZDO`、prefix `drlab-it-mw8h0cao-`、DR cluster UUID `4wnGrk8jSc6jPCnXiE4r9Q` 保留，primary 19200 離線。
- **有限時間服務存活通過**：全部測試後於 `2026-11-09T00:35:30.710826+00:00` 再查 DR 與 Next.js ready，從 DR ready 起觀察約 83 秒。服務保留於持續執行終端；只證明本輪有限觀察期間，不代表平台永久保存程序，也不是正式 RTO。
- **使用者 viewer 未驗收**：本輪未探索 viewer、handoff、tunnel 或新 hosting；暫採雲端研究與測試、本機操作 Demo。雲端 localhost 不是使用者裝置入口。未公開服務或新增付費資源。repository 的 UI start skill 範本僅指向版本化 start.md；平台 status 未提供 UI 設定文字，未獨立核對設定端全文。
- 證據：`evidence/cloud-coldstart-2026-11-09/`。所有歷史失敗保留；舊版手動修復紀錄不被本輪結果覆蓋。正式 RTO、長期程序存活、跨區災難、真實 ReBAC/MinIO 與 consumer 相容性仍未知。

初始 checksum 僅存路徑與 SHA256；未收錄 .env.local、憑證、live data 或 binary。fixture manifest 與 ES report 為既有合成測試的文字證據。初始 git 工作樹在建立本輪 work/ 前為乾淨；initial-state 中 work/ 為本輪證據腳本。
