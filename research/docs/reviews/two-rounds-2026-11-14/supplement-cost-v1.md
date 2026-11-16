# Round 2 補充成本／依賴實驗 v1

先於Round2修改固定；不新增或改寫standard-v1的18張B級任務。Round1的B級通過不因這份補充撤銷。主價值V1/V2可靠操作、V8新增責任成本；不是完整DR故障域驗收。

## S01：分頁是否迫使hydrate所有命中？

輸入：同凍結12頁fixture、fresh process、ops查runbook/page1/pageSize2，5個總命中，回2筆。由reviewer控制loopback asset server記錄實際HTTP path/status/bytes，啟動實際production Next app。只暖GET /，不先暖索引搜尋。記錄*.pf_fragment請求數／bytes，metadata/index/filter/wasm另列。

基線：Round1實作r.results已由Pagefind排序且套scope filter，之後對全部結果h.data()以取得page ID、依JSON scope再查核，才算total及分頁。全hydrate不是排序必要，但目前也負責scope一致性查核；不可直接先slice再filter而誤報total或遺漏分頁。

改善目標：在不改B契約／oracle下，只載入當頁必要資料，或以build-time伴隨ID/scope映射取代query-time fragment hydration。記錄實際GET差異，不能用hardcoded 0推論。若採映射，列額外build工作、artifact bytes、runtime記憶體／讀取與版本綁定責任；任何未知或異scope映射不得靜默省略。實際IO減少只對此fixture冷process成立，不能宣稱公司網路或總成本比例。

## S02：Pagefind檔案缺失是否拖垮另一候選與原有讀取？

輸入：建立新的隔離副本，只保留相同fixture.json與search.sqlite，不提供pagefind目錄；不動封存Round1或既有Lab。啟動同production Next app，以ops依序要求SQLite backup、p01正文、a05附件、Pagefind backup。

改善目標：前三者200且內容／bytes正確；Pagefind為可辨識503 SEARCH_UNAVAILABLE/retryable=true，不回空成功。此為候選隔離實驗，不宣稱現實部署會同時保留兩個引擎。對產品的意義是：搜尋索引異常不應無故讓已有正文／下載失效。

## S03：映射錯誤不可被省略（僅在實作選擇伴隨映射時適用）

在新隔離副本的映射中刪除一個屬runbook的result ID項目，其餘來源不動；由implementation說明格式後reviewer獨立做變異。ops查runbook必須明確503，不能默默改total或分頁。若manifest完整性在載入時已拒絕，亦符合。只變異測試副本，固定fixture／標準／基線不變。此檢查是補充一致性防線，不擴寫為MinIO發布原子性或正式授權證明。

每請求timeout5秒，ready最多120秒。保留baseline與改版結果／錯誤、actual code與產物hash。審核只讀實作；改版交付後獨立重播B級並執行補充。新增改善不得把原B級通過弄壞；實驗失敗保留，不無限追加修正回合。
