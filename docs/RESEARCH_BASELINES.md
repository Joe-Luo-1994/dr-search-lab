# 公開參考基準與對口價值門檻

研究日期：2026-11-10（Asia/Taipei）。本輪為公開資料研究，未執行新故障實驗、安裝 MinIO、變更服務或發布。既有未提交工作保留。

## 目前限制：先固定證據邊界

| ID | 已知／未知 | 對決策的限制 | 下一個解除方式 |
|---|---|---|---|
| L01 | 無正式 API、代表性 consumer、正式 analyzer/query 與欄位來源 | 合成相容不能代表正式 F02/F03；不能承諾移除原 Backend/DB | 合成 HTTP 契約先揭露負擔；正式案例到齊再重播 |
| L02 | Linux 實測 36 tests、17 整合、128 搜尋比對、417 閱讀、425 下載；皆 synthetic | 證明特定 reader 的資料契約，非 Next.js 正式路由、真實 MinIO 或使用者驗收 | 接續限定範圍整合；保留原報告 |
| L03 | 尚無 active pointer／跨服務原子發布實測 | 檔案各自正確不代表同版或可回退 | M01 前先釐清發布邊界與來源一致性 |
| L04 | 舊 V1 的 p09 歸屬仍可讓 ops 使用者取得內容；即時 Space role 無法補齊 | 一致版本仍可能違反撤權／移動時效 | 產品與授權對口裁定；owner 待指定 |
| L05 | 一小時恢復、每日同步是討論假設；雲端只觀察有限時間程序存活 | 無正式 RTO/RPO、獨立區域、長時間故障與切回證據 | 定義端到端流程與時計，再演練 |
| L06 | 資料量小、附件 synthetic；目前 reader 全量驗證且整物件載入記憶體 | 不推論容量、串流、Range、啟動時間或大型附件成本 | 真實分布與門檻到齊後量測 |
| L07 | 未有完整棧工時、事故負擔與 consumer 維護基準 | 服務少不等於整體負擔小 | 記錄人工步驟、頻率、等待、支援、升級及回歸成本 |
| L08 | 四種 audience 痛點與門檻是研究假設，未由具名代表接受 | 不能自己定義需求再用自寫測試宣布足夠 | 每輪標示假設／已確認，要求對應接受者 |
| L09 | 雲端 viewer 未驗收；暫採雲端研究、本機 Demo | localhost 不是使用者入口 | 本輪不探索 viewer、tunnel、hosting |
| L10 | 來源 DB、ES、正文與媒體如何取得同一邏輯版本未知 | 下游 hash 全對仍可能發布一份來源已混版的包 | 研究 producer 邊界、匯出 watermark／封存與關聯驗證 |
| L11 | 公開文件中的版本、API、拓樸不同於本實驗 | 參考模式不構成本環境保證；S3 行為不直接等同 MinIO | 固定產品版本與 API，做最小能力驗證 |

## 找到的先例與可借用範圍

來源完整 URL 與閱讀層級見文末及 evidence/public-research-2026-11-10/sources.json。以下「應用」是本研究推論，不是來源替我們作出的架構結論。

| 來源 | 公開資料的要點 | 對我們的應用／成本／限制 |
|---|---|---|
| S01 Netflix Hollow：Producer/Consumer | producer 在公告前驗證；失敗回到前一狀態；支援 consumer 狀態與恢復 | 最接近版本資料發布先例。借用「準備／驗證／公告」分離；不是採用 Java Hollow 的決策，也未涵蓋 ES＋附件交易。cold consumer 取得完整狀態的條件需獨立測。 |
| S02 Apache Iceberg 1.7.1 Reliability | snapshot 明列資料檔案，以原子 metadata 更新提交，reader 使用一致快照 | 借用 manifest＋單一提交點；原子 pointer 是必要前提，不能靠命名慣例保證。引入 catalog 有維運成本；無需先導入整個 Iceberg。 |
| S03 AWS rollback safety | 新舊版各自正常不保證升降版過程正常；需驗證相容性 | 發布／回退需涵蓋 reader 程式、manifest schema 與資料版本。僅切回 active pointer 不足以證明舊 reader 能服務。 |
| S04 S3 conditional writes | If-None-Match 防止覆寫；If-Match 比對現有 ETag 才更新 | 是 pointer 衝突控制參考。ETag 用作條件 token，不取代內容 SHA256；不提供跨 key／ES 的交易。 |
| S05 MinIO conditional-write 官方文章 | 描述 If-Match／If-None-Match 的樂觀並行控制 | 提供可實測方向；文章非所選 binary 的相容保證，須固定 server/SDK 版本與錯誤語意。 |
| S06 MinIO replication 官方文章 | 複寫可能仍有 stale／missing objects，提供狀態觀察方式 | 「複寫已開啟」不足以成為 release ready；需按 manifest 在目的端核對完整性，且不能倚賴故障來源讀回。 |
| S07 Elastic snapshot 官方文件 | shard 資料取自 snapshot 起迄區間，不是 cluster 的精確單一時間點 | 必須定義來源版本與封存流程。現有 sealed indices 的測試不能代表持續寫入的正式多服務來源。 |
| S08 Google Zanzibar 論文摘要 | 授權決策處理 ACL 與內容改變的因果順序 | 支持將資料版本與授權新鮮度分開；p09 是相關一致性問題，不宣稱完全等同 new-enemy 案例。尚未精讀完整協定，也不建議移植整套系統。 |

來源交叉核對：S05 文章仍稱 AWS 只支援 If-None-Match，與 S04 現行官方文件列出的 If-Match 不符；不採用其競品比較。其 ETag/MD5 簡化也不作為我們的內容完整性依據。這顯示官方 blog 仍可能落後，具體能力以所選版本 API 與測試為準。

第一輪未找到與本案「ES＋正文／附件＋既有 consumer＋公司 ReBAC」完全同構且公開完整成本的案例。已找到可組成設計基準的成熟模式，但其正確性前提與維護責任仍需逐項確認。

## 各對口的非線性價值門檻

借用 QAW 的品質情境（S09）先問對口，再用 SLO/重要使用流程（S10）定義可觀察結果；以 toil（S11）檢查成本轉移，以 consumer contract（S12）確認真正使用需求。Kano（S13）提醒基本期待未滿足時，額外優化未必產生採用價值。這不是加權總分，更不是宣稱所有需求皆為硬門檻。

| 對口 | 候選門檻，尚待本人確認 | 現有證據 | 阻礙採用的缺口 |
|---|---|---|---|
| Reviewer | 能以同一服務承諾比較方案，有必要責任、風險接受者與退出條件 | 可行性與反例有紀錄 | 完整棧成本／正式依賴／具名接受者 |
| DevOps | 非原作者能依文件辨識失敗、保留完整舊版並安全恢復 | 雲端正常啟動與防護通過 | 發布、回退、監控、清理與交接演練 |
| Consumer | 代表性 client 可完成流程，新增分支／重試／版本管理負擔被接受 | 合成 Node reader 契約通過 | HTTP、身份、分頁／下載、正式 client、相容矩陣 |
| User | 事故期間可完成指定任務，資料年齡及權限時效符合接受條件 | 合成搜尋→讀取→下載 | 真實任務、資料時效政策、錯誤說明與實際驗收 |

每輪紀錄：對口 → 情境 → 門檻及來源 → 現有證據 → 反例／缺口 → 下一驗證 → A/B 決策影響 → owner／接受者。狀態沿用 VERIFICATION_PLAN.md。未知不可算通過；需求改動須重開受影響證據。功能重要性由對口裁定，安全／完整性底線不以速度加分抵銷。

## 調整下一步：先研究四個問題，再擴大實驗

1. **完整版本從哪裡開始成立？** 先畫 producer 到封存 index／manifest 的資料邊界。hash 能證明傳輸完整，無法證明來源業務關聯原本一致。沒有正式匯出來源時，只能在 synthetic immutable release 範圍實驗。
2. **誰負責 commit？** 比較單寫者＋條件 pointer、外部 catalog、API 節點完整下載後切本地版本。各自計入衝突處理、跨節點狀態、容量與恢復責任，尚不選定。
3. **誰負責 reader 版本與回退？** 將 API schema、release schema、ES index、媒體版本和在途 client/cursor 列入相容矩陣；測舊 reader、新 reader、cold start，而非只測 uploader。
4. **誰決定舊版仍能交付？** 記錄資料 age、撤權／歸屬規則和可降級選項。即使 M01 通過，也不能越過 L04 的需求裁定。

研究停止條件：每個關鍵主張至少找到一個可信一手來源並記錄不可移植前提，或明確記為未找到；遇到正式需求缺失轉成待裁定，不無限找案例填補。新實驗必須指出哪一對口會跨過哪個候選門檻；只增加測試數量而不改變決策者暫緩。

## 公開來源（2026-11-10 查閱）

- S01 https://hollow.how/producer-consumer-apis/
- S02 https://iceberg.apache.org/docs/1.7.1/reliability/
- S03 https://aws.amazon.com/builders-library/ensuring-rollback-safety-during-deployments/ （轉址 AWS Builder Center）
- S04 https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html
- S05 https://www.min.io/blog/leading-the-way-minios-conditional-write-feature-for-modern-data-workloads
- S06 https://www.min.io/blog/how-do-i-know-replication-is-up-to-date
- S07 https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore
- S08 https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/
- S09 https://www.sei.cmu.edu/library/quality-attribute-workshop-collection/
- S10 https://sre.google/workbook/implementing-slos/
- S11 https://sre.google/workbook/eliminating-toil/
- S12 https://docs.pact.io/getting_started/how_pact_works
- S13 https://www.ifm.eng.cam.ac.uk/research/dmg/tools-and-techniques/kano-model/
- S14 https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_planning_for_recovery_dr_tested.html （用 runbook 做 DR 演練的參考）
