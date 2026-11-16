# S1 SQLite Space 過濾／排名解耦：獨立審查

2026-11-14。裁定：**新查詢策略通過10k／100k／1M的凍結S1控制工作集；百萬混合P95約2.44秒，未達暫定2秒參考線。** 原先的百萬all/commonterm逾時反例在這版工作集中不再出現，但小Space查詢有明顯代價，不能稱全面加速或正式DR已夠好用。前輪失敗保持原判；本輪無調worker、加時、改共同harness或失敗後搜尋重播。

## 同一工作集的結果

直接執行原 `scripts/s1-capacity-review/http-review.mjs`，僅換loopback位址、N與output；API欄位、權限、total下限、highlight、正文hash、分頁及拒絕語意未改。每scale20循序任務25HTTP＋4個closed-loop client×20操作（64搜尋/16正文），共105HTTP。

| 頁數 | 新策略結果 | 新策略mixed P95／窗口 | 前版SQLite P95 | ES參照P95 |
|---:|---|---|---|---|
| 10,000 | 20/20，105HTTP，零失敗 | 23.75ms／0.259秒 | 288.55ms | 44.59ms |
| 100,000 | 20/20，105HTTP，零失敗 | 244.02ms／2.531秒 | 1434.02ms | 36.52ms |
| 1,000,000 | 20/20，105HTTP，零失敗 | 2435.90ms／23.735秒 | 未執行mixed；第三循序失敗 | 111.08ms |

三scale合315HTTP，不是60種不同能力。百萬全HTTP窗口34.279秒、最慢請求2499.01ms；全部滿足凍結的完整response≤5秒與正確性／零失敗條件。既有provider排隊＋執行4秒期限也未觸發。2秒P95在原標準是暫定研究參考而非本輪硬門檻，所以不能改標準判失敗，也不能隱去其未達。此短暖來源工作集不是30分鐘RP0、持續到達率、正式SLO或普遍引擎排名。

## 改善及代價並存

百萬循序commonterm單樣本：

| 可見範圍 | 前版SQLite HTTP任務時間 | 新策略HTTP任務時間 |
|---|---:|---:|
| small：一個小Space | 約210.28ms | 約2188.26ms |
| huge：一個含50萬頁Space | 約356.45ms | 約690.92ms |
| all：完整1000Space | 約4008.67ms，503 SEARCH_TIMEOUT | 約1196.13ms，成功 |

第一個small請求含lazy child啟動；來源/caches與背景活動不是完全同步A/B，因此上述是具體觀察，不是每種情境的普遍倍率。100k也見同方向：small約133.85→365.22ms、huge51.42→136.59ms、all1294.47→142.56ms。不能只展示整體mixed改善而省略窄範圍退化。

新版本增加分段trace。百萬首三worker內部觀察：

| 請求 | count | rank | 取正文 | highlight | worker總時間 |
|---|---:|---:|---:|---:|---:|
| small/commonterm | 1645.17ms | 405.53ms | 0.28ms | 8.52ms | 2060.63ms |
| huge/commonterm | 0.73ms | 677.97ms | 0.38ms | 1.68ms | 681.33ms |
| all/commonterm | 1.00ms | 1183.20ms | 0.17ms | 1.53ms | 1186.84ms |

對這些樣本，不能把耗時主要歸為highlight；small的count是顯著成本，all的rank仍是主要成本。EXPLAIN顯示FTS scan→pages rowid lookup→TEMP B-TREE，沒有選擇pages_space index。count cap1001在授權命中不足1001時仍需完成篩選，並非任何scope都變成固定成本。

本輪同時將Space從MATCH移出並改為JOIN後的參數化predicate；官方BM25逐phrase程式與前後結果支持scope/rank耦合是值得處理的問題，但前版沒有相同分段計時，因此未能把改善精確歸因為phrase迴圈的某個比例。新trace的計時／JSON輸出也有成本，量測包含此實作責任。詳implementation/phase-summary.json與原始stdout；每scale79個成功search timing，K=1分組含small/huge，不能把整組直接當small，本文僅用已知循序job1/2區分。

## 權限沒有改成事後過濾

新共享queries.mjs的count與rank使用同一predicate：FTS文字MATCH加pages rowid JOIN，並以bound參數完整限制 `p.spaceId IN (...)`；位於LIMIT/OFFSET前，all依然有1000個Space bind，不省略權限。排名記錄只帶rowid/score，再取正文，沒有把正文帶入排序。rowid/pageId順序等價引用前輪全row核對及本輪全檔SHA相同證據。

容量之前的**9項獨立SQL補充反例全部通過**，直接import實作query module、使用獨立記憶體小型DB：未授權前列不能消耗第一頁名額、第二頁完整不重複、count只計授權資料、1000項allowset仍排除未列Space、SQL語法字串作bound資料、缺Space零筆、count1001上限、空scope不可在SQL module意外代表all。這不是9個新增HTTP任務，ES未跑同補充；正式身份來源仍是mock。

API core與highlight模組hash與前輪完全相同；pool變更限候選路徑與timing trace，固定2child、每child16MiB cache、pending8、4秒期限及回收策略不變。共同harness、oracle、兩份標準、本輪SQL module及manifest等9份凍結輸入checksum維持。source-provenance.json保存對前輪canonical／rowid audit的引用與hash，本輪root23個全檔checksum一致提供來源未改證據；沒有重建舊資料庫或索引。

## 成本與採用邊界

候選HTTP窗口採樣RSS峰10k174.15MiB、100k186.48MiB、1M185.28MiB；整輪含Next build峰569.93MiB。背景ES分列、不當SQLite依賴，但共享CPU/cache仍可能影響結果。RSS可能重算共享頁且未含全部filesystem cache，不可作最低Pod或總記憶體需求。6GiB候選RSS／新artifact護欄未觸發。

新artifact約63.7MB主要為此隔離實驗產物，**不含既有百萬約2.133GB正文＋FTS檔**。本輪重用現成索引，readonly preflight不是build；不能把它和ES新bulk索引186秒比較。Next build約12.481秒且watchdog正確180秒；1M preflight command曾多了一個PATH argument，Popen未啟動即失敗，修正command後第一次實際prepare成功；原始問題保存，非搜尋重播／候選程式修改。

provider仍需承擔child池、排隊／deadline／回收、原文highlight映射、查詢策略與版本相容性。本輪沒有觸發新timeout，不新增故障恢復通過宣稱；前輪一次TERM/正文可讀證據保持其原範圍。固定版本可丟棄cache、MinIO傳輸／完整性／切換／故障與正式GM尚未驗證。本機SQLite檔可查，不代表能直接對MinIO遠端隨機查詢，也不代表零本地儲存。

## 下一個決定

這版使SQLite跨過**目前S1百萬控制工作集**的硬門檻，可以進下一個整體方案未知，而非一直只調SQL。優先有界驗證真MinIO的版本產物取得、可丟棄本地cache、完整性檢查、程序替換與未完整更新保留舊版；記錄時間、bytes與操作責任，才能評估少一個持久化搜尋服務的總價值。

同時保留小Space計數代價與百萬mixed P95超過暫定2秒的缺口。若核心consumer/PM認定2秒是必要服務承諾，需另立不放寬權限的調整卡；未確認前不能聲稱延遲已被接受。正式Lexical長尾、真正使用任務／query品質、持續負載、GM／撤權、consumer接入成本、非作者維運與完整DR RTO/RPO仍未知。原MS1及前版SQLite百萬失敗不改判。
