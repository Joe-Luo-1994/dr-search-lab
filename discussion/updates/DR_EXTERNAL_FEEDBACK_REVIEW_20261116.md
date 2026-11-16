> 研究更新補充：以下記錄保留撰寫時狀態；本次公開同步不代表新增實驗或正式採用。原凍結實驗包另見 ../../research/。

# 外部 feedback 的採納與下一步

2026-11-16。來源為使用者貼上的「重新整理你的目標」feedback。本輪由主 agent 對照本機程式、既有結果與官方文件；不是獨立 reviewer 結論，沒有執行新實驗、安裝引擎或對外發布。

## 採納的方向

1. 研究單位應是能完成任務的唯讀搜尋方案，包含發布／復原／API／授權／維護，不是引擎跑分。
2. Runtime、Storage、Operations、Integration 四面向都值得保留。另分一次性／共用產製／每站增量，不能只數 deployment unit。
3. 將必要功能和可提議降級功能分開。提出具體契約讓團隊挑戰，不重新詢問開放式「需要什麼」，也不將未確認的降級視作已接受。
4. DR 可能有集中切換、冷 cache、consumer 重試尖峰。不能因事故罕見就推論瞬間流量低；列入容量契約待確認項，暫不新開尖峰實驗。
5. Tantivy 可作條件式候選；先查可維護性，再決定是否值得最小實作。

## 需校正的前提

| Feedback | 本機查核 | 對下一步的影響 |
|---|---|---|
| 目前只有約100篇合成 benchmark | 公開入口與本機證據有落差。K4／K5已有百萬合成頁，K5含Web／consumer／下載／更新 | 先補齊對方的證據視野，不重做百萬fixture；完整研究包發布仍未完成 |
| DatabaseSync 可能卡主thread，建議worker | 百萬runtime的pool已用child_process.fork，SQL在child；同配額資源競爭仍存在 | 不重做「加worker」；也不把process隔離當CPU資源保證 |
| ORDER BY -bm25()可能需修 | 舊lib把-bm25作score並DESC；百萬worker為bm25(3,1),pageId升序。不能只看負號判排序錯 | rank快路徑仍是未驗候選，但需保留權重、filters、tie-break與結果語義 |
| 先隔離count、rank、filter成本 | K4已有count／Top10／補tags拆分；前兩者都含MATCH/join/filter，沒有純operator分解 | 可承認未完全分離，但不重跑完整矩陣；缺口只有會改選型時才補 |
| 不可變索引是下一個新架構假設 | K5已有下載／校驗／V1→V2；O1有approved manifest／空快取啟動等小fixture驗證 | 這是既有C方向，不是重新起題。O1與K5不同build／規模，不能拼成完整正式驗收 |
| SQLite是最低成本baseline | 只證有可行配置，長期成本及對A淨節省未知 | A仍是完整可行比較基準，C為成本假說 |
| Pagefind風險主要是browser分權與consumer API | 風險合理，但我們也做server-side路徑；D2已有100k、單題5秒未返回的有限證據 | 不能只用browser限制解釋定位，也不能宣稱永久不可用 |

證據：[K4](../../research/docs/C_QUERY_COST_RESULT_20261116.md)、[K5](../../research/docs/C_SCALE_RESULT_20261116.md)、[O1](../../research/docs/C_RESTART_RESULT_20261116.md)、[Pagefind D2](../../research/docs/PAGEFIND_D2_RESULT_20261116.md)。程式：`scripts/c-million-20261116/pool.mjs:11`、`worker.mjs:30–31`、`fixture.mjs:103`、`lib/engines.mjs:89`。這些是本機受控合成結果，不是公司容量／正式契約。

## 架構上需分開的決策

**引擎、隔離方式、待命方式是三個軸。** SQLite／Tantivy／ES是引擎；Next內worker／獨立搜尋服務是隔離；預載常駐／災難後啟動恢復是待命策略。不要一次做完整組合矩陣，但也不能把ES與cold restore綁死、C與低成本綁死。

ES可使用snapshot移轉／恢復，restore需要運作中的相容cluster；這項機制本身不要求只能等到災難後才恢復。預先恢復會增加待命資源，換取減少事故當下復原工作；是否更划算須含演練與RTO。[官方snapshot](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore)、[restore前提](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/restore-snapshot)。普通restore與searchable snapshots是不同能力，本案不預設需要後者，也不先下授權成本結論。

「無狀態reader」應理解為沒有不可取代的本地資料，本地index/cache仍有容量、下載、校驗、格式相容與ready成本。獨立process在同資源池也不保證Web隔離。Contentless／external-content是容量候選，仍要核對本地metadata、摘要／highlight所需文字與正確性，不能當免費等價替換。[FTS5文件](https://www.sqlite.org/fts5.html#external_content_and_contentless_tables)。

內容／index版本一致與ReBAC即時判定是不同時間邊界；不能假設公司共用ReBAC會與daily內容一起凍結。保留已討論的page-space lineage漂移與page-media membership檢查責任。

## Tantivy：先做採用資格盤點，不先build

[官方文件](https://docs.rs/tantivy/latest/tantivy/)確認它是Rust搜尋library，具備segment、schema、tokenizer與TopDocs查詢能力；library不等於現成符合本案的搜尋服務，也不證比ES低維運。

進入實作前需能說明：

- 誰維護Rust reader或Node binding、binary建置／散布、依賴修補？是否有團隊能沿用的包裝？目前未知，不選定binding。
- title/body、中英文、Space／Tags AND、授權集合與TopK如何實現？不要求重現ES全部功能，但要有必要契約。
- reader／index格式升級、相容檢查、回滾、健康檢查及資源隔離如何承接既有artifact機制？
- 相較保留ES，預期省掉哪項持續工作，又增加哪些自製工作？無可信淨收益假說就先停，不以Rust跑分快當採用理由。

## 下一個最小成果

下一步先做一份「候選方案×必要契約×新增維護責任」決策對照，延用現有六工作包／operations ledger，不重建另一套成本框架。

暫擬共同基本契約：title／content關鍵字、Space、Tags AND、僅授權page metadata、pageId閱讀／下載、版本與資料age可辨。Exact total、深分頁、進階highlight／fuzzy是討論候選，非已批准移除；Web與consumer分開列接受狀態。

對照應含A完整沿用、C現有artifact reader及Tantivy條件候選；Pagefind保留既有證據與適用限制，不再新起完整研究分支。A的常駐／冷恢復可另列待命變體，不能用B替代A總成本。

排序調整為：**既有證據對齊 → 具體契約與維護差額 → Tantivy文件／生態資格盤點 → 只補會翻轉決策的實驗**。不採「先完成兩輪引擎實驗、最後才比較維運」。若A沿用收益已足以決策，可停止替代引擎探索；若C有明確收益而只卡rank／total，再做單一有限補驗，不由此自動啟動Tantivy。
