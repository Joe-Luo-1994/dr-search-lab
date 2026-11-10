# 11/11–11/12 內部 DevOps 討論準備稿

準備日期：2026-11-10，Asia/Taipei。會議尚未排定；這是內部共擬 v1 素材，不是完成方案或正式系統稽核報告。

## 開場與本次要得到的決定

我們已有 Next.js＋MinIO＋Cronjob＋內部 ReBAC DR，現在要補搜尋、核心 consumer API 與授權完整性。你們熟悉現行 Infra；我帶來 Web 可承擔的讀取能力、已測證據與成本缺口，一起選一條現階段合理路徑，再攜 v1 請 FDE／一個核心 consumer owner 挑戰。

本次結束希望拿到：
1. 現行 DR 拓樸、備份內容與權限路徑的共同底圖。
2. 同意哪個候選先驗證、什麼結果會轉到備案。
3. 往 FDE／核心 consumer 問的前三個決定題、窗口與下一次檢查點。

PM 已確認 readonly、下載、搜尋方向；具體時效、搜尋語意、consumer契約與授權政策尚待確認。當前Lab與正式DR是兩套系統，以下證據不可直接互換。

## 一頁結論：可以做，但哪些工作仍要有人負責

**已有直接證據**：Node runtime 的 Next.js API 能提供合成搜尋與正文讀取；既有 SQLite／MiniSearch／Orama 的篩選搜尋不必呼叫獨立 ES。這支持先評估沿用 Web 增量方案。

**尚未跨過的門檻**：正式備份資料是否足夠、核心 consumer 接口、真實授權、中文與搜尋品質、可恢復的版本發布、容量／併發與部署型態。減少搜尋服務會把索引、資源及更新責任放到應用端，成本要列出。

暫定 A 為待評估候選，不是已選定：沿用 DR＋Web API＋本地／嵌入式搜尋；B 為新增獨立搜尋服務。若資料／業務依賴無法承接，再評估保留必要後端。先用已有資料和小實驗比較，不同時實作三套。

## 新證據如何影響討論

原始紀錄：`evidence/devops-prep-2026-11-10/`。

| 證據／觀察 | 能支持的判斷 | 不能推論／會議問題 |
|---|---|---|
| 4引擎×8案例＝32次真實Next HTTP搜尋，67項assertion通過 | 現有Web可承擔搜尋API及合成規則 | 不代表正式consumer相容；問必要endpoint、身份、欄位／錯誤／分頁 |
| 獨立Node程序封鎖fetch、無外部引擎URL，3個嵌入式搜尋各找到p01／17筆、remote attempts=0 | 基本篩選查詢不需遠端ES呼叫 | 不是OS網路隔離或整個Next無外部依賴；真實ReBAC仍為依賴 |
| Space＋Tags AND、技術代碼、附件暗號在四引擎均找到候選目標；禁止Space與guest拒絕成立 | 可提供具體任務範例讓PM／consumer挑戰 | 只有synthetic/mock；附件文字已預先提供，沒有驗證PDF解析 |
| 中文「資料庫備份」：SQLite 1、MiniSearch 1、Orama 0、ES 32筆 | 預設斷詞差異會影響任務；p01正文包含詞組，只有ES在此查詢找到p01 | ES較多不等於較準；要用真正任務決定必要召回，不用一致筆數當唯一標準 |
| V1搜尋p09→本session發布V2→讀p09回404 | 既有Demo未固定跨請求release；版本切換會改變操作鏈 | 是Lab現象，不指稱正式DR有同樣問題；不能將一般API存在當完整consumer體驗 |
| HTTP媒體路徑回示意文字；前輪獨立reader另驗證425次binary下載 | 真實bytes讀取已有另一層合成證據 | 兩段尚未串接HTTP／MinIO，不宣稱端到端附件完成 |
| 無真實登入的Lab預設Alice；ReBAC失敗三路徑503；偽造媒體關聯403 | 有合成fail-closed規則與可觀察反例 | Demo identity不是正式認證；需盤點正式website與service consumer身份 |
| 本輪初始服務離線，按文件正常啟動；127檔checksum及4索引digest保留 | 有正常啟動／資料保留證據 | 不代表平台永久程序、公司DR HA或正式RTO |

browser smoke 13 checks、4 engines、ES verified通過；未重建資料／build／索引。不要以更多測試數取代上述缺口。

## 候選責任與成本差異

| 工作 | A：Web＋嵌入式／本地搜尋 | B：Web＋獨立搜尋服務 | 雙方都要做 |
|---|---|---|---|
| 查詢執行 | 與Web共用資源；需評估同步查詢／索引載入影響，必要時worker或隔離 | 外部服務資源與故障獨立，但多服務管理／連線成本 | 代表性查詢、timeout／限流、可觀測性 |
| 索引準備／更新 | 準備版本化索引、下載驗證、各副本載入切換 | provision／restore、版本綁定與服務就緒 | 來源完整性、發布gate、失敗保留舊版 |
| consumer API | Next server routes＋共用讀取／授權模組 | 同左，不因增加ES就自動有API | 正式契約、身份與授權、下載行為 |
| 復原與維護 | 本地磁碟／記憶體、cold start、更新與應用升級耦合 | 增加服務部署、監控、升級、備援與容量 | owner、runbook、演練、切回、GC |

本地索引是從物件儲存下載後的可驗證本地檔案候選；不直接假設把MinIO當共享可變SQLite檔案來開啟。選型也依現行Next是否Node server、可用本地磁碟、多副本與runtime版本而定。

## 會前最值得拿到的現有資料（無須先產生新大文件）

| 現有資料／描述 | 最少需要什麼（可去敏） | 會改變哪個決定 |
|---|---|---|
| DR部署與資源 | Node/Next版本、server或static export、container／程序數、CPU/RAM配額、本地磁碟／持久性 | 嵌入式搜尋與server routes能否沿用、是否會競爭 |
| Cronjob及備份格式 | 一份目錄／manifest範例、metadata欄位、正文/媒體對應、附件文字、成功／失敗判斷 | 是否已有足夠資料，不夠時補匯出或保留服務 |
| 資料與流量輪廓 | 頁數、總文字／附件量、最大附件、語言比例、預估併發與批次consumer | 下一輪容量／搜尋語意測試；避免用100頁推正式規模 |
| 現行存取路徑 | 身份來源、ReBAC輸入輸出、授權在何處、物件是否直連或簽名URL | 哪些邊界應共用／重做；如何避免網站安全而API漏檢 |
| 已知操作痛點 | 一次同步失敗怎麼發現／恢復，升級與重啟怎麼處理 | 哪個改善最有即時維運價值、發布實驗優先度 |

資料由DevOps現有經驗／配置摘錄即可；不要要求提供憑證、正式內容或個資。本輪未取得這些內部資料，不假設已有任何答案。

## 建議45分鐘議程

- 0–10分鐘：DevOps走現有DR資料／部署／授權路徑，我們共同補底圖。
- 10–20分鐘：展示三個具體觀察：基本查詢可在Web完成、中文差異、切版後閱讀失敗。用文字證據或使用者本機Demo，雲端localhost不當使用者入口。
- 20–35分鐘：討論A/B資源與責任，找一個優先驗證與轉案條件。討論實際需要，不介紹ES基礎。
- 35–45分鐘：確認內部v1的結論／條件，分出FDE與核心consumer待問事項、負責窗口與下次檢查點。

成功輸出是可追溯的決定或條件，不是要求大家當場同意所有實作。主管可在本次後收到「內部v1、阻塞、下一個有界投入」；不等最後完成。

## 證據優先順序與下一輪小切片

1. **先盤來源資料與部署條件**：這兩項可能直接推翻A，現有資訊比新增大規模Lab更有價值。
2. **一個核心consumer操作鏈**：以正式契約到齊的部分為準，補身份／搜尋→正文→binary下載；資料未到齊維持synthetic標籤。
3. **可恢復發布**：根據現行Cronjob/MinIO缺口剪裁M01，不盲目全做；先測一個中斷點與跨請求版本。
4. **有界負載與中文任務測試**：拿到量級及查詢需求再做；現在不擴張引擎、不安裝中文插件來美化結果。

授權與上述各切片同步處理。原本已驗證的單元測試不為會議重新堆數量；本輪67項為新增觀察的probe，原36tests結果仍標明前輪。

## 官方實作邊界（2026-11-10查閱）

- Next.js BFF/Route Handlers可以提供HTTP與非HTML內容，但完整Backend所需邏輯與身份／授權仍由應用實作：https://nextjs.org/docs/app/guides/backend-for-frontend
- 本Lab pinned Node v22.21.1 的 DatabaseSync API為同步；Web共用event loop的影響要量測，不能由小樣本推容量：https://nodejs.org/download/release/v22.21.1/docs/api/sqlite.html
- SQLite官方提醒遠端filesystem不是透明的本地替代；本地副本與共享可變DB是不同設計：https://www.sqlite.org/useovernet.html
- 多副本Next部署的cache及協調須按實際使用功能檢查，與我們的release一致性不是同一件事：https://nextjs.org/docs/app/guides/self-hosting


## Linux內部演示與Pagefind補充

使用者已選公司Linux主機／容器、synthetic先行。會前請用 `INTERNAL_DEMO.md` 的fresh-only啟動包；從 `/briefing` 對齊價值與架構，再進互動Lab。可將原議程10–20分鐘延長為15分鐘，從方案比較時間挪5分鐘；仍保留最後owner／下次檢查點確認。

Pagefind專篇與真實合成實測見 `PAGEFIND_ASSESSMENT.md`：中文案例值得保留；前端filter並不能保護可下載的全量索引。要問現有群組／靜態資產能力能否降低安全交付成本、consumer接口是否會新增第二套維護。這是候選差異，未選定最終架構。

新Linux副本已36tests／13browser checks／5導覽檢查；Pagefind8查詢／10checks。內部部署尚未發生，請保存公司實測結果與失敗，不沿用雲端數字。對照表 `REAL_DATA_MAPPING.md` 幫助DevOps以現有資料回答，不要求會前新造大型文件。


### 最終展示節奏修正

`/briefing`已改四段可互動流程，主持方式見 `DESIGN.md`。先請DevOps修正底圖，請參與者挑一個情境，再比較責任，最後留下待確認事項與owner。三個議題預設待確認，下載為草稿不是簽核。公司已有Harbor、可能API，先用 `INTERNAL_HARBOR_DISCOVERY.md` 尋找可沿用的base與npm供應，不以公共image作前提。最新互動驗證14checks已通過；人的理解／採用仍要內部試用。
