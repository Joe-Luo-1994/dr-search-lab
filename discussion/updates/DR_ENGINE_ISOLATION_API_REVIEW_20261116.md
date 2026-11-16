> 研究更新補充：以下記錄保留撰寫時狀態；本次公開同步不代表新增實驗或正式採用。原凍結實驗包另見 ../../research/。

# 新增決策面向：搜尋效率、Web 資源隔離與 consumer API 責任

2026-11-16。使用者與朋友討論後提出三點，主 agent 核對既有結果與官方文件後記錄。這是研究方向補充，未新增壓測、未經獨立 reviewer 審查，不回寫舊實驗。尚未加入已凍結的公開研究包。

## 已知與假說

- SQLite FTS5 百萬頁必然不適用：未證。K4 顯示現行實作對高命中查詢代價高，稀有詞很快；資料量、詞頻、filters、精確 total、排名及併發必須分開。
- 同搜尋 SLO 下 ES 是否有更高容量／較低資源成本：值得驗證，尚無此輪 matched 對照。不能用 B 代替完整 A 的 TCO。
- worker 不等於 Web 資源隔離：成立。它可移走同步計算，但仍共享 CPU、記憶體與 I/O；容器 CPU limit 也可能節流。
- Next.js 不能做 consumer API：不成立。Route Handlers 可以承接 HTTP；但框架沒有替團隊決定服務契約、版本、身份／應用授權、流量公平性與故障隔離。
- 少 deployment unit 等於低維運成本：仍是假說。部署合併可減少元件，也可能增加聯動擴容、排隊保護、故障診斷與跨用途回歸成本。

## 可直接沿用的證據

| 實驗 | 觀察 | 邊界 |
|---|---|---|
| K4 | 百萬合成頁：唯一詞查詢中位 0.159ms；常見詞 777.7ms；常見詞＋雙 Tags 1041ms | 各 shape 五次 profile，不是 P95 SLO，不可泛化所有 SQLite 搜尋 |
| K3 | 2CPU/4GiB，無 consumer/bulk/update，Web 搜尋4/s＋閱讀1/s：搜尋 P95 1475.3ms，閱讀818.3ms；純閱讀11.9ms | 搜尋達標仍可能傷害閱讀；SSR/HTTP 合成短窗，不是真人瀏覽器體感 |
| K5 R1 | 4CPU/8GiB/4workers 更新時 CPU約3.73核，節流／排隊；閱讀862.5ms、Web搜尋2074.1ms | 支持共用資源風險，不能把所有變慢單獨歸因 CPU；內容槽／MinIO也有觀察 |
| K5 R2 | 8CPU/12GiB/8workers，6搜尋API/s＋閱讀／下載／更新通過 | 已測工作點，不是最大RPS；同時改多項配置，非純CPU因果 |

來源：[K4](../../research/docs/C_QUERY_COST_RESULT_20261116.md)、[K3](../../research/docs/C_WEB_SEARCH_RESULT_20261116.md)、[K5](../../research/docs/C_SCALE_RESULT_20261116.md)。

## 下一個比較應回答什麼

決策問題：在保住 Web 搜尋／閱讀反應的條件下，SQLite 與 ES 各需多少站點資源、能完成多少工作，以及需要額外維護哪些保護機制？這不是最低 RAM 或最高跑分排行。

第一層是引擎／查詢比較：固定來源、必要命中與授權集合、Space／Tags AND、返回欄位、Top10、total 義務、查詢組成與版本。分開記引擎操作成本及完整 API latency，不以 ES took 對比 SQLite 端到端時間。先比較現行合約；精確 total 是否必要保留正式未知，若放寬應兩邊一起另立配置，不偷換規格。正式中文品質未知，性能通過不代表與公司 ES 等價。

第二層是服務比較：固定 Web 背景，再加入 consumer，兩者各自報 offered/completed/拒絕/timeout、P95/P99，並保留查詢類型分層結果。P95 應含應用排隊與必要授權／組裝；不能剔除拒絕讓延遲變漂亮。固定發送節奏，記錄負載產生器漏發，避免 server 慢了就自動降低施壓。

先沿用既有研究工作點（Web4搜尋/s、consumer2/s、閱讀1/s），以及研究搜尋P95≤2秒、閱讀P95≤max(2×合格baseline,500ms)、失敗≤1%。這不是公司已承諾SLO。第一步固定完整服務 CPU/RAM 總預算，比共同工作點及可控負載階梯；只有結果會改變選型，才探索達同一工作點所需的較低／較高配置。MinIO預算另列。新測點需要有足夠樣本及穩態窗口，不沿用30秒短窗直接宣稱容量。

站點成本要包含 Next、SQLite workers 或 ES、必要API/metadata adapter、cache、queue及更新重疊；不能只算ES heap。分離引擎與拓撲的結論：若 ES 獨立服務勝過同 Pod SQLite，先稱部署配置結果；只有仍值得投資 C 時才補「SQLite 搜尋獨立資源」對照，不一次展開三者完整矩陣。先核正常混合負載，合格再做一次更新競爭；資料／授權錯誤立即停。

## 隔離需要分層理解

1. 執行緒／程序：把同步搜尋移出 Next 主事件迴圈，避免直接阻塞。
2. 資源：限制搜尋可吃的 CPU/RAM／併發並保護 Web；增加 workers 不自動增加可用CPU。
3. 部署／故障：獨立服務可分開擴容、重啟與發布；不同 Pod 仍可能共用節點，需核 requests/limits／排程，不是天然物理隔離。

ES 也會排隊／競爭，且 Next 仍有回應解析與組裝成本；不是換 ES 就無須保護 Web。隔離元件增加，但可減少自製保護／排錯工作，需列入總維運差額。

## BFF 與下游 API 的具體差額

這裡的 public API 指供下游依賴的介面，不必代表網際網路開放。兩種API都必須做身份、授權、輸入驗證與負載防護。以下是典型差異而非框架限制或所有consumer都如此：

| 維度 | 自家 Web/BFF | 下游 consumer API |
|---|---|---|
| 契約／發布 | 可配合自家頁面調整、協調發布 | 獨立升級者可能需版本、穩定schema、錯誤與分頁／total契約 |
| 身份 | 通常使用者session | 可能是服務身份、代表使用者或兩者；服務合法不等於可讀所有Space |
| 流量 | 互動、取消、debounce等自家可控行為 | 可能批次、重試、同步尖峰；需按consumer辨識與追查 |
| 資源公平性 | 保護前景互動與閱讀 | 全域限流之外，考慮每consumer配額、重查詢併發及Web保留能力 |
| 責任人 | 通常同一產品團隊 | 錯誤責任、相容性、棄用與事故溝通需要明確owner |

Gateway 可承接公司已有的身份／流量／路由政策，但是否在DR沿用仍待核。相同RPS的查詢成本可差很大；Gateway限流不能取代應用授權、canonical page/Space/media解析、昂貴查詢併發及穩定結果語義。新增責任應與原BE可沿用能力逐項比較，不全歸因引擎或全假設必須重寫。

## 官方依據與界線

- [Next.js BFF](https://nextjs.org/docs/app/guides/backend-for-frontend)：支援一般HTTP public endpoints，官方也指出不是完整backend替代。不能推論不允許consumer API。
- [Node worker_threads](https://nodejs.org/api/worker_threads.html)：worker用於CPU密集工作；此處只引用一般執行模型，實驗仍依既有Node22版本。
- [Kubernetes資源管理](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)：CPU limits經kernel/cgroup節流，不能把worker數當CPU保留。
- [Elasticsearch搜尋API](https://www.elastic.co/docs/solutions/search/the-search-api)：track_total_hits有精確度／性能取捨；需對齊total義務。
- [SQLite FTS5](https://www.sqlite.org/fts5.html)：搜尋／排名能力及rank排序路徑；證明有實作選項，不證本系統已優化或優於ES。

下一步建議：請reviewer把現有框架收斂為一次有限的ES／SQLite同條件服務比較；consumer契約差額用既有API路徑走查，不用壓測代答。維運成本仍是主決策目標；暫不重開Pagefind或無界SQLite調校。此建議不是已啟動新實驗。
