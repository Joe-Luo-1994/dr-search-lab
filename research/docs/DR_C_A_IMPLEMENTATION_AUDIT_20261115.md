# C 與 A：實作工作與容量成本核對

2026-11-15。本輪主 agent 查程式與既有證據，v1_experiment_design_review 獨立做唯讀反例審查；沒有新壓測、產品修改或成本勝負裁定。人時、token 金額及正式資源單價未知。

A 是完整 Next／Backend／MariaDB／ES／MinIO 異地方案；C 是 Next／本地 SQLite 與 metadata／異地 MinIO 正文與附件，兩者保留正式身份與 ReBAC 責任。C 的受控流程已成立，不等於最新整合程式已達正式容量。A 公司程式與部署配置未在 repo 中，Next→ES 只能是 B-reference。

## 按實際工作比較

| 工作 | C 要交付的東西與目前程度 | A 對應成本與重用條件 |
|---|---|---|
| 一致資料來源 | 從同一資料切點取得 pageId、title、正文／PDF抽取文字、Space、Tags、page→media 與物件身份；現在用合成來源，正式 MariaDB 匯出未接 | MariaDB 備份／還原或複寫，加上 ES 與 MinIO 的恢復一致性；若既有備份已可異地還原，可大幅重用 |
| 集中建置與發布 | 建 SQLite／metadata／搜尋文字，驗證版本及成員關係，發布正文／媒體，讀回驗證後啟用版本；小型 builder／publisher 已做。正式排程、重試、跨站完成判斷、保留與告警待接 | 還原 ES 或由資料重建索引，沿用既有 indexing pipeline 的程度待確認；完整 stack 也需恢復順序與可用驗證 |
| 每個 reader 安裝與更新 | 下載到 staging、校驗、ready、舊版保留與失敗回復；已有分開的腳本／受控證據。Kubernetes rollout、in-flight、磁碟水位、GC 尚非正式交付 | 部署既有服務及 stateful 儲存，恢復／ready／路由；既有 Helm／operator／平台自動化能否直接重用待確認 |
| 搜尋與 API | 身份→Space→SQLite 篩選與排名→pageId／摘要；小型流程已做。正式身份／consumer 契約、中文品質、容量與背壓待完成 | 大多沿用既有 Backend／ES 查詢與回應；正式異地恢復及容量仍需驗證 |
| 閱讀與下載 | canonical page→Space／media membership 後遠端讀取並驗證；真 MinIO 小物件已驗。正式正文格式、大附件、Range／串流／代理選擇及 IAM 未完成 | 現有 Backend／MinIO 路徑可望重用，實際代理或直送未知；附件本來就在 MinIO，C 不能把全部附件成本算成獨有節省 |
| 長期維護 | 自有格式、builder、安裝器、搜尋 adapter、API／授權、依賴更新與復原演練；需 owner | 服務及資料庫／ES 升級、備份、監控、容量、演練；平台已承擔的能力以實際增量計，不能重算全套研發 |

## Reviewer 確認的容量缺口

1. `scripts/v1-remote-content-20261115/api.mjs:45` 每 request 重讀／hash／parse 全 manifest、建立 Map；搜尋 `:143` 再讀完整 search-text。應評估每版本驗證重用及按命中取摘要。這是目前 adapter 成本，不是 SQLite 固有限制；B 若沿用同 adapter 也有此成本。
2. `scripts/v1-e1-20261115/search.mjs:6` 每 query 開 Node child，模組實例最多四個，超額拒絕；不是已證 QPS 或整個 Pod 限額。新 SQLite query 每次開 DB、精確 count、再排名前十；常見詞、大 Space 與 Tags 需單獨量測。
3. `scripts/v1-remote-content-20261115/s3.mjs` 整份讀入、合併 Buffer、hash，API 回傳另有複製。沒有全域內容併發護欄／Range／streaming；物件上限 1 MiB。大 PDF 不能只提高上限便宣稱已解決。
4. 最新 builder records 上限 50、manifest 256 KiB、artifact 8 MiB，屬研究護欄。不能直接放大 fixture，把拒絕誤報為搜尋引擎容量上限。
5. 歷史百萬 L 含正文約 2.13 GB，Node HTTP harness、最多一個查詢在途、沒有 Tags、total 封頂；最新 R1–R3 是 37／38 頁 Next、精確 total、遠端取件。不能跨 build 拼成百萬頁整合版容量認證。舊 20 MiB/s 下約 107 秒只是特定下載／校驗子路徑，不是整體 RTO。

## 如何取得可比較數字

先將已知的全量重讀／每次 spawn 問題拆成一個獨立、保留舊證據的容量候選；按版本管理 catalog、按命中讀摘要、有限長駐 worker／佇列，以及明確的下載記憶體與併發政策。每項改動分開記錄人工／運行成本，不先填無依據人日。

用相同來源、正確性、total／前十筆及授權契約，在同總 CPU／RAM／儲存口徑下量單請求、逐級固定到達量、混合讀取／下載、更新期間；報 P95、實際吞吐、拒絕／超時、整體程序與 cache 資源、網路與磁碟峰值。需求未知時輸出容量曲線與限制，不宣布 production pass。B-reference 可縮小引擎選擇未知，不能代替 A。

A 先取得同一負載下的實際部署配置、備份還原自動化及新增站點人工範圍。將 C 共享建置／工程維護、每站 Next／本地副本／內容傳輸成本與 A 的真實增量對齊，才可估損益。比較期間、站點數、HA／預熱與保留政策必須相同。

來源：[既有成本模型](DR_COST_DECISION_20261115.html)、[遠端內容結果](DR_REMOTE_CONTENT_RESULT_20261115.md)、[歷史百萬 L](L_FIRST_VERSION_20261115.md)。本輪支持維持 C 為候選並具體估產品化成本；不支持「C 已全部做完，只差部署」或「C 已比 A 更省」。
