# 發布後新任務驗收

在新對話選擇已發布的私人 `dr-search-lab` 雲端環境，再貼上以下指示。此文件是任務建立工具未回傳對話 ID 時的交接備案；不要在原建立請求仍可能執行時重複開多個驗收任務。

---

請完成 DR Search Lab 發布後的新任務驗收。先讀環境 runtime 與 cloud-desktop skill、`onboarding/start.md`、`docs/HANDOFF.md`、`docs/CLOUD_MIGRATION.md` 及 `docs/VERIFICATION_PLAN.md`。使用 `/workspace/dr-search-lab` 既有 checkout，勿建 worktree。

先記錄新任務的實際執行環境、network enforcement、來源 commit、build、fixture manifest 與成功 ES 報告。可 ff-only 拉取私人 repository 的 `codex/cloud-migration` 分支，不能 force push。

發布前 Next.js 與兩個 ES 服務已乾淨停止。保留的成功 ES run 為 `mw8h0cao`。第一輪不可重建 fixture、重跑 ES 實驗或替換索引來掩蓋還原失敗。確認 `.env.local` prefix 與成功報告相符後，依 start.md 啟動 DR 及 Next.js；確認 primary 仍離線。

執行 33 tests、四組 `verifyElasticRelease`（v1/v2 × attachments true/false），再執行 `npm run test:browser`，要求 13 checks、engineCount=4、elasticsearchVerified=true。若失敗，先保存具體證據再診斷，不可省略 ES 或改用 mock。

依 cloud-desktop skill 在共享 Chrome/Desktop 開啟雲端的 `http://127.0.0.1:3000`，確認畫面，提供使用者實際可操作的私人入口。雲端 loopback 不等於使用者電腦可直接開啟的網址。不得公開部署或新增付費資源；若平台工具缺失，將 headless browser 成功與 human preview 未驗收分開報告。

將新任務的證據保存到 `evidence/cloud-published-acceptance-2026-11-09/`，包括來源 commit、checksum、失敗與限制；不要加入憑證、`.env.local`、binary 或 live ES data。更新交接文件的目前狀態，保留歷史證據。提交並推送同一私人分支，核對遠端 SHA；完成後讓 DR 與 Next.js 保持運行供操作。

回覆驗收結果、私人 Demo 入口、仍未知項及 commit。這次結果不能證明正式 RTO、真實 ReBAC/MinIO 或 consumer 相容性。
