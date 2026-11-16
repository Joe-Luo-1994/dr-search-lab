# Round 2 獨立審查與兩輪結論

審核組；2026-11-14。同凍結standard-v1與補充supplement-cost-v1；實作組未改oracle，審核組未改實作。標準／fixture／B級harness三項hash再次驗證相符。獨立agent測試，不等於正式產品／consumer／DevOps接受。

## B級裁定：兩候選保留完整限定通過

Round2：SQLite18/18、Pagefind18/18，共52個獨立HTTP requests，皆經真Next16.4.5 production app。兩輪各自36項任務結果，不把它們相加宣稱72種不同能力。H01仍not-provided；highlight=null/none是事前允許B級，正式consumer是否接受仍未知。

V1/V2因此多了一項可重播證據：在同12頁合成資料、同HTTP契約與同client下，兩候選可完成必要中文／英文／代碼查詢、精確分頁、原文讀取、附件bytes及明示mock scope／錯誤處理。這不是正式consumer API相容、容量或全DR可用性。

## 補充改善：價值與代價一起呈現

| 補充項 | Round1基線 | Round2獨立觀察 | 裁定／範圍 |
|---|---|---|---|
| S01 冷runbook查詢返回2筆／總數5 | 5個fragment GET，1,043 bytes；所有資產10 GET／57,935 bytes | 0個fragment GET；所有資產5 GET／56,892 bytes；原回應及分頁仍成立 | 此fixture冷查詢移除5個fragment依賴；不是零IO、不是全系統成本下降或性能倍數 |
| S02 Pagefind artifacts不可用 | SQLite搜尋、正文、附件一同503 | 三者200且內容／bytes正確；Pagefind503 SEARCH_UNAVAILABLE、retryable=true | 分離內容與各engine lazy初始化，搜尋候選失敗不再無故拖垮這些基本操作 |
| S03 映射刪除一個runbook entry | R1無此artifact，不適用 | reviewer新副本刪p07 entry、不改manifest，Pagefind明確503 | hash驗證拒絕壞artifact，沒有靜默調整total／分頁；不是完整發布原子性證明 |

S01由reviewer-controlled資產HTTP server量實際path／status／bytes，使用fresh process；不是實作人回傳固定0。S02/S03僅改新隔離副本，封存release、根Lab與oracle未動。啟動／關閉log及變異input hashes保留。三個reviewer補充程序完成後已關閉。

### 新增成本不能省略

Round2將Pagefind opaque result ID→page ID／scope 映射搬到build期。此12頁例新增映射 **1,032 bytes／12 entries**；實作build log記錄建立映射額外 **12次fragment GET、約105.06ms**。這是單次小fixture觀察，不是正式建置容量或工時估算。

Runtime仍要讀取、hash核對及保留映射／fixture，對每個engine返回ID驗證scope／重複，再算total與分頁；不是把每個查詢工作降成O(pageSize)。SQLite仍取全部符合id後分頁，且DatabaseSync可能阻塞event loop。Pagefind仍會讀WASM／metadata／filter／index，只有fragment hydration從query移出。正式MinIO載入、映射與bundle一起發布／GC／rollback、長期版本相容仍需負責人與測試。

原版warm cache也可能避免後續fragment網路請求；因此本次只證明特定冷查詢的依賴與讀取變化。少量查詢是否值得新增伴隨映射，要看資料規模／發布頻率／冷啟動率／維護負擔，不能僅以0 fragment宣稱總成本一定較低。

## Code review 要點

- 依賴拆分：data()只載來源fixture；sqlite()、pagefind()分別lazy init，正文與附件不需要搜尋引擎。
- Pagefind排序／scope filter仍由engine提供；伴隨映射驗證全返回ID，不先slice再filter，因此保留exact total與分頁。
- 映射檢查bytes/hash、release／fixture hash、ID唯一與scope、完整數；壞映射或未知／異scope返回整體明確失敗。
- 此路徑仍信任合成build/publisher；未完成正式來源、ReBAC、MinIO版本切換、失效後重載與大規模併發。不同候選的失效隔離成立，不代表任意index／fixture錯誤皆有完整恢復能力。
- Highlight加分沒有實作，不能因B通過宣稱原ES語意完全相容。中文normalization有ICU依賴，12頁成功不足以消除所有中文語意差異。

## 共同產品標準的狀態

| 面向 | 兩輪後可說的話 |
|---|---|
| V1 必要任務、V2 consumer | 小型合成Next HTTP契約限定通過；真人／正式client仍未驗收 |
| V3 災難可用、V4效能容量 | 新增局部依賴隔離與冷資產讀取證據；完整故障域、RP0負載、公司RTO／SLA未驗證 |
| V5可信內容、V6權限、V7降級 | fixture/release/bytes、mock scope及錯誤契約有局部證據；真實發布／授權／使用者理解未驗收 |
| V8總負擔 | 新成本與可移除成本已具體化；正式維運工時、非作者runbook接手、各團隊接受仍未知 |

## 下一個決定

兩輪結束，不追加第三輪。建議下一筆投入選擇：以此共同B級API接真實MinIO載入／Web替換（C2），並拿基本級highlight降級清單與一個consumer owner確認。若consumer明確需要highlight，再開H級工作；不要先擴大工具數或追求ES score一致。

ES同資料量且包含server資源的對照仍缺，兩候選都只是可保留整合，不能宣稱已勝過ES或全DR已可採用。正式資料可補備份仍是前提，不重開不必要阻塞。

## 證據

- `evidence/two-rounds-2026-11-14/reviewer/round-2/result.json`、`round-2.log`。
- `round-2-assets.json`、`round-2-missing-pagefind.json`、`round-2-corrupt-map.json`。
- `round-2-supplement-inputs.json`、各`*-start.log`、`round-2-review-provenance.json`。
- 實作組`round-2-provenance.json`／`round-2-source/`／prepare、production build與啟動log。
