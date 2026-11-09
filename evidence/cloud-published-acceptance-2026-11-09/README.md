# 發布後新任務驗收（2026-11-09 Asia/Taipei）

## 2026-11-09 發布後新任務目前狀態

使用既有 checkout；初始來源 `a1bec7f546ef39e1ae1194aec2315875fa277635`，ff-only 更新至 `4a7e06b8ec027aa114c831ef1ded5e8d3107df2c`。保留 build `wzRiI8-PQTbmoPXeo4ZDO`、成功 Linux ES run `mw8h0cao`、prefix `drlab-it-mw8h0cao-`；14 個 fixture checksum 均相符。未重建 fixture、build、索引或重跑 ES 實驗。

第一輪啟動失敗，證據已保留：Lucene `AlreadyClosedException` 顯示 lock creationTime 從 epoch 在首次寫入時改變，與還原 overlay copy-up 相符。在確認 Java 未運行後，對 DR data 既有七個零位元組 `*.lock` 執行 touch 使其先實體化，再啟動成功；沒有刪除 lock 或替換索引內容。這是**修復後啟動通過**，不是原快照無介入啟動通過。相同 DR cluster UUID `4wnGrk8jSc6jPCnXiE4r9Q` 與四組已封存索引內容 digest 均保留。再次發布／新任務的無介入啟動仍待重驗。

33 tests 通過、無 skip；四組 `verifyElasticRelease`（v1/v2 × attachments false/true）通過；13 browser checks 通過，`engineCount=4`、`elasticsearchVerified=true`。primary 19200 維持離線；DR 19300 與 Next.js 3000 保持 loopback 運行。網路為 restricted、enforced，observations_current=true；額外三網域與 package_managers preset 未變更。

共享 Chromium 已實際開啟 Demo，勾選 Elasticsearch 執行 backup 搜尋，觀察 ES 34 筆結果，再停回首頁。私人入口：本對話右側面板「New tab (+) → Desktop → Take over」，使用共享瀏覽器內的 `http://127.0.0.1:3000`；此網址不能當作使用者電腦直連網址。`open_in_codex`、private-preview／port-forward 工具未提供，不能代為展開面板或產生私人轉發 URL；remote_desktop 宣告 enabled=true、state=unknown，原生桌面操作已成功。**使用者端 viewer 操作仍待驗收**。

完整證據：`evidence/cloud-published-acceptance-2026-11-09/`。正式 RTO、真實 ReBAC／MinIO、consumer 相容性與獨立區域災難演練均未驗證；不能由這次合成資料測試推論通過。

## 證據讀法

initial-state.json 為任何啟動與拉取前的快照狀態；initial-processes.log 保存預期的離線 status 失敗。dr-start.log、dr-first-failure.log 與 elastic-release.stderr.log 保留第一輪失敗。lock-copyup.json 記錄離線修復的檔案清單；failure-processes.log 無 Java 程序。dr-retry.log、dr-status.log、elastic-release-retry.json、tests.log、browser-smoke.json 與 final-processes.log 為修復後結果。acceptance-summary.json 核對最終 fixture、build、report 與 lockfile 未變；environment-status.json 是平台即時政策，network-policy-startup.json 是啟動政策檔。

沒有加入 .env.local、憑證、binary、fixture payload 或 live ES data。browser-observation.json 僅為合成資料觀測。CHECKSUMS.sha256 涵蓋本目錄其餘證據；歷史證據未覆寫。
