# E2 本機 C 切片契約

同一份真 Next build 啟動各自固定版本的 reader。需要 B 的 ES 發布與跨版驗證時，另保留該候選。來源快照時刻為合成標籤，讀者顯示本機最近成功安裝及最後一次嘗試，不用這些時刻推估跨地同步或 RPO。

## 資料邊界

- `.lab/v1-e2-20261115/producer/{fz1,fz2}` 是兩個合成主站來源路徑。`export.mjs` 從指定路徑匯出成獨立 `artifacts/{v1,v2}` 包。檔案傳輸為本機檔案讀寫。
- 每包有 manifest、唯讀 SQLite 資料庫及這版 canonical page membership 引用的全部 PDF。操作者以已記錄的 manifest SHA-256 安裝至 `caches/{main,fresh}`。暫存完整檔案及其雜湊先核對，SQLite 再核對 snapshot ID、來源 SHA、quick check 與頁數。混版的檔案雜湊相符，SQLite identity 不符，拒絕碼 `SQLITE_IDENTITY_MISMATCH`。
- 安裝成功將 staging 移到固定版本目錄。流量指標由操作員另行切換。每個 reader 啟動時重新驗證命名版本的 manifest、SQLite 與所有 PDF。之後只用已安裝 cache、同一份 Next build 及本機共享合成 Role profile。移走兩個 producer 路徑後，fresh 安裝仍從獨立 DR artifact 取得。此步涉及來源角色不可達的本機模擬，未驗實際主站、網路故障及 MinIO 整合。
- 獨立 `last-attempt.json` 和 `last-success.json` 記錄每個 cache 的狀態，失敗留下 staging。沒有整批刪除、快取 GC 或連續可用保證。另有既有 MR1/MR2 真 MinIO 證據。

## HTTP

[E1](../v1-e1-20261115/CONTRACT.md) 的 metadata、搜尋、PDF 頁面關聯、合成身份及 5 秒單請求期限沿用。以 `x-e1-identity` 解析本機 Role，每個 API 請求重新查詢。身份、Space、Tags、正文或附件仍由固定快照與當次合成 Role 決定。404、503 與 no-store 照原契約。

| 路徑 | E2 交付 |
| --- | --- |
| `GET /api/search?q=e2packet` | 搜尋當次 reader 固定版本。每個 hit 多一個 `url`，包含 `version=<snapshotId>`。 |
| `GET /api/pages/{pageId}?version=...` | 成功內容包含 `page.mediaUrl`，含同一版本。 |
| `GET /api/pages/{pageId}/media?version=...` | 附件的 `url` 提供同一版本。 |
| `GET /api/pages/{pageId}/media/{mediaId}?version=...` | 同版且會員關聯與正文 Space 均允許時傳回 PDF bytes，含 `x-e2-snapshot-id`。 |
| `GET /api/status` | 合成研究環境公開安裝狀態。回 reader 固定 `snapshotId`、`snapshotCapturedAt`、`installedAt`、本 cache 的 `latestAttempt` 及 `lastSuccessfulInstallation`。若狀態不可讀則明示 `STATUS_UNAVAILABLE`。 |

正文、media list、下載均先檢查當次 Role 可辨識。缺少、空字串或重複 version 參數回 `400 {"error":{"code":"VERSION_REQUIRED"}}`。單值與該 reader 確定版本不同回 `409 {"error":{"code":"VERSION_MISMATCH"}}`，先於查找頁或附件，回應不含內容。無權或不存在的資料在同版回 404。流量入口無可用 reader 時回 503。

Web 收到版本 409 會移除舊結果／正文／附件，向同一入口提供「重新搜尋」。按鈕保留先前查詢與篩選，回到新結果再開正文與 PDF。合成 client 收到 409 後亦須搜尋重建完整鏈，不可自行去掉 URL 的版本參數。

## 重用

E1 的 fixture、Lexical 抽取、中文正規化、PDF bytes helper、SQLite 搜尋啟動器及 CSS 直接讀取；API／SQLite child／頁面為新目錄中的版本變體。整體採 MR1 的 staging、內容 hash 及固定 reader 方式。維護新增的是 producer 與安裝格式、版本化 URL／恢復、操作指標和 runbook。
