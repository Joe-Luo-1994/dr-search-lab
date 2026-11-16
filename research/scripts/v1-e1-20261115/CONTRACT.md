# E1 小型合成 API 契約草案

對應 V1／V2／V6。B 與 C 共用真 Next 路由、唯讀網頁、合成快照、授權及回應契約。B 搜尋用 Elasticsearch standard analyzer，C 用以既有 `normalizeQuery` 正規化的 SQLite FTS5。B/C 的分詞與排序可不同，必要及禁止文件由 reviewer 依 fixture 判定。上線與執行門檻以凍結卡為準。

C 在小型 E1 用有界短命程序執行每次唯讀 SQLite 搜尋，與舊常駐 pool 不同。這條路徑的延遲包含程序啟動，僅用於本輪功能期限，無法支持容量、正式操作或維運優勢推論。

## 來源及授權

- [fixture/source.json](fixture/source.json) 含 37 頁及 2 個合成 PDF 記錄。每頁含 `pageId`、可信 `spaceId`、`title`、`tagIds`、具順序的 `paragraphs` 與 `mediaIds`。正文是 `paragraphs.join("\n")`。Prep 轉成最小 Lexical 段落並重用既有文字抽取，閱讀畫面用純文字呈現。PDF 以固定生成器製作，`extractedText` 表示先前抽取的搜尋文字。PDF 原始位元組的 SHA-256 固定於來源，由 prep 重新核對。
- 只啟用 IPv4 loopback。HTTP client 每次送 `x-e1-identity`。基準 a=`space-a`、b=`space-b`、all=兩者、none=空集合。不存在或未知身份、不可用的合成 Role 政策均回 503 `AUTHORIZATION_UNKNOWN`。角色政策由 server-controlled runtime 檔決定，唯讀 UI 的身份選擇器是合成標籤。
- Page 的 Space 與 page → media membership 都取自固定快照。下載重查 Page Space 和指定 media 是否屬於這一頁。Media 沒有獨立 Space 欄。拒絕與未知 ID 皆回同一 404 `NOT_FOUND`。資料過舊政策草案維持固定快照並顯示來源時間，E1 不假設 daily／4h 是上限；可用性與暴露依凍結卡判讀。E1 無切換或 installer。

## HTTP

所有 JSON 成功回 200，`Cache-Control: no-store`。API 錯誤形狀固定為 `{"error":{"code":"..."}}`。所有成功 JSON 包含 `snapshotId`、`snapshotCapturedAt`、`authorizationCheckedAt`，前兩欄取 fixture，第三欄為伺服器該請求實際查得 Role 時的 ISO 時間。

| 路徑 | 參數及回應 |
| --- | --- |
| `GET /api/search?q=zephyr&spaceId=space-a&tagId=runbook&tagId=validated` | `q` 必填，UTF-8 的字詞查詢，最多 120 Unicode code points，視文字為字面 token，不提供查詢運算式。字詞 AND 可跨 title、正文及該頁 PDF 抽取文字。連字號技術碼沿用各引擎的拆詞及 AND，比對精確碼的正式契約待確認。可省略 Space 與 Tag，Space 單值且與可信集合取交集，Tag 可重複指定、至少同時具備所有所選 metadata tags。Tag 字樣出現在正文不視為 metadata。已知但無權的 Space 回成功零結果。無效參數、未知 Space/Tag 或空白 `q` 回 400 `INVALID_REQUEST`。裝載最多前 10 筆，`total` 為完整授權後命中數，`hits` 為 `{pageId, spaceId, title, tagIds, snippet}`。Snippet 為 title 之外的搜尋文字片段，先取第一個含原始 q 任一空白分隔詞（忽略大小寫）的正文段落或 PDF 行，未找到則取第一個正文段落，最多 160 Unicode code points。純文字、沒有 highlight 或 match-offset 保證。 |
| `GET /api/pages/{pageId}` | `{page:{pageId, spaceId, title, tagIds, body}}`。先以 canonical Page 找 Space 再作授權。 |
| `GET /api/pages/{pageId}/media` | `{pageId, media:[{mediaId, fileName, mimeType, sha256, bytes, url}]}`。無附件回空陣列，`url` 就是頁面 scoped 的下載路徑。 |
| `GET /api/pages/{pageId}/media/{mediaId}` | 200 傳回 PDF 原始 bytes，`Content-Type: application/pdf`，inline Content-Disposition 附合成檔名。伺服器先驗 PDF hash 再交付；格式完整性或供檔故障回 503 `MEDIA_UNAVAILABLE`。以實際 body 的 SHA-256 獨立驗證。 |

搜尋依賴錯誤回 503 `SEARCH_UNAVAILABLE`。角色檔不可讀回 503 `AUTHORIZATION_UNKNOWN`，快照無法讀取回 503 `SNAPSHOT_UNAVAILABLE`。任何依賴錯誤皆不能包裝成成功零命中。各普通 API 請求採 5 秒有界研究期限，最終下載及完整任務期限由執行卡依 bytes 訂定。沒有受信 downstream 快照升版承諾。

## Drift 診斷提案

| 輸入 | 凍結快照 | 擬模擬的目前狀態 |
| --- | --- | --- |
| 移頁 | `a-move` 屬於 `space-a` | 同一頁改屬 `space-b`，fixture 不動 |
| Role 撤除 | `b-roles` 屬於 `space-b` | 受控 runtime Role profile 由 baseline 改成 revoked-b，身份 b 即時成為空集合；all 的基準角色獨立 |
| 附件關聯移除 | `a-pdf` 屬於 `space-a` 並關聯 `pdf-checklist` | 模擬目前來源已解除這條關聯，fixture 不動 |
| 同步失敗 | `a-sync` 為本地已存在的內容 | 模擬沒有取得新版，原快照持續服務及顯示原來源時間；不執行真同步或 E2 切換 |

真 provider 錯誤案例可經 runner 暫停隔離 ES 或使隔離 C 的 SQLite 讀取檔暫時不可讀，檢查搜尋錯誤與本地正文可以分別辨識。凍結卡固定注入/回復方式和觀測時間，記合成政策、目前來源關係及可觀測暴露時間；超出量測窗口的暴露長度未知。

## 與現有合成 API 的差異

S1 ES 有 `spaces`、分頁、`total:{value,relation}`、多態 highlight 與舊身份 header。此切片用單一 `spaceId`、重複 `tagId`、前十筆及整數 `total`，回共同 snippet 並新增 page-scoped media URL。代表 client 採新契約；現有 consumer、正式 ReBAC、既有 editor 及異地 MinIO 整合仍待驗。
