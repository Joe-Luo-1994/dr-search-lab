# Round 1 獨立審查

審核組；2026-11-14；對照凍結standard-v1（18必要任務／候選），實作source/provenance由另一agent交付。這是獨立於實作的agent驗證，不是正式consumer／資安／維運owner簽核。

## 裁定

**SQLite 18/18、Pagefind 18/18：兩候選皆通過C1 B級限定合成範圍。** 獨立fetch client經真Next16.4.5 production HTTP完成52 requests；standard／fixture／harness checksum均與freeze一致。H01 highlight均為not-provided，null/none是事前允許的基本級，不是正式consumer已接受的降級。

因此可多承諾：相同合成HTTP契約可由兩候選提供；18任務包括中文短詞、代碼、stable分頁、原文URL、正文／附件bytes與mock身份錯誤，無需client引擎SDK。仍不能承諾公司client相容、正式授權、MinIO、RP0量級／SLA、完整DR可用性或長期總成本。

直接證據：`evidence/two-rounds-2026-11-14/reviewer/round-1/result.json`（每任務及每request結果）；`round-1.log`；實作組round-1-provenance/source/build/start。正式資料可補備份假設不構成本輪阻塞。

## 成本與反例（不追溯改B級判準）

1. **不必要依賴耦合有實際反證。** `core.mjs state()`同時讀fixture、開SQLite、import Pagefind，正文／附件也使用它。reviewer新隔離副本只保留fixture+SQLite、故意不提供Pagefind檔案，SQLite搜尋、p01正文及a05附件全部503；Pagefind503亦明確。原封存產物未改。證據 `round-1-missing-pagefind.json` 及 `round-1-isolation-start.log`。
2. **分頁hydrate成本可觀察。** 新程序ops查runbook/pageSize2，返回2筆／total5，實際讀5個`.pf_fragment`（1,043 bytes）；所有Pagefind資產10 GET、57,935 bytes。由reviewer asset server觀測，非adapter自報。證據 `round-1-assets.json` 及 `round-1-assets-start.log`。
3. **為何不能盲目先slice？** Pagefind `r.results`已排序並套scope filter，全hydrate不是排名所需；但現實作取得page ID後再以fixture.scope查核，total是查核後筆數。若只slice後filter，可能誤報total、分頁遺漏。要移除成本，必須保存等價一致性邊界，例如build-time ID/scope映射；未知／異scope映射明確失敗，而不是省略。
4. **其他已揭露成本**：共享Intl.Segmenter及ICU依賴、SQLite同步查詢、全fixture常駐、generated module版本耦合、私有asset server及發布工作。缺正式工時／資源與接手資料，不以少一個stateful服務推論總成本已較低。

## Round 2 指定範圍

- 優先修正正文／附件與候選engine共同初始化，保持原有閱讀下載不因另一搜尋engine缺檔而一起失效。
- 減少Pagefind query-time全fragment hydration，保持原B級scope、exact total、分頁、內容及URL。可採伴隨映射，但把額外build／artifact／memory／一致性責任列為trade-off。
- 不要求本輪增加highlight，避免以加分取代主要成本缺口；不刻意製造功能失敗作迭代。
- 同standard-v1完整重播；額外按事前固定 `supplement-cost-v1.md` S01冷GET／S02缺Pagefind／若採映射則S03壞映射驗證。補充失敗與B裁定分開，不換oracle。

下一步：允許進入第二輪有界修正與重驗。兩輪完成後回報限定成果及仍未知，不追加第三輪追求全面通過。
