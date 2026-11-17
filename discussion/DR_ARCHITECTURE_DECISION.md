# DR 搜尋架構：是否值得進行有限 Tantivy 試點？

2026-11-17｜10–15 分鐘閱讀｜**決策提案，不是正式採用核准**

[證據與未知矩陣](DR_EVIDENCE_MATRIX.md) · [30 分鐘決策指南](DR_TEAM_DECISION_GUIDE.md)

## 1. 先決定災難時人還能完成什麼

當台灣 fz1、fz2 都不可用，同仁仍要找到需要的文件、讀取正文、下載附件；下游 consumer 也需要搜尋入口。我們要找的是**滿足這些任務、長期增量維運最少**的方案，而不是搜尋最高 RPS。

| 使用者需要 | 已知與工作假設 | 本次需要團隊決定 |
|---|---|---|
| 找到文件 | 唯讀；中英文 title/body 關鍵字、Space、Tags 全部符合；PDF 抽取文字可供建索引 | 代表性必找案例；是否必須沿用 ES 的排序、精確總數與 API 行為 |
| 讀取／下載可靠內容 | 既有 pageId 閱讀流程；media 須經可信 page→space／media 關係授權 | 完整資料範圍、大檔需求；不能讓搜尋結果大量指向沒有備份的正文 |
| 不看到未授權資料 | 假設共用 ReBAC 有獨立備援；目前只支援 Space Role | 撤權、搬頁與舊快照的安全政策；快照延遲不自動代表可接受越權 |
| 在可接受時間恢復 | 異地獨立 hostname／手動切換可先作討論假設；一小時是恢復目標討論值 | 實際 RTO、公告與切換 owner；不是只需支援一小時 |
| 資料夠新且更新可用 | 每日同步是初始假設；DR 可能長時間運作 | RPO、更新期間體驗與 409 復原方式；停機尚未獲產品核准 |

搜尋 highlight 是加分項，尚非必要門檻。真實 consumer 流量、契約、正式資料及相關性標準仍未知；不能用研究的 2 秒門檻代替正式 SLO。

## 2. 具體候選：中央建置，每個 Pod 固定一版

```mermaid
flowchart TD
  S[既有來源與備份匯出<br/>MariaDB正文與PDF抽文／metadata／media] --> B[中央 builder：建索引與版本關聯<br/>應用團隊擁有 schema、相容與品質]
  B --> M[異地 MinIO：不可變產物、正文、附件<br/>平台擁有複寫、耐久、容量與憑證]
  B --> G[發布驗證：manifest 綁定完整產物<br/>完整 pre-deploy gate 尚待驗證]
  G --> P[經核准的 manifest pin<br/>簽章與信任政策待定]
  P --> K[平台 RollingUpdate 候選<br/>雙Pod容量／readiness／路由仍待驗]
  M --> I[每個新 Pod init：下載與驗證本地檔]
  K --> I
  I --> N[固定 release Pod<br/>Next.js＋2 Tantivy搜尋＋2 SQLite metadata workers]
  U[Web／API consumer<br/>既有入口與API治理待接合] --> N
  N --> R[共用 ReBAC<br/>Space授權；正式整合待驗]
  N -->|可信 page/media 關係與授權後讀取| M
  N --> O[授權後搜尋結果／正文／下載]
```

**官方／既有能力：** Tantivy 搜尋核心、SQLite 讀取、Kubernetes Pod／probe／rollout、MinIO 物件服務。**我們仍要擁有：** 匯出一致性、builder/schema、Node–Rust IPC 與 pool、授權接合、版本契約、發布驗證與復原 runbook。平台有這些能力，不代表公司已提供好全部設定與責任。

**關鍵區分：R0 實驗用 Recreate，是本機 WSL 無法安全承受新舊 Pod 共存的限制。目標候選是 RollingUpdate，尚未驗證。** 固定版本 Pod 可免去應用內熱切索引，但不免除雙版空間、流量切換及跨請求版本協調；RollingUpdate 本身也不保證使用者無中斷。

## 3. 證據能回答多少？

| 研究 | 實際證明 | 不能延伸為 |
|---|---|---|
| [N1：引擎與預載整合](DR_EVIDENCE_MATRIX.md#來源索引) | 百萬合成索引、21 題；Tantivy 12,900 次正式 HTTP 任務成功。SQLite 當前 E 配置 Web 暖機超時，未進正式窗 | SQLite 普遍上限；Tantivy 最低維運成本；正式搜尋品質；完整發布成功 |
| [R0：Recreate 發布／復原](DR_EVIDENCE_MATRIX.md#來源索引) | 1,377 次＝839 成功＋507 停機失敗＋31 版本409；無漏發／錯內容。冷啟 ready 23.40秒；更新 ready 23.77秒 | RollingUpdate、無停機、完整災難 RTO；507 失敗不能改算成功 |
| [C1：部署後容量](https://github.com/Joe-Luo-1994/dr-search-lab/issues/1#issuecomment-6940031342) | 本機原始證據尚未公開；14 完整窗、74,400 正式任務零錯漏。Web16＋read1，或 Web4＋API32＋read1＋download2，各三輪通過 | 最大容量、兩組相加、長期穩定、帶負載更新；900秒觀測因主機記憶體護欄中止 |

C1 的混載 Web 旅程 P95 21.45–22.75ms、API 14.40–14.58ms，app limit 4CPU/8GiB、MinIO 2CPU/2GiB。這是 **SSR→搜尋 HTTP 旅程**，不是原生引擎耗時，也不是完整瀏覽器體感。N1 的 MinIO 是 4CPU/4GiB，不能把 N1、R0、C1 拼成同一次整合通過。

語料高度重複，Tantivy index 約100MB，只有256個 V1正文及8個附件供遠端讀取。**百萬索引查詢不等於百萬正文已可用。** C1 reader container 約0.2GiB 的採樣數字不含全部 init／Pod 祖先成本；cluster 約6GiB、controller peak2GiB，記憶體歸因尚缺，不能據此縮 RAM。

## 4. A 與 C：究竟把維運工作放到哪裡？

| 每次變更／事故要負責的事 | A：重用既有 Next＋BE＋MariaDB＋ES＋MinIO | C：Next＋Tantivy＋SQLite metadata＋MinIO |
|---|---|---|
| 搜尋與 API 相容 | 有機會重用既有 analyzer、query、BE、gateway；實際重用量待 owner 確認 | 要維護替代查詢／品質、IPC、版本化 API、限流與錯誤契約；不能因 Next 是 BFF 就假定已完成 consumer 治理 |
| 異地資料與更新 | 多服務的備份／還原／升級／容量與相依性；現有 IaC 可能已處理很多 | 中央 immutable builder、manifest、下載驗證、版本保留／GC、滾動發布；每個 Pod 有本地產物與啟動成本 |
| 日常監控與事故 | 既有 DB／ES 工具與值班經驗可能直接重用；異地增加多少工作未知 | 少了異地 MariaDB／ES 常駐服務，但新增 Rust binary、pool 故障、build失敗、版本／內容缺漏診斷 |
| 共同責任 | MinIO、權限、資料延遲、DR 演練、入口切換與 on-call | 同樣需要，不能歸為 C 已消除的成本 |
| 目前可下的成本結論 | 仍是可行基準，未量測公司增量工時 | 尚未證明較省；部署種類少只是可能的優勢 |

SQLite FTS5 是已測 embedded 基線，不是被全域淘汰。N1 的 E 契約保留精確 total 與 pageId 同分排序；無 tie 的原生 Top-K 尚未測。現在沒有足以改變此 A/C 決策的 Pagefind 新證據，舊結果保留在研究入口，不新增引擎比較。

## 5. 建議與明確的改選條件

**建議：將 C 保留為有限試點候選，先由團隊確認下列條件；不核准正式上線，也不自動開始下一輪研究。**

- **選有限 C 試點：** 團隊接受 DR 搜尋契約可以有差異；找到 Rust／發布與 on-call owner；平台可提供候選 rollout 容量；權限與完整內容有可驗收規格；A 的重用不足以使 C 明顯不值得。
- **選 A：** 必須高度保持既有搜尋／API 行為，或既有 A 自動化增量工作很少，或沒有 C 的持續維護 owner。不能只因「ES 多一個 DB」排除它。
- **先補一項資訊：** 一個答案就可能反轉選擇，例如現有 A 的異地 runbook 已全自動、必要 consumer 需要的契約不相容；指定 owner 回答，不先跑更多 benchmark。
- **暫緩：** 沒有權限安全／內容覆蓋責任人，或 DR 最低服務與預算無法定義。

若試點獲准，必須有真實代表性查詢與內容、ReBAC撤權／舊快照政策、完整發布覆蓋、平台兩Pod與跨版本流程驗收。metadata 瘦身、更多引擎、最高 RPS 都是可延後最佳化，不是預設的試點前研究清單。

**本次請做三個決定：最低 DR 服務與可接受降級；A 的實際重用程度與 C 的責任人；選哪條路及停止條件。** 詳見[會議指南](DR_TEAM_DECISION_GUIDE.md)。

資料性質：觀測結果見矩陣；架構與試點方向是推論；公司成本與接受度是組織未知。歷史 R0 文件的「接受停機候選」保留原貌，本包更正其產品解讀，並未改寫凍結證據。
