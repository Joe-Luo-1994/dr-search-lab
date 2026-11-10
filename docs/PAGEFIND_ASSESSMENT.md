# Pagefind：對現有 DR 的價值與代價

2026-11-10。目標是讓既有 DR 的搜尋、讀取與下載被採用；不以引擎功能數或與 ES 相同結果作為唯一目標。內部 DevOps 曾提出 Pagefind 值得探索，本輪用官方文件與真正執行結果建立討論依據。

## 為什麼值得認真考慮

Pagefind 把文字製成可靜態交付的索引，由瀏覽器載入與查詢。對共同可見的知識網站，可減少常駐搜尋服務、部署與監控項目。它也提供自訂索引記錄，並非只能爬靜態 HTML；即使來源是 MinIO 備份，仍可能從匯出資料建索引。這是可行路徑，尚未串接公司備份。

代價轉移到索引建置／發布、瀏覽器載入與資料交付邊界。現行需求還包含分權資料與 consumer；「無搜尋 server」不等於這兩項已被解決。

## 本輪直接證據

Pagefind 1.6.0，Node v22.21.1，Linux Chromium；100 篇相同 generator 的 synthetic V1，包含事先給定的附件文字，所有記錄以 `zh` 建索引。不是正式語言分布或 PDF 解析。新索引位於隔離 `.lab/pagefind/run-*`，不改現有 fixture、build 或 ES。

原始結果：`evidence/pagefind-2026-11-10/result.json`；可重播程式：`scripts/pagefind/`。8 組查詢、10 項 assertion 通過，含互動 UI。通過包括反例成功重現，不能解讀成 Pagefind 已通過正式授權驗收。

| 任務／操作 | 本次結果 | 對選型的意思 |
|---|---|---|
| ops 搜尋 disaster recovery | 34 筆 | 支持一般英文任務；排名是否合用要有期待結果 |
| ops 搜尋資料庫備份 | 3 筆，p07、p02、p01 | 中文值得保留候選；非連續詞出現在 p02 也被召回，是否合用由任務判定 |
| ops＋database/runbook Tags AND，backup | 17 筆，含 p01、不含只有 database 的 p02 | 篩選能表達此合成條件；不是授權證明 |
| bakcup | 0 筆 | 本設定不滿足此錯字案例；錯字容忍是否必要待 PM 確認 |
| ERR_CONN_RESET | p05 | 技術代碼任務在此成立 |
| quartzfalcon | p06 | 可索引預先解析的附件文字；解析與下載能力仍是另一項工作 |
| confidential＋ops 篩選 | 0 筆 | UI 可隱藏不屬於 ops 的結果 |
| 同一可讀索引移除篩選 | p11 與 restricted synthetic 文字可取回 | client 篩選不能成為分權邊界；不能把所有權限內容先交付再只隱藏結果 |

與前輪四引擎的結果可用來討論任務，不能當嚴格效能競賽：Pagefind 此次統一使用 zh、含附件，索引設定與返回策略不同；沒有正式相關性標註、延遲 SLO、容量或併發驗收。沒有將它悄悄算成主 Lab 的第五個已整合引擎。

## 三種部署方式，三種成本

| 候選用法 | 能提供的價值 | 必須支付／確認的成本 | 建議門檻 |
|---|---|---|---|
| 所有人可見資料，或共用同一權限的固定群組 | 靜態發布、少一個常駐查詢服務 | 確認整包索引皆可交付；群組登入／路徑保護、更新一致性、舊索引存留 | 能合法交付整包，撤權政策允許已下載副本的限制 |
| 依 Space／群組拆分索引並保護每個資產請求 | 保留部分靜態交付優點 | 所有 JS／metadata／fragment／WASM相關路徑、cache、跨群組搜尋／排名／分頁、權限變更後重建與撤回；群組組合可能膨脹 | DevOps／資安確認邊界，owner 願意承擔拆分及測試成本 |
| 網站 Pagefind，consumer 用另一個 server 引擎／adapter | 網站與機器接口可各自適配 | 兩份搜尋語意、索引、測試及故障排查；client library 或瀏覽器模擬若拿來 server 查詢也需維護 | 一個真實 consumer 接口與共同任務證明收益足以抵成本 |

第三條是可探索方向，不是已證明需要兩套或已實作的方案。官方 Node API 文件描述建索引；官方搜尋 API 描述載入生成的 browser module。本輪未找到文件化的正式 Node server 查詢契約，不宣稱技術上不可能包裝。

即使對資產每次做授權，也不能收回已下載的索引文字；任何 client 曾合法下載的正文也有相同本質限制。差別是完整索引可能一次交付較大範圍，因此需先確認披露範圍、cache 與撤權政策，而非只討論網頁結果是否可見。

## 對各方的價值確認

- Reviewer：能否在事故中讓關鍵任務繼續，並說清楚權限／資料時效？不要求理解 WASM；用 p01 的任務與 p11 的邊界展示。
- DevOps／資源提供者：省下服務是否超過新增索引發布、權限分包、故障排查與磁碟／client流量成本？現有 Cronjob 可否承接？
- 核心 consumer：若不能直接沿用 HTTP 契約，轉接、SDK、語言及部署負擔誰承擔？先找一家 owner 判定，不要求所有 consumer 自行補齊。
- PM／User：代表性中文、代碼、附件文字是否找得到？裝置下載量、首次載入、失敗提示是否可接受？本次僅小樣本，尚無容量結論。
- FDE：內部是否已有受保護靜態資產、群組授權或成熟索引／API平台可沿用？若能利用既有能力，可能改變成本結論。

## 有界下一步 PF01（待內部 v1 選擇，尚未執行）

只在 DevOps 證明「固定群組可整包交付」或有現成安全分包機制後，投入最多一個有效工作日，選一個 group、5 個重要搜尋任務和一個 consumer 操作鏈，用去敏／合成資料量級重播。輸出下載 bytes、冷／熱查詢觀察、授權拒絕、發布失敗保留舊版及新增維護步驟。時間上限是探索預算，不是正式 SLA。

停止條件：權限政策不容許整包披露且無現成可維護分包；consumer 需要另起大套 adapter 卻沒有 owner／預算；一天仍無可判定證據。停止表示轉向 Web server 授權查詢候選或保留待解題，不追加 hacks 讓測試看起來通過。通過只代表保留候選，下一輪仍需 MinIO 版本一致性與正式身份驗證。

## 官方資料（2026-11-10 查閱）

- 總覽／靜態索引：https://pagefind.app/docs/
- Node 建索引 API、自訂 record：https://pagefind.app/docs/node-api/
- Browser 查詢／結果 data()：https://pagefind.app/docs/api/
- Filters 的 AND／any 等語意：https://pagefind.app/docs/js-api-filtering/
- 多語及中文斷詞：https://pagefind.app/docs/multilingual/

npm registry 版本與 integrity 在 `npm-metadata.json`，固定版本與 lockfile 在 `scripts/pagefind/`。初次 npm cache 存取失敗保留為環境／安裝證據，不改寫成首次無條件成功。
