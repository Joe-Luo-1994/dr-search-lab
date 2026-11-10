# DR Search Lab — 搜尋備援實驗室

這是可操作的研究原型，目的是比較搜尋語意、結構化篩選、授權與部署取捨，不是正式 DR 系統。

雲端移轉與重建步驟見 [CLOUD_MIGRATION](docs/CLOUD_MIGRATION.md)，agent 接手先讀 [HANDOFF](docs/HANDOFF.md)。新版雲端快照冷啟動已有驗收紀錄；永久程序存活、正式 RTO 與使用者 viewer 仍未驗收。

公司 Linux **新合成副本**請用 [內部 Demo 操作包](docs/INTERNAL_DEMO.md)，含 `/briefing` 會議導覽、架構圖、任務情境、Pagefind 獨立實驗與真實資料對照表。現有雲端 checkout 僅依 [onboarding/start.md](onboarding/start.md) 啟動，不重建既有資料。內部主機／容器尚未實際部署。

## 執行

需求：Node.js 22.13+（本次使用 22.21.1）、npm。Node 22 的 `node:sqlite` 會顯示 experimental warning。本機模式不用 Docker，也沒有外部字型或 CDN。

```powershell
npm ci
npm run prepare:data
npm run build
npm run start
```

開啟 <http://127.0.0.1:3000>。開發可用 `npm run dev`。採 webpack，以避開 Windows 受限環境建立 Turbopack junction 的問題。

## 目前狀態

| 項目 | 狀態 |
|---|---|
| Next.js UI／伺服器 API | 已實作 |
| SQLite FTS5、MiniSearch、Orama | 真實建立、序列化、載入、查詢索引；有契約測試 |
| Elasticsearch | 真實 native 雙 cluster 實驗通過；snapshot 還原、混版檢查、契約與瀏覽器已驗證，見 docs/ES_EXPERIMENT.md |
| Meilisearch、Typesense | HTTP adapter、provision 腳本、Compose 已提供；尚未在本機服務驗證 |
| Pagefind | 1.6.0 獨立合成實驗：8查詢／10檢查；未整合主Lab、正式ReBAC或consumer，見 docs/PAGEFIND_ASSESSMENT.md |
| ReBAC | 本機模擬：可見 Space 集合、延遲、撤權、故障；不是公司服務 |
| Media | 合成文字檔下載；驗證 Page 權限及 Media membership |
| MinIO | 未接入；以本機 `.lab/data` 表示發布檔來源 |
| 發布 | 必要檔案集合＋checksum；已設定 ES 時還檢查兩份索引的實際內容 digest／write block；失敗保留舊版 |
| 完整 RTO、DNS、跨區、負載與多副本 | 尚未演練 |

僅綁定 loopback。模擬身分可由 UI 切換，不是正式登入；請勿直接公開部署。會話在程序記憶體內，重啟失效，不支援跨副本共享。

## 五分鐘展示

1. 以 Alice 選「Space ＋ Tags AND」，按「比較搜尋」。三個引擎實際執行；所有結果必須在 ops，且同時具有 database、runbook。
2. 選「中文連續字詞」，再比較。觀察結果差異，不能直接宣稱文件較多就是品質較好。
3. 選「附件文字」；開／關附件解析文字，觀察 p06。此處使用已解析文字，沒有測 PDF parser。
4. 點結果閱讀 Page、下載 Media。下載必須通過 Space 權限和 Page→Media 關聯檢查。
5. 切 Guest，搜尋結果應為零。切「授權與版本」，模擬 ReBAC 故障，API 應回 503 而非空成功結果。
6. 重設會話，回搜尋查 transfermarker：V1 可見 p09。切 V2 後，p09 移至 restricted，Alice 無法再看；freshmarker 則新增可見。
7. 模擬同步失敗，確認版本不變。這只示範本地驗證與切換，不代表已完成 MinIO 原子發布或 RTO。
8. 匯出 JSON，保存此次查詢、身分狀態、結果、耗時與限制。

## API

先 `GET /api/lab/status` 取得本機 session cookie；同一 consumer 的後續呼叫需保留 cookie。

```http
POST /api/lab/search/sqlite
Content-Type: application/json

{
  "keyword": "backup",
  "spaceId": "ops",
  "tagIds": ["database", "runbook"],
  "page": 1,
  "pageSize": 5,
  "includeAttachments": false
}
```

`search/{engine}` 的 engine 是 `sqlite`、`minisearch`、`orama`、`elasticsearch`、`meilisearch`、`typesense`。`pagefind` 明確拒絕。

- API 用可信的會話狀態取得使用者及可見 Space，與請求 Space 取交集。請求不接受自訂 allowedSpaces。
- Tags 是全部符合。只允許 fixture 中的穩定 ID，避免把任意 filter expression 拼入查詢。
- Demo 中空白 keyword 視為純篩選，便於隔離斷詞與結構化條件；正式 API 是否允許此操作仍待確認。
- 輸出含 `hits`、`total`、`totalRelation`、`version`、`metrics`、`warnings`。Meilisearch 目前是 estimated total，不假裝精確。
- `GET /api/lab/pages/p01` 閱讀；加 `?mediaId=m-p01` 下載；每次重新授權。
- `POST /api/lab/control` 是教學操作，不是 production control plane。

## 測試與報告

```powershell
npm test
npm run benchmark
node scripts/observe.mjs
node scripts/browser-smoke.mjs
```

最後一個命令需啟動網站；Windows 預設 Microsoft Edge，Linux 預設 Playwright Chromium（先 `npx playwright install --with-deps chromium`）。使用獨立無頭瀏覽器，不讀取個人 profile。可透過 `LAB_BASE_URL`、`LAB_BROWSER_CHANNEL` 指定網址與瀏覽器。

報告與截圖在 `.lab/reports/`（不進 Git）。Benchmark 每個引擎使用獨立 Node 子程序、5 次暖機、50 次混合查詢，輸出 p50/p95、冷載入時間與 RSS。它是單客戶端函式級 microbenchmark，**不是 Next.js HTTP 吞吐量、完整 RTO 或硬體估算**。RSS 包含共用模組，不是引擎純增量記憶體。畫面逐一查詢以減少相互干擾，但畫面耗時也不是正式負載測試。

## 改變資料規模

停止 Next.js，再執行：

```powershell
npm run prepare:data -- 1000
npm test
npm run benchmark
npm run start
```

允許 12..100000 篇，預設 v1 100 篇、v2 101 篇。資料固定可重現，但它只涵蓋有限分布，不能代表真實長文、附件或語言比例。重新產製目前會覆寫本地 fixture，必須停止 server，不能用來模擬線上更新。UI 的 v1/v2 切換使用事先備妥的完整檔案。

## 啟用外部引擎

Compose 僅提供 loopback 開放埠與固定參考版本：ES 8.17.0、Meilisearch 1.12.0、Typesense 27.1。這些不是正式部署的版本或資安建議。記憶體限制是實驗上限，不是 sizing 結論。

```powershell
docker compose up -d
Copy-Item .env.example .env.local
npm run provision
```

服務 ready 後再 provision；然後重新啟動 Next.js。也可只啟動一個服務，並只在 `.env.local` 留該服務設定。

provision 僅允許 localhost，建立 `drlab-*` 測試索引，不刪除既有索引。既有名稱衝突時會失敗；更換資料集後需人工管理自己的 demo 索引／volume，再重新匯入，切勿針對正式環境執行。ES Bulk errors 與 Meilisearch 非同步 task status 都會被檢查。

外部引擎有自己的資料庫，不受本地 manifest 完整覆蓋。ES 已加入每版本 mapping metadata、實際文件 digest 與 write-block 檢查；另兩個外部引擎尚未加入相同 gate。回傳命中後仍驗證本地 Page、Space、Tags，一旦不一致即拒絕交付。完整內容比對是 O(N) 成本，且目前沒有正式的不可變版本／簽章系統。

本機 Docker 啟動失敗時可走 native ES 實驗路線，見 `docs/ES_EXPERIMENT.md`。目前 `.env.local` 指向已還原的 loopback DR 節點；Meili／Typesense 未啟用。執行 `npm run experiment:es` 可重現（先依文件準備官方套件）。

## 已知工程限制

- 同步 SQLite／JS 搜尋可能阻塞 Next.js event loop；worker isolation 與多副本成本待量測。
- 三個內嵌引擎使用參考 tokenizer，未做專用中文調整。這是觀察差異，不是刻意調到某引擎獲勝。
- metadata 每次由 JSON 讀取，會影響量測；大規模需要獨立評估 cache／SQLite metadata lookup。
- UI 每個版本／附件開關會保留已載入引擎 cache，benchmark 則每次獨立程序；兩者 RSS 不應混用。
- 一個請求使用起始時的身分／版本快照；進行中的權限變更、串流撤銷與 signed URL 不在本階段範圍。
- 未含 TLS、正式登入、API rate limiting、持久 session 或 HA。

後續探索先讀 `docs/VERIFICATION_PLAN.md`：目標、主張 ID、驗證矩陣、防漏檢查與每輪停止條件。詳細 Demo 設計見 `docs/DEMO_DESIGN.md`。
