# DR 搜尋 Demo 設計與決策紀錄

## 需求基線

- 唯讀：搜尋、閱讀、下載。
- 單一台灣 cluster 故障；非整個地區故障。
- 暫以一小時恢復討論；服務持續時間未設上限。
- 每日同步；允許資料較舊的精確界線尚未正式承諾。
- ReBAC 備援為前提；登入獨立性仍待確認。
- keyword 搜尋 Title／正文；附件解析文字是否屬正式搜尋待確認。
- Space 與 Tags 可組合，Tags 是 AND。
- 既有 API request/response、查詢案例、ES mapping/analyzer、容量與語言比例待補。

## 實驗控制

共用 Page ID、Space ID、Tags、Title、正文、附件解析文字、Media 關聯。所有資料都是合成的。

每個引擎只回傳 ID／score；應用服務再從同版本 metadata 交付欄位，並檢查 Space 與 Tags。搜尋結果不帶私有全文到瀏覽器。授權先取得可見 Space；這是模擬 ReBAC 的介面能力，不能推導公司 ReBAC 有相同功能。

精確條件相同；tokenizer 與排名採各引擎的明示參考設定。數值 score 不跨引擎比較。畫面共同文件只比較本頁 ID，不稱為 recall。

## 資料版本

V1：p09 屬 ops。V2：p09 屬 restricted，新增 p-new。每個版本各有正文／正文加附件兩種索引。

資料包有 SHA-256 manifest。演示的切換對單一程序內的會話原子更新版本指標，不跨服務交易。發布失敗不改指標；真實跨區傳輸與外部索引 gate 待做。

## 第一階段驗收

1. SQLite、MiniSearch、Orama 在 Next.js Server 上提供真實搜尋。
2. Tags AND、Space 範圍與授權下分頁正確。
3. Guest／撤權不取得 metadata；ReBAC 故障回明確失敗。
4. 閱讀與下載重新授權；錯誤 Page→Media 關聯拒絕。
5. 附件文字開關可重現；不混入 PDF parser 的差異。
6. V1 舊歸屬風險可觀察，V2 更正；不宣稱舊權限資料安全。
7. 外部服務未 ready 明確顯示不可用，Pagefind 不偽裝已實作。
8. build、契約測試、瀏覽器 smoke 與小樣本量測各自記錄。

## 後續實作門檻

| 工作 | 必要證據 | 不可提前下的結論 |
|---|---|---|
| ES／Meili／Typesense 實際連線 | 各版本成功匯入、契約測試、相同資料 hash | adapter 存在不代表整合成功 |
| MinIO 同步 | 異地可讀、manifest 驗證、中途失敗、完整版本發布 | 本地檔案複製不代表跨區 DR |
| 正式 ReBAC | 列舉／批次能力、錯誤語意、容量與延遲 | mock 成功不代表正式授權可行 |
| 撤權與刪除 | 內容／關聯／權限的新鮮度契約 | 每日資料同步不保證撤權生效時間 |
| 容量 | 真實總文字量、QPS、併發、長查詢、記憶體峰值 | 100 篇 microbenchmark 不用來 sizing |
| 相容性 | 現有 ES 設定、consumer request/response、真實查詢 | 預設 ES 不是正式環境基準 |
| RTO | 冷啟動、傳輸、服務啟用、導流、consumer 驗證 | 只量索引載入不能宣稱一小時達標 |
| Pagefind | 支援且可維護的 server execution、索引不洩漏、API 契約 | 有 Node indexing API 不代表 server search |

## 評估順序

先看硬性正確性，再看搜尋語意差異，最後量測資源與恢復。授權錯誤不得用較快的效能抵銷；結果較多也不自動代表更佳。

各方案最終以「適用條件／已知代價／尚需證據」呈現，不做不具依據的綜合分數。

## 技術依據

- SQLite FTS5：https://sqlite.org/fts5.html
- MiniSearch：https://github.com/lucaong/minisearch
- Orama：https://github.com/oramasearch/orama （實際固定 3.1.18，enum[] containsAll 已由契約測試驗證）
- Elasticsearch snapshot：https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore
- Meilisearch filters：https://www.meilisearch.com/docs/capabilities/filtering_sorting_faceting/advanced/filter_expression_syntax
- Typesense search：https://typesense.org/docs/27.1/api/search.html
- Pagefind Node indexing：https://pagefind.app/docs/node-api/
