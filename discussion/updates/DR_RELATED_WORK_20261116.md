> 研究更新補充：以下記錄保留撰寫時狀態；本次公開同步不代表新增實驗或正式採用。原凍結實驗包另見 ../../research/。

# Related work：先借用證據，再決定補驗

2026-11-16。使用者要求在新實驗前探索既有工作。本輪查閱一手論文、作者 benchmark／程式及官方文件；只有資料查核與靜態閱讀，沒有下載大型語料、執行外部程式或新增壓測。這是有界探索，非系統性文獻回顧；未經本輪獨立 reviewer，未加入已凍結的公開研究包。

## 對選型的影響

- 優先盤點 A（完整既有服務沿用）的增站維運差額仍合理。不必自行重證一般性的「專用搜尋引擎可能比 SQLite FTS5 快」。
- 「SQLite 到百萬頁必定不適用」過強。詞頻、查詢長度、排序、篩選、總數及併發都會影響成本，筆數不能單獨決定。
- 本輪來源不足以給出我們在「搜尋 P95≤2秒、Web閱讀不受損、含權限及更新」下的容量比，也不能估 DevOps 工時。這不代表必須立刻測完；先看未知是否仍會翻轉 A／C 選擇。
- B（Next＋ES研究配置）不是 A；Lucene 的成績不是整套 ES API 的結果。

## R1：GovScape——貼近文件規模，但不能移植倍率

[論文 arXiv v2，2026-05-13](https://arxiv.org/html/2511.11010v2) 的系統服務約7,096萬 PDF 頁，但 §5.2 比較只用 **50萬頁**與10,000次真實 log 關鍵字查詢。表3：Lucene 418 QPS、SQLite FTS5 11 QPS；索引2,806／14,122 MB。系統總量不是 benchmark 規模。

[作者 benchmark](https://github.com/govscape/govscape/blob/main/benchmarks/keyword_index_gov_benchmark.py) 目前逐筆查詢，QPS=次數／累計操作時間，沒有持續到達、應用排隊、拒絕及 Web 混載的測量；不能當 API P95／承載量。

[目前索引實作](https://github.com/govscape/govscape/blob/main/govscape/indexing/keyword.py) 中 SQLite 用 `ORDER BY rank LIMIT ?`，但 `SELECT *` 也取回全文；Lucene 不儲存全文，只取識別資訊。分析器／parser 不同，每題命中集合等價尚未確認。因此大小／速度差不能全歸因引擎。**目前程式未與論文版本 commit 對應**，這是重現性限制，不是已完成論文數值的因果分解。

可沿用：專用引擎在大型 PDF 搜尋有實務優勢的方向性證據。不可沿用：我們 ES 快38倍、所需CPU／RAM、公司SLO或每站成本。

## R2：scrydb——避免用文件數判決 SQLite

[SQLite is Enough，arXiv v1，2026-08-25](https://arxiv.org/html/2608.24060v1) 是預印本，使用八個 BEIR 語料，**沒有 ES 對照**。523K文件 Quora 的 BM25 平均約228.7ms；8.67K文件 ArguAna 約566.8ms，後者查詢較長。支持查詢形態重要，不是我們延遲的預測模型。

[protocol](https://github.com/breuert/scrydb-eval/blob/main/docs/EVALUATION.md) 與 [結果](https://github.com/breuert/scrydb-eval/blob/main/docs/RESULTS.md)：M2 Air／24GB，CPU retrieval；效率每語料抽50題，各方法每題warm-up一次再20次，Top10。品質評估則使用較深結果，不能把兩者視為完全同配置。報告平均、標準差、平均值信賴區間，**不是服務P95**，未含Next／ReBAC／Space／Tags／更新。

作者公開 qrels、retrieval runs、raw timings。可借用評量方法或先重分析現成結果，不必重建全部索引；但公開 relevance judgments 不代表公司中英文使用者偏好，也不證明我們 P95≤2秒。

## R3：sqlitesearch——讀 SQL 比照抄跑分有價值

[作者 writeup](https://github.com/alexeygrigorev/sqlitesearch/blob/main/benchmark/WRITEUP.md) 分享 Wikipedia FTS5 優化。查閱[目前 benchmark](https://github.com/alexeygrigorev/sqlitesearch/blob/main/benchmark/run_full_benchmark.py)：抽10個文章標題逐筆查詢，以平均毫秒倒數標示 QPS，並非 consumer 負載測試；沒有 ES 對照。

優化同時改 stop words、cache、批次建置、先TopK後join，不能把 headline 倍率當單一等價SQL優化。[目前 FTS 實作](https://github.com/alexeygrigorev/sqlitesearch/blob/main/sqlitesearch/text/fts.py) 明確區分：有filters先join／filter再limit；無filters才先TopK後join。其預設OR／英文處理也不等於我們AND／中文斷詞。當前程式與歷史成績未完成commit對應。

可沿用：查核自身查詢工作與語義邊界。不可沿用：作者QPS就是我們API容量，或可把Tags／授權放到LIMIT後任意截斷。

## R4：官方機制知識，不必全部自行實驗

- [SQLite FTS5 §5.2](https://www.sqlite.org/fts5.html#sorting_by_auxiliary_function_results)：`ORDER BY rank` 和 `ORDER BY bm25(...)` 可能有不同效能，尤其有LIMIT；不保證我們join／Tags／第二排序鍵也獲益。
- [ES search API](https://www.elastic.co/docs/solutions/search/the-search-api)：精確 `track_total_hits: true` 有成本，會停用 Max WAND 最佳化。SQLite精確count與ES不計／不精確total不可當等價工作。

## 降低權重或排除直接比較的來源

- [ESOTERIC作者報告](https://theobaur.co.uk/static/pdf/ESOTERIC-report.pdf)：545萬Wikipedia entries、有FTS5／ES直接比較，但量測多階段document retrieval，品質也不同；學生專題報告，尚未核實重現配置。只能輔助方向，不能將整段平均時間當keyword API P95。
- [Comparing Data Store Performance for Full-Text Search（2023）](https://users.uop.gr/~trifon/papers/pdf/data23-FKRT.pdf)：PostgreSQL／MongoDB／ES／Solr，**不含SQLite**。
- [sqlite-tantivy](https://github.com/russellromney/sqlite-tantivy/blob/main/BENCHMARK_RESULTS.md)：不是ES；兩邊文件數不同，短時間多執行緒固定查詢。不移植倍率為本案容量。

## 對照本案：不跑也已釐清的差異

讀取 `scripts/c-million-20261116/worker.mjs:20–32`：中文切詞後AND；合成身份／Space／Tags AND篩選；先精確`count(*)`，再按`bm25(search_index,3.0,1.0),p.pageId`取Top10，最後取tags。這是現行合成實作契約，**不是consumer已確認的正式義務**；身份分支也不是正式ReBAC串接。

因此外部單純TopK不能直接套用。精確total／穩定次排序是否必要仍未知；改動須另列合約變體，不能悄悄放寬。權限及Tags正確性不能為套快路徑而犧牲。

## 下一步與停止條件

1. 先盤點A可沿用的部署、備份、版本、告警、API／授權、runbook，對照C新增責任。既有K3／K4／K5加外部研究已足以支持一般風險；不新增引擎或重跑論文。未知工時不填零。
2. 有需要才重分析既有trace／公開runs。未分析就不宣稱新P95；短窗資料重算也不會變穩態容量證明。公開品質資料先借方法，不當公司體感驗收。
3. 只有未解問題會翻轉選型才做一張小實驗卡。例如C有明確增站節省，且必要契約已足夠確定，才測共同工作點能否守住Web；固定命中／篩選／total／回傳欄位與總服務資源，分開引擎時間及端到端排隊。不一次展開所有引擎／資源矩陣。
4. 若C客製adapter、同步切版、隔離及維護成本抵銷節省，就停止替代引擎探索，回到A落地驗收；無需證明SQLite永遠不行。低流量Web fallback可保留C為條件備案，不能外推未約定consumer負載。

這是研究優先序，不是A最便宜／正式可用的證明。本輪未commit／push；完整研究包發布工作仍未完成，未修改其凍結內容。

## 程式讀取識別

2026-11-16讀default branch。以下是blob SHA，**不是commit SHA**；與論文版本對應仍未知。只保留有限摘要與來源，未鏡像完整外部內容。

| 檔案（repo／path） | Blob SHA |
|---|---|
| govscape/govscape ／ benchmarks/keyword_index_gov_benchmark.py | `4ad00439f766da02e3ca739c3e56e717c6f09673` |
| govscape/govscape ／ govscape/indexing/keyword.py | `ac0732f732a9e0aa2bce5289d59c9caa96821c61` |
| alexeygrigorev/sqlitesearch ／ benchmark/run_full_benchmark.py | `31781ff14ed70731aacbb9c6f4d4464f45e71bc6` |
| alexeygrigorev/sqlitesearch ／ sqlitesearch/text/fts.py | `e923ab8e7528d896563a62a92fb61b8e3d456568` |
