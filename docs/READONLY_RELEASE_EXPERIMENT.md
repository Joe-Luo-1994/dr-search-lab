# 唯讀資料包：先驗證資料是否足夠

本輪問題：保留 ES，以版本化資料包提供 metadata、正文與媒體 bytes，能否完成合成案例的搜尋 → 閱讀 → 下載，而不在請求期間回查原資料來源？對應 F03 的參考架構、D01 與 A01；**不是正式 F03 或 consumer 相容性驗收**。

目前主案是假設 `Next.js API + ES + 發布資料 + ReBAC` 可承擔 DR 唯讀工作。移除獨立 Backend deployment 不代表移除授權、資料組裝、錯誤與 API 相容邏輯；這些工作仍由 DR API 承擔。

## 已有程式揭露的缺口

`lib/lab.mjs` 的 `readPage` 在下載時直接產生 synthetic media 字串，沒有讀取實際媒體副本。原 Demo 成功只能證明 Page → Media 授權判斷的參考流程，不能證明下載資料已完整同步。

| 路徑 | 本輪資料契約 | 正式產品未知 |
|---|---|---|
| 搜尋 | ES 提供命中 ID、score、total；同版 pages 提供 title、Space、Tags | 原 API 欄位、排序、分頁、附件解析、正式 query/mapping |
| 閱讀 | pages 包含正文、Space、媒體關聯及 version | 正文渲染是否還需要其他 DB 欄位、內嵌資源或原服務 |
| 下載 | Page → Media 關聯與實際 binary object；固定 filename、MIME、長度、hash | 正式 media 格式、共用／解除關聯語意、URL 及 Range/串流需求 |
| 授權 | 每次操作呼叫 mock 可見 Space；失敗明確拒絕 | 公司 ReBAC 能否列舉 Space、timeout/部分失敗、身份傳遞 |
| 發布 | 可信來源提供 manifest hash；檢查完整引用集合、檔案 hash 與 ES digest | 真實 MinIO 傳輸、可信發布、跨服務切換、權限新鮮度 |

## 本輪方法

在獨立 `.lab/readonly-release/<run>/` 建立 producer fixture 與 DR 副本；媒體 bytes 只在 producer 產製一次。之後將 producer 目錄改名為 offline，從新 Node 程序讀 DR 副本及既有唯讀 ES。consumer 程式不匯入 producer generator 或原 `lib/lab.mjs`，請求期間不即席生成媒體。這是**檔案來源隔離的參考實驗**，不是公司 Backend/MariaDB 的網路隔離演練。

使用目前合成 ES 參考設定，不改動既有索引／運行中 Demo。分別驗證正文、附件文字及 Space + Tags AND，並比對回傳文件集合／順序。新增跨 Space 共用媒體的合成關聯，僅採「有權 Page 合法引用即允許該媒體」的實驗語意；正式共用規則仍待裁定。

故障案例：缺媒體、損壞 bytes、manifest 漏列必要媒體、重複 Page ID、混版 metadata、ES 指向錯版本。對錯誤資料包拒絕載入；對偽造 Page–Media 關係、撤權及 ReBAC 不可用拒絕交付。保留 V1 舊歸屬仍可能暴露內容的反例，不將即時 ReBAC 說成已解決資料新鮮度。

## 結果如何改變方案

- 若合成流程可完全由資料包完成：支持繼續研究精簡 ES 主案；下一關是將檔案傳輸替換為真實 MinIO 版本發布，並向團隊核對欄位來源。
- 若缺少可匯出的資料：列出具體缺口；比較補匯出、保留必要讀取 API，或保留原 Backend/DB 的代價。
- 若 stale Page/Media 歸屬有風險：交由產品與授權負責人裁定生效時限，再測拒絕清單／更新機制，不能用更換引擎迴避。

停止條件：既定正常與故障案例各完成一次並保存證據，不增加引擎、不做容量結論、不部署展示站。正式資料目前無法提供，所有正式相容性未知維持待驗證。首次執行在本機 Windows；雲端重播、MinIO、HTTP consumer、簽章／惡意發布者與多副本切換不在本輪通過範圍。

## 2026-11-09 實測結果

Windows、Node 22.21.1，連接既有本機 DR Elasticsearch；本輪未修改索引。V1 為 100 pages／101 個媒體物件，V2 為 101 pages／102 個媒體物件。媒體是事先寫入的合成 binary（包含 0–255 bytes），不是正式附件。

| 證據 | 觀察結果 | 不能推論的事 |
|---|---|---|
| 128 組查詢，包括 4 個角色、2 版本、8 搜尋情境及完整 filter-only 分頁 | 與原合成 ES 參考流程的 ID、順序、metadata、score、total 相同 | 不代表公司現行 API、analyzer 或 query 相容 |
| 417 次允許的頁面讀取、425 次允許的媒體下載；另外遍歷拒絕案例 | 正文／關聯相同，下載 bytes hash 與 producer oracle 一致 | 不是 HTTP、瀏覽器渲染、Range、串流或 MinIO 驗證 |
| 17 組整合檢查 | 8 種載入故障因預期原因拒絕；載入後媒體被改動也拒絕下載 | 未實作 active version 切換／回退，不能宣稱發布原子性 |
| 動態 mock 授權、偽造 Page–Media 關係、跨 Space 共用媒體 | 依本輪約定規則允許／拒絕；授權失敗不交付 | 真實 ReBAC 的 Space 列舉、身份與共用媒體政策仍未知 |
| 36 個單元／契約測試（新增 3 個，無 skip） | 新增檢查錯誤 ES hit、未知授權決策、共用 binary 與回傳資料被修改 | 新增單元測試使用 stub；真實 ES 證據來自上述整合實驗 |

首次一般權限執行 `fetch failed`；使用標準權限升級後成功。兩次通過紀錄均保存；第二次加強為核對故障的具體拒絕原因，避免「任意錯誤都算通過」。[完整證據](../evidence/readonly-release-2026-11-09/README.md) 包含原始結果、ES 請求操作紀錄、128 組參考結果、manifest、程式 hash 與首次失敗。

### 重現的反例

Alice 仍具有 ops 權限。p09 在 V1 屬於 ops，在 V2 已搬到 restricted。Alice 透過 V1 仍可取得 p09 與媒體，V2 才會拒絕。因此 **即時 Space Role 並不等於即時 Page／Media 歸屬**。這個反例是測試成功揭露的未解風險，不能計入「授權安全已完全通過」。

### 對提案的影響

本輪支持繼續驗證 `Next.js API + ES + 版本化內容/媒體副本 + ReBAC`：對這份合成契約，資料包足夠完成唯讀流程，不必在請求期間回查 producer。公司正式 Backend/MariaDB 的移除仍待欄位與依賴盤點；本輪新程式是獨立 Node reader，尚未接到 Next.js HTTP route，原 Demo 下載仍為原先示意流程。

成本沒有消失：移除一個 Backend deployment 後，仍需維護 DR API 的授權與資料組裝；資料包新增匯出、完整性驗證、版本協調與媒體處理。本實作載入時讀取全部媒體並掃描 ES，會增加驗證 I/O；metadata 全部駐記憶體、下載整個物件進記憶體。小型 fixture 不能支持大型附件、啟動時間、容量或「總維運成本較低」結論。

下一輪優先研究**完整版本如何發布及失敗時保留舊版**：用真實 MinIO 與兩個 consumer 程序，注入傳一半中斷、物件缺失、ES 版本未到齊、程序重啟，觀察搜尋→閱讀→下載是否固定於一致版本。舊歸屬問題需另有明確時效政策；可先比較更頻繁的關聯更新、獨立撤銷/拒絕資料、或限制過舊副本的可用性，不能假設「同步一天一次」已被安全需求接受。

## 重播

先依既有文件準備合成資料與已封存的真實 ES；`.env.local` 需指定 `ELASTICSEARCH_URL` 與 `LAB_INDEX_PREFIX`。執行 `npm run experiment:release`，每次建立獨立 `.lab/readonly-release/<timestamp>/`，不重建／修改既有索引或 Demo 資料。一般測試執行 `npm test`。實驗只允許 credential-free loopback ES；跨區／帶憑證正式環境不在這支腳本適用範圍。
