# 使用者入口更正與正式 handoff 診斷

共享 Chromium 已由 agent 實際操作，但**目前沒有已驗證的使用者雲端互動入口**。使用者已實際確認網站 UI 沒有「＋ → Desktop」，而「開啟 網頁預覽」只在使用者本機 Edge 開啟 localhost，會誤連 Windows baseline；先前將該 Desktop 路徑當成確切私人入口的說法撤回。雲端 `http://127.0.0.1:3000` 不能作為使用者裝置的入口。

已檢查正式瀏覽器 API：`markHandoff()` 僅保留分頁供後續工作，不保證產生接管 UI；`requestUserTakeover("user_requested")` 才是文件中的正式使用者接管動作。`cua.listTabs({browser:"cdp"})` 成功列出 Demo；`cua.getTab("1",{browser:"cdp"})` 失敗，錯誤 `Browser Use could not read requirements.`。改用正式 `agent.browsers.get("1")`、`browser.tabs.get("1")` 成功綁定且 `tab.url()` 回傳雲端 Demo URL，但實際 `tab.requestUserTakeover("user_requested")` 仍以同一 requirements 錯誤失敗，未回傳 `browserHandoff.url` 或接管入口。未使用 `markDeliverable()` 覆蓋可能的交接標記，也未把標記保留等同互動成功。

目前工具清單沒有 `open_in_codex`、私人 preview 或 inbound port-forward 控制。runtime networking 文件明確區分 outbound proxy 與平台獨立的 inbound preview／port-forward，不能用出口網路設定建立入口。沒有猜測平台 URL、修改綁定、公開服務、新增 third-party tunnel、付費資源或讀出憑證。此環境 remote_desktop 回報 enabled=true、state=unknown，表示能力宣告，不能證明網站客戶端存在 viewer。**使用者互動驗收受平台交接工具／網站 UI 限制阻擋**；雲端服務仍運行。

## 啟動修復狀態

Lucene 修復指示已存在 onboarding/start.md、docs/HANDOFF.md、docs/CLOUD_MIGRATION.md：先保存失敗紀錄、確認 ES 完全離線，僅 touch 既有零位元組 lock 檔後重試。前輪為修復後成功；下一個新快照免介入啟動尚未驗證。本輪未重啟、重建 fixture／索引或重跑 ES 實驗。

父目錄 README.md 與 acceptance-summary.json 為前輪歷史記錄，其私人入口文字由本更正取代，原檔及原 checksum 保留。正式 RTO、真實 ReBAC／MinIO、consumer 相容仍未驗證。
