# DR 需求、問題與決策紀錄

**2026-11-16 討論報告 v2 已發布並讀回核對。** GitHub `codex/cloud-migration` commit `c8a0b047409154ff832d522558f7abd392502e5e`，僅修改 discussion/ 五檔，總 63377 bytes，遠端逐檔 bytes/SHA 相符。主線改為優先核對 A 的沿用／增站差額，非成本勝出定案；拆開移除 Backend 與替換 ES 的責任，C 六包改為條件式盤點。Pagefind 更新100k建置成功及G2/D1/D2單題逾時，6 search/s 不當SQLite上限，B不當A。暫停PF優化／擴容與C全面產品化；下一步核對既有路徑/runbook/流量。Reviewer兩項均closed；離線Edge三頁導航、details、鍵盤、390/768/1280無overflow與print state通過；非真人驗收。未新增壓測，原始研究／未提交程式保留；本機branch未重設。入口 discussion/index.html，scripts/discussion-reframe-20261116；evidence/discussion-reframe-20261116/publication.json。初次沙箱Edge啟動受限，授權後同檢查通過。


更新：2026-11-15（Asia/Taipei）。本檔是後續迭代的討論入口，整合本對話已確認事項、研究選項與未解問題。不是完整逐字稿，也不是正式採用批准。舊實驗、舊門檻與失敗不因本檔更新而改判。

## 最新使用者補充：已確認的輸入

| ID | 確認事項 | 對設計的影響 | 尚未代表 |
|---|---|---|---|
| F01 | PDF 內容已抽取並存在主站 MariaDB，可用來建 index | exporter 可取得既有抽取文字；DR 不必預設自行解析 PDF | 所有 PDF 均完整抽取、OCR 品質、page/media 對應及更新時效均已驗證 |
| F02 | Web 基本任務是看文件、搜尋文件，涵蓋 title/content/space/tag，點結果用 pageId 跳轉顯示內容 | 搜尋品質和既有閱讀銜接是首要驗收 | consumer 正式 API 契約已取得，或四個欄位都要做自由文字全文查詢 |
| F03 | Web 若有 title/content match highlight 更好 | Web highlight 是偏好／加分項，可與核心搜尋分開評估 | API consumer 也同意取消 highlight，或舊 S1 測試標準可以追溯放寬 |
| F04 | 預期中英文使用 | golden cases 至少分中文、英文及中英混合；技術碼另分組 | 簡繁互轉、翻譯搜尋、拼字容錯、同義詞、詞幹化均為必要承諾 |
| F05 | page 可有多個 tags；屬 page metadata，獨立於 page content | 使用結構化 page-tag 關係篩選；不依賴正文含 tag 文字 | 百萬 harness 已驗 tags。多 Tags AND 沿用先前使用者共識 |
| F06 | 使用者確認 fz1／fz2 機房在兩個位置，但不確定是單一或兩個cluster；認為主要極端不可達情境是台灣網路全斷或兩區皆故障 | 以「兩處機房」記錄現況；確切cluster／控制面及共同依賴由Infra核對，不阻塞搜尋研究範圍裁定 | 兩機房等同兩獨立cluster、無共因故障、故障一定短或僅有上述兩種成因均未證 |
| F07 | 使用者將本輪DR定位為等待主站恢復的fallback，質疑全面ES等價／論文式品質研究的必要性；目前沒有完整異地stack的要求 | 降低無直接決策價值的研究優先度；優先必要任務與明確降級的有限驗證 | 「多數能搜即可」尚不是數值門檻或任意漏找授權；沒有取消既有基本功能或限定DR只能服務一小時 |
| F08 | 使用者補充fz1、fz2可視為平時都保持可用；fz1不可用時DNS Team統一把流量切至fz2，使用者可繼續操作 | 既有fz切流是已存在的服務接續方式；不能再把fz2描述為需冷啟／下載才可用。新異地fallback與此機制的銜接須另確認 | DNS切換時程、是否自動、fz2反向切回、異地入口是否由同Team管理、兩區獨立拓撲與完整故障演練均未提供 |
| F09 | 第一版先假設異地有獨立hostname；本地不可用時使用者手動換網址即可，公司infra／災難導流政策之後再處理 | 手動入口為本階段基準，DNS Team接管異地／自動導流／統一endpoint不再是原型前置條件 | 尚未實際建立hostname或驗登入／連線；API consumer自動換址／正式相容也未證 |
| F10 | DR明確定位為fz1、fz2兩者徹底不可用時的fallback | 故障卡已可固定為兩處主站皆不可用，無需再問是否取代fz2或第三條路徑 | 不自動等於全台網路中斷；身份／ReBAC等依賴是否仍可達須依故障卡驗證 |
| F11 | 使用者理解非即時快照有權限關係drift，認為move pages不頻繁；若daily風險偏高可評估每4小時同步，尋求足夠好的baseline | 接受以快照時效及風險取捨繼續研究，不以零漂移作受控第一版前置；daily沿用，4小時為候選，未定案 | move頻率未量；4小時不是已驗安全或正式風險接受門檻；同步失敗／主站無法產新版時資料age可繼續增加；不能停止Role／Space／media基本檢查 |
| F12 | 完整方案異地部署並完整備份是使用者確認的可行基準；研究尋找滿足需求且整體成本更低的方案，預期未來可能多處備援 | A作比較起點，B/C需證明淨收益；每新增一地的成本為核心變因，非附帶資訊 | A成本較高、SQLite較便宜、未來站點數與公司部署演練均未實測／確定 |
| F13 | 第一版繼續採本地 index／metadata，正文與附件從異地 MinIO 讀取；只補影響方案與維運成本的證據 | E2 搜尋／版本契約可局部重用；補遠端同版、canonical 授權、失聯恢復三組。完整 local bundle 保留為對照 | E2 的本地正文／PDF 離線成功不可套用；FTS／摘要可能保留文字，未證 Pod 容量或總成本下降 |
| F14 | 團隊曾提出 Pagefind，需清楚回答既有研究與未成主線的原因 | 已回查小型 Node／Next／MinIO 成功與十萬頁建置超預算；恢復明確的條件式候選定位 | 沒有永久淘汰決議；SQLite E1／E2 通過不可當 Pagefind 已驗或全面較差 |

先前 HTML／報告的「PDF 抽取來源未知」已由 F01 取代；舊稿保留歷史，不再重問該來源。PDF 覆蓋範圍、抽取品質及 page/media 關係仍可提出具體缺口。

## 已確認的整體基準

- 產品：公司內部知識管理；Next＋Backend＋MariaDB＋ES＋MinIO；授權主要在 Backend/MariaDB，Space Role 同步公司 ReBAC。
- DR：依F10，fz1與fz2兩處主站徹底不可用時使用異地fallback；其他cluster可到達；唯讀搜尋／閱讀／下載。ReBAC有備援仍為使用者指定工作假設，實際整合待驗。
- 約一小時恢復是討論起點，不是 DR 只需服務一小時；每日同步為初始方向，不等於實測 RPO。研究中的15分鐘、120秒、2秒門檻不是正式已接受 SLO。
- 第一版採異地獨立hostname、Web使用者手動換址；公司統一導流／災難政策依F09延後，不阻塞目前整合。fz1→fz2仍沿用DNS Team既有機制。API consumer可先以可設定DR base URL的合成client驗證，正式接入限制另列。
- keyword 查 title／正文；Space 篩選；多 Tags 全部符合。多關鍵字 AND/OR、片語、模糊、簡繁轉換等具體語意仍須定義。
- 既有 page list→pageId→取 content→editor 已由使用者確認；新增是搜尋入口與 DR 資料／授權接縫，不重算整套 editor 工程。
- ReBAC 目前只有 Space Role 且有 tuple 上限；media 授權須另驗 page metadata 的 media list 及該 Space 權限，不能預設可加入每個 media 的 tuple。
- 目標是全體 provider／consumer／Infra 的開發與維運負擔下降；服務數少、低 RSS、測試數多均不能代替此目標。
- 無正式 request/response 時先做明示合成研究；正式未知保留。維持 A 全套沿用、B 保留 ES 重做周邊、C SQLite 三條可討論路線。

## 研究成功條件與成本比較規則（F12）

**已有可行基準A：完整Next／Backend／MariaDB／ES／MinIO異地部署及完整備份。研究要回答的是：是否有滿足需求而整體成本更低、適合增加備援地點的方案。** 此處沿用使用者對可行性的判斷，不宣稱已完成公司環境部署驗收。

- A完整方案、B保留ES重做周邊、C SQLite均持續保留。比較相同故障卡、必要使用情境、資料時效與可接受降級；完整鏈測試是資格門檻，不等於比A划算。
- 分開記錄一次性開發／遷移、共用產製／維護，以及每站資源、儲存與傳輸、部署升級、監控、同步失敗處置、演練與支援。provider、consumer、Infra工時都列入，既有自動化與可沿用程式也要扣除重做需求。
- 用站點數N分析：一次性投入＋期間內共用成本＋各站增量成本＋跨站協調成本。先展示1／2／多站的假設敏感度，不將站點數或期間視為已確認，也不強制假設成本線性。金額、工時及資源分列；未知不填成零。
- 下一輪先盤點A已有部署／備份／告警／runbook可沿用多少，再挑最可能翻轉選型的缺口驗證；B/C完整任務鏈整合須同時記錄新增維護責任，不能只做功能展示。
- 採用替代方案須同時有需求達成證據、明示妥協及相對A的成本收益。若客製搜尋／同步／版本／consumer改造抵銷節省，保留A是有效研究結論，不為證明SQLite而繼續投入。

## 第一版問題優先度（2026-11-15）

本節為主agent依現有資訊提出的研究排序，不是新增測試結果或使用者已批准的採用門檻。第一版指可供review／試用的候選提案；正式啟用另需部署環境及代表consumer證據。順序先判需求是否達成，再判架構與成本是否值得；研究執行時可先低成本盤點A，避免無收益的替代實作。

| 優先問題 | 目前資訊 | 第一版最低有用答案／會影響的決策 |
|---|---|---|
| P1 完整方案A究竟多出哪些成本？（D18） | A為可行基準；沒有公平成本資料，不能預設較貴 | 盤點可沿用部署／備份／升級／告警及每站資源，和B/C新增責任逐項比較；先用範圍估計並標未知，無需精確帳單。若A容易沿用，降低客製方案投入 |
| P2 必要文件找不找得到，差異能否說清楚？（D11/D12/D14） | 有分開的合成搜尋子證據，未證現行C全部必要任務 | 少量中英文、技術碼、PDF-only、Space／Tags AND案例，用獨立預期頁與ES-reference同題對照；明示漏找、排序差異及修補成本。必要案例系統性失敗且修補繁重則轉B/A |
| P3 拿掉Backend／MariaDB後要補回多少功能？（D13/D14/D16/G02/G04） | 既有editor可沿用；PDF文字來源已知；page/media授權與正式consumer仍有接縫 | 真Next與合成client完成搜尋→pageId→既有內容／PDF→下載，列欄位來源、授權與故障依賴；輸出consumer差異清單。不重建editor，也不宣稱合成契約已相容正式consumer |
| P4 日常更新與故障是否變成另一套高維護系統？（D03/D08/D13） | MR1有失敗保舊子證據；L同版下載；跨版舊鏈409反例 | 重用機制驗真V1/V2、缺件保舊、Pod重建、舊鏈明確處置；記人工步驟及例行責任。daily為方向，移頁／撤權案例說清實際暴露窗口，不先追零漂移 |
| P5 每新增一地能省多少，是否被其他成本抵銷？（D05/D06/D07/D17/D18） | 有百萬合成約2.13GB SQLite及受限負載證據，無公平A/B/C資源比較 | 同需求／資料／負載下估資源包絡，補必要混合負載；拆共用build、每站／每Pod下載與儲存、附件及版本保留、consumer與操作工時。示例站點數做敏感度，未實測項不填零；不追極限QPS |

有價值但延後：全面ES等價／排名指標與斷詞組合（必要案例失敗才深入）；精準TCO與多區完整實體壓測（先成本範圍及擴張模型）；自動DNS／同endpoint（使用者已延後）；完美highlight（Web加分項）；增量同步／最適頻率（先量daily完整流程及4小時候選代價）；所有consumer／格式／極限規模（先代表案例）；零中斷與複雜舊版路由（先明確可恢復行為）。

不可混為「不重要」：正式登入／ReBAC／MinIO可達、正式consumer核對、部署資源與啟用責任是正式啟用前必需的證據，但無公司輸入時不阻塞受控候選提案。公司共同依賴清單現在先列，避免成本比較漏項；實際驗證留到有環境。

已有答案而不再重開：兩fz均不可用的故障卡、手動獨立hostname、PDF文字在MariaDB、既有閱讀/editor、Tags屬metadata。集中build供多地重用維持工作方向；沒有新反例不展開每Pod自建引擎研究。

建議下一個最小成果：A/B/C「需求達成／已知降級／新增責任／共用與每站成本／證據缺口」比較頁，先利用既有證據填入；只為可能翻轉選型的缺口追加實驗。本次未啟動新實驗。

已設計 [第一版實驗與分派計畫v0.2](DR_EXPERIMENT_PLAN_V1.md)：E0盤點→E1必要任務→E2操作接縫→條件式E3容量成本；一次獨立review與定向複核關閉四項設計finding，詳 [審查紀錄](DR_EXPERIMENT_PLAN_V1_REVIEW.md)。這是設計定稿，不是執行卡批准或新實驗結果。

## 討論與驗證追蹤表

狀態包含：已確認、工作方向、局部已驗、待驗／待決策。每輪引用相關 ID；未涉及項標「本輪不變」，不要求每次重跑全部實驗。

| ID | 必須持續回答的問題 | 目前狀態與證據 | 下一個判斷／驗證 |
|---|---|---|---|
| D01 | 誰使用、要完成什麼？ | 已確認 Web 與 API consumer，唯讀搜尋／閱讀／下載 | Web 基本需求與 consumer 契約分開；F01–F05 維持 |
| D02 | 故障範圍、RTO／RPO／可服務多久？ | F09/F10已確認兩fz徹底不可用＋異地獨立hostname手動換址；導流政策延後 | 依此故障卡核對身份／ReBAC／MinIO／內容與重建依賴；不再重問定位。時間數值及資料age界線仍未定 |
| D03 | 異地 MinIO 與 Pod 本地檔有何不同？ | 兩層同步已說明；L 實驗量第二層 | 主站一致發布、異地完成、Pod 安裝的責任／狀態／告警 |
| D04 | 沒 PVC 是否每次重啟必下載？ | 已查官方：emptyDir 跨同 Pod container 重啟保留；Pod 替換則新建。PVC 有獨立生命週期 | 儲存與掛載條件、排程／容量／磁碟壓力；requests/limits 不是獨享硬碟保證 |
| D05 | index 應由誰建？ | 使用者認為不在每 Web Pod 自建較理想；集中產製／多站重用為工作方向，尚非最終採用 | 對比集中建一次、每站 Job、每 Pod 自建的傳輸／build／維護成本 |
| D06 | index 是否很小、怎麼備份？ | 2.13GB 合成 SQLite 包含索引與正文，不是純 index；小於附件總量只是可能 | 分列索引、metadata、正文、附件、版本及 staging；成品一致快照／hash |
| D07 | 同時 frontend＋V1搜尋＋V2下載可行嗎？ | L 第3輪驗舊reader＋第二份下載，60循序query；同release，沒有真Next前端混合負載 | 真V1/V2、資源隔離、UI/API負載、下載失敗、在途請求與新Pod恢復 |
| D08 | 更新、切換、回滾、舊鏈如何處理？ | 同release停舊啟新局部已驗；歷史跨reader409反例保留 | pin版本避免混檔、先驗後啟用、舊版保留／路由或重搜成本、GC；不可把2D當所有保留策略峰值 |
| D09 | SQLite index 是什麼、如何建？ | FTS5＋pages metadata；現行builder contentless FTS及中文前處理；ES索引不能直接給SQLite使用 | 同源抽取、rowid/pageId映射、query前處理相容、build manifest |
| D10 | BM25 是什麼，和找得到有何關係？ | 概念已說明：詞頻飽和、稀有詞、長度校正；排序不會補回未命中的文件 | 不跨引擎比較原始score；先命中再排名，見 SQ01–SQ05 |
| D11 | 文字分析如何接近 ES？ | ES-production mapping/query未知；reference可讀；最新L用Intl.Segmenter(zh-Hant)前處理 | 全面ES仿真延後；必要任務失敗才對齊抽取／tokens／query／權重並保存診斷；修補負擔升高時比較A/B |
| D12 | 如何證明中英文搜尋足夠好？ | 歷史10k中文漏找、ES小型fixture、最新L子證據不可混合排行；經獨立scope review收斂研究 | 必要任務可完成＋負向案例＋少量ES同題差異；全套排名／benchmark工具條件式使用，正式品質未證 |
| D13 | Space、Tags與權限是否正確？ | 基本predicate子證據、Tags缺口維持；F11允許以非即時快照漂移風險取捨研究 | 保留Role／Space／membership檢查；測移頁／撤權的實際影響與資料age。daily基準／4小時候選評成本與窗口，未採零漂移或無條件允許策略 |
| D14 | PDF能搜、能開、能下載是同件事嗎？ | F01確認文字來源；pageId→mediaId及membership仍必要；真PDF鏈未驗 | 只出現在PDF抽取文字的詞→正確page；viewer／Range／大檔；抽取品質及版本對齊 |
| D15 | Highlight是否必要／正確？ | F03僅Web偏好；正式consumer需求未知；歷史有界excerpt有子證據 | 含來源欄位、escape／offset／中文前處理映射；不能當命中召回的替代 |
| D16 | 真API consumer需改多少？ | 正式範例未知，合成契約不代表相容 | response、total／分頁、錯誤、重試、endpoint、版本鏈、highlight逐項核對 |
| D17 | 效能與資源撐不撐得住？ | 最新L短循序工作集，未設cgroup；RSS不含OS cache；ES雲端數據不能作本機速度榜 | 同承諾／同負載資源包絡、build及雙reader峰值、長時運作；停止無決策價值調優 |
| D18 | 替代方案是否比完整異地方案更划算，且適合多處備援？ | F12確認A為可行基準；A較貴與B/C較省均未證 | 先盤點A可沿用能力；同需求比較一次性／共用／每站／跨站成本，記錄改造與維運工時，辨認選型翻轉點 |
| D19 | Reviewer如何逐層追問？ | 分層HTML材料已有獨立內容複審，手機agent檢查；真人理解未驗 | 目標→架構→證據→限制→決策；納入本次F01–F05，不讓舊未知覆蓋新確認 |
| D20 | 實驗與agent合作如何不跑題？ | 已完成3回合L；使用者重品質及適當分工；不為分工而分工 | 每輪固定未知／預期／預算／停止理由；可得成本記錄，未知不捏造；本次不執行新實驗 |
| D21 | 何時可稱第一版可用solution？ | 受控整合方向維持；使用者回覆F09–F11已收斂G01及G05，未新增技術驗收結果 | 不再把自動導流或零漂移作原型前置；優先獨立完整鏈、版本完整性、Tags／PDF／consumer、失敗保舊及成本。正式啟用仍需對應環境與政策證據 |
| D22 | 遠端正文／附件方向下，E2 哪些可以沿用？ | [獨立沿用審查](DR_REMOTE_CONTENT_REUSE_REVIEW_20261115.md) 分可引用／部分／不適用；資料依賴改變，E2 有限結案不撤銷 | 只補 R1 同版物件交付、R2 canonical 授權、R3 MinIO 失聯降級恢復；量本地文字、GET 與發布／保留／診斷責任。不重跑整套 E1／E2 或自動 E3 |
| D23 | 為何不用 Pagefind，能否保留？ | [歷史重判](PAGEFIND_DECISION_REVIEW_20261115.md)：保留候選；100k 是 6 GiB builder budget 失敗，非 reader 容量結論；小型 Next 成功及舊中文反例並存 | 分開共享 producer 與每站 runtime 成本；有可影響選型的收益／預算假說時，重開有界 build 與同必要任務驗證，不盲目加 RAM、不追求 ES score 等價 |

## 每次迭代的最小紀錄

在既有實驗卡／review／handoff引用本表，不另強制增加一套流程：

1. 本輪相關 D-ID／SQ-ID、當前要減少的未知與成功／停止條件。
2. 使用哪版來源、需求、engine／tokenizer／query／oracle；哪些是合成假設。
3. 實際結果、反例、未執行項；是否改變原決策，以及對誰增加成本。
4. 更新相關列及handoff；其餘項「維持／本輪不涉及」。對口未接受不得標已批准。

## 本次迭代：2026-11-15

- **E0／E1已開始並交付結果**：[E0成本與責任盤點](DR_E0_BASELINE_20261115.md)、[E1結果](DR_E1_RESULT_20261115.md)。E0保留A/B/C，未證成本優勢；E1真Next小型37頁/2PDF、兩引擎各23case，r1監測啟動失敗0HTTP，唯一r2修補後86HTTP。搜尋、Tags、PDF鏈取得子證據，獨立離線核對回應未發現內容／篩選不符；35筆時間戳檢查失敗及每候選2個UI定位未完成，原凍結驗收維持false。依停止條件不進E2/E3，不自動第三跑。優先釐清時間觀測與補身份／桌面路徑；新結果不替換歷史失敗或正式需求未知。D12/D13/D14/D16有新有限子證據，D18維持成本未定。

- 使用者回覆readiness：F09獨立hostname／手動入口、F10兩fz皆不可用、F11快照漂移取捨／4小時候選。更新G01/G05的目前優先度與交接；不要繼續以定位未定／必須零漂移阻塞受控整合。沒有啟動新實驗、改排程或建立實際hostname。

- 後續readiness審查：F08確認fz1/fz2平時可用、DNS Team統一接續；新增D21及 [第一版可用審查](DR_V1_READINESS_REVIEW_20261115.md)。重用MR1、S1-ES及L子證據，缺口聚焦完整鏈與正式對口；沒有新實驗或正式切入批准。

- 後續範圍審查：新增F06兩處機房（cluster拓撲未知）、F07 fallback定位。獨立reviewer建議必要任務驗收優先、完整搜尋品質研究延後；[審查紀錄](DR_RESEARCH_SCOPE_REVIEW_20261115.md)與SQ計畫已更新。沒有批准任意漏找、縮短DR持續時間或直接擴大至全台斷網的正式覆蓋承諾。沒有新實驗。

- 新增F01–F05；更新PDF來源已知、Web highlight偏好、Tags metadata等假設。
- D10–D12建立 [搜尋品質評估草案](SEARCH_QUALITY_PLAN.md)。計畫／教學案例未執行，沒有新增品質通過結果或業界通用門檻。
- 未修改既有凍結實驗、原始證據或永久AGENTS／skills。這是專案紀錄。

相關入口：[交接](../README.md)、[分層報告與限制](DR_REVIEWER_DOSSIER_20261115.md)、[L實驗](L_FIRST_VERSION_20261115.md)。

- 2026-11-15 E1-F1補驗：獨立reviewer確認合成必要任務可有限結案。跨程序wall clock比較不可靠（正常權限100/100反例），當次Role撤除/恢復及共享身份UI補齊；底層clock原因與正式授權SLA未證。測試locator/等待修補與原失敗分開保留，沒有產品改動。詳 [補驗結果](DR_E1_FOLLOWUP_RESULT_20261115.md)／[獨立裁定](DR_E1_FOLLOWUP_REVIEW_20261115.md)。下一步只建議E2版本更新/回復及人工成本；沒有成本勝負或正式上線接受。

- 2026-11-15 E2四關有限結案：混版拒絕、真V2同版、Web/client明確重搜、來源角色隔離後有協助的非作者fresh接手。原operator首次記錄器失敗保留，產品未因此改動。下一步以原公司異地MinIO讀內容方向收斂資料放置邊界，再決定E3；C成本較低仍未證。詳 [E2結果](DR_E2_RESULT_20261115.md)／[獨立審查](DR_E2_POSTRUN_REVIEW_20261115.md)。沒有正式consumer／ReBAC／MinIO／真人接受。

- 2026-11-15 F13／D22遠端內容R1–R3有限結案：[結果](DR_REMOTE_CONTENT_RESULT_20261115.md)／[獨立review](DR_REMOTE_CONTENT_POSTRUN_REVIEW_20261115.md)。唯一17組40API、真本機MinIO同版／canonical授權／停機降級恢復成立；非正式DR／IAM／ReBAC。保留容量反例與原帳務更正，C淨成本未證；D23 Pagefind保留。下一步用同需求責任與資料分布敏感度比較A/B/C，不自動E3。

- 2026-11-15 D24：A/B/C的成本何時翻轉？已完成[連續決策頁與試算](DR_COST_DECISION_20261115.html)及[獨立review](DR_COST_DECISION_REVIEW_20261115.md)。把引擎與內容放置分開、先過相同需求資格；缺值不填零，不給A/B假報價，Pagefind保留。以Δ一次性＋T×Δ共用維護−N×T×每站淨省算臨界值；C容量／流量只是條件規劃，非容量實測。下一步核現有自動化／各站淨增量、正式API/格式/owner及用量範圍；不增加DR壓測。

- 2026-11-15 D18／D24 成本細化：使用者要求具體工作內容及流量能力。完成 [C／A 實作核對](DR_C_A_IMPLEMENTATION_AUDIT_20261115.md)，獨立 reviewer 確認 adapter 全量重讀、每 query child、整份媒體 buffer 等待計工程成本；目前無同 build 持續吞吐或 A 正式配置。沒有新壓測、正式勝負或規格放寬。


- 2026-11-16 D18／D24：依使用者授權完成 C 容量候選 K1，reviewer 設計 gate＋事後原始重算有限結案。詳 [結果](C_CAPACITY_RESULT_20261116.md)／[HTML](C_CAPACITY_RESULT_20261116.html)。固定資源、單次正式、最高已測32req/s但非飽和上限；更新記憶體與中央publisher成本已量。MinIO壓力、block I/O缺值、mock/熱集/短窗與正式未知保留。未用B冒充A、未證總維運最低。停止本輪，不追加負載。

- 2026-11-16 百萬頁／共享負載新問題：使用者指出 C 將原 Backend／ES 的責任移入 Next reader，需優先驗百萬頁下 Web 與 API consumer 的相互干擾。現碼 SQL 在兩個 child worker，不在 Next 主 event loop，但同 reader CPU/RAM 預算；搜尋與 page metadata 共用 pool/queue，尚無 Web／consumer 資源配額隔離。K1 API 負載未證正式 Web SSR／editor 體驗，不能以100k結果推百萬。
- 使用者認為 MinIO 為各方案共同檔案服務，可降低研究優先度。釐清：C 另將原MariaDB正文交付移至MinIO；搜尋包下載發生於安裝、更新與無本地副本重建，非永遠一次；目前正文／附件透過Next代理，故檔案傳輸也占reader資源。512MiB研究MinIO的壓力不推論公司MinIO不足。建議後續固定合理物件服務基準，重點量reader共享負載；百萬頁新卡尚未執行，資源配置／隔離備案仍是提案，不是已接受正式變更。

- 2026-11-16 D18／D24 K2百萬頁已取得共享負載與更新反例：原1GiB ready失敗；唯一4GiB備案可服務，consumer4/s使Web P95約2.98s；consumer2/s+bulk2/s可用但V2更新新pool逾時。423已送成功、477停止後未送；無V2啟用／失敗後長期恢復證據。詳[手機圖解](C_MILLION_RESULT_20261116.html)／[獨立事後裁定](C_MILLION_POSTREVIEW_20261116.md)。C容量與維運最低仍未證，正式流量／資料未知。下一步建議單變因4→8GiB優先驗更新，尚未執行，不把RAM改善當Web保護已解。原始失敗、凍結、服務清理與新增成本已保留；本輪停止，不自動更多備案。

- **2026-11-16 K3：沒有API consumer，Web一般搜尋仍會拖慢閱讀。** [手機結果](C_WEB_SEARCH_RESULT_20261116.html)／[續接](C_WEB_SEARCH_RESULT_20261116.md)／[獨立review](C_WEB_SEARCH_POSTREVIEW_20261116.md)。使用者要求優先驗Web本身，暫緩K2建議的8GiB更新。沿用K2 frozen百萬V1/build、reader2CPU4GiB、MinIO4CPU4GiB；無consumer/bulk/update，九query的Web所需server任務SSR→results，獨立閱讀固定p1每秒1次。單次正式四階各30秒：reading-only P95 11.85ms；search1/s P951074ms/reading15.66；2/s1046ms/13.32；4/s1475ms/reading818.34超500ms。210search+120reading全成功，無取消/漏送/超時；stopnull是正常按門檻結束，非全通過。4/s avg1.924CPU、queue3，無memory.max/OOM增量；Next event-loop最大約22ms。五文字query browser表單通過；filter/identity UI缺，HTTP容量非render/真人接受，固定相位與hotset限制保留。74freeze及installedV1相符，服務端口已停、Next清理143非負載失敗。下個建議先只讀分解count/filter/top10時間，未認定count根因、未批准改total/結果/資源或追加負載；A成本未知、K2更新失敗仍未解。原K2/K1不覆寫，native .lab/c-web-search-20261116，證據evidence/c-web-search-20261116，runner scripts/c-web-search-20261116。

- **2026-11-16 K4：查詢成本分散在count與Top10，診斷完成，尚未優化。** [手機分項圖解](C_QUERY_COST_RESULT_20261116.html)／[結果](C_QUERY_COST_RESULT_20261116.md)／[獨立裁定](C_QUERY_COST_POSTREVIEW_20261116.md)。原SQL/百萬V1/2CPU4GiB不改，只9原worker reference、45profile(9形×5輪)、後置9組EQP，27.15s完成。五次合計count42.47%、Top1057.51%、結果補Tags0.014%；兩大段都含FTS/JOIN/filter，不能稱純排序或獨立filter成本。common中位777.7ms、space5051結果仍497.4ms、雙Tags1041ms；無單一count根因。54source與45ordered reference均符，原worker退出後才profile，兩child在cgroup；Node/SQLite/PRAGMA實讀匹配。14freeze含DB前後相同、unit正常0退出；沒有Next/MinIO/Web負載或產品改造。下一唯一候選先核stat現況/compile options，再在新DB副本只補pages/page_tags統計、原SQL/結果/資源不變，與同時期原副本成對比較全九形與反例，記分析時間/大小/hash；未執行且不保證改善。K2更新失敗及K3Web競爭仍未解，8GiB仍暫緩，A增量成本未知。runner scripts/c-query-cost-20261116；evidence/c-query-cost-20261116；native .lab/c-query-cost-20261116。未改K2/K3凍結檔，停止本輪，不自動更多備案。

**2026-11-16 新方向：資源擴容、ES 同額與其他引擎並列假說。** [手機比較設計](DR_ENGINE_COMPARISON_20261116.html)／[獨立review](DR_ENGINE_COMPARISON_REVIEW_20261116.md)。使用者要求同時驗證更多資源、同額ES與Pagefind等替代；不再以ANALYZE為唯一下一步。首波提案C-R1(4CPU8GiB)與ES-R0(全服務2CPU4GiB)，新共同harness需小型C-R0 matched control；站點額度含Next/engine/metadata/更新雙版。Pagefind先server能力＋有界100k build，通過再1M；舊6GiB失敗是build非reader。新增Meilisearch先小能力，Typesense備案；選入是待驗收益假說，非業界最佳或已省成本。MinIO與中央建置另列，重負載串行；具體版本/資源分配/中央build護欄需下一執行卡freeze。本輪只研究與報告，未新增benchmark或安裝，A全stack成本仍未知，B不能代A。

**2026-11-16 使用者目標校正：DevOps 維運工時優先。** 硬體是可行性與次要成本，deployment unit 少是待驗優勢。先盤點正常同步、故障／回滾、重建、升級、增站與演練的人工作業，分列開發維護負擔，避免轉移成本。資源與引擎矩陣保留工具箱，不自動主導順序；Meilisearch 暫選需以維運收益重審。見 [目標與驗證口徑](DR_OPERATIONS_PRIORITY_20261116.md)／[手機比較](DR_ENGINE_COMPARISON_20261116.html)。本次未新增實驗或 reviewer 裁定。



**2026-11-16 K5擴容：找到8CPU12GiB8workers可行工作點，停止本輪擴容。** [手機報告](C_SCALE_RESULT_20261116.html)／[結果續接](C_SCALE_RESULT_20261116.md)／[review](C_SCALE_POSTREVIEW_20261116.md)／[維運帳](C_SCALE_OPERATIONS_LEDGER_20261116.md)。主目標DevOps長期工時；資源是可行性與減少客製的手段。R1(4CPU8GiB4workers)前六階通過，更新能力完整但Web/reading延遲及5拒絕未全合格；CPU節流排隊支持唯一R2，不稱RAM不足已證。固定工作點Web4journeys/s+reading1/s+consumer2/s+bulk2/s及V1→V2更新180s；SQL/queue16/content4/deadline不變、MinIO4CPU4GiB。R1/R2為部署preset比較非純CPU因果；不證最低資源、正式容量或月工時。多版連續更新、V3/GC/rollback/告警與worker fatal自動復原仍未驗。每輪80freeze與installed DB核對、原失敗保留，清理結果見receipt。服務已停止，資料保留；不自動第三階／新引擎負載。下一價值是操作交接與生命週期缺口，ES/Pagefind等仍為待測對照，A成本未知。scripts/c-scale-20261116與c-scale-report-20261116；evidence/c-scale-20261116；native .lab/c-scale-20261116。


**2026-11-16 O1：重啟選版六案例通過，reviewer 有限結案。** [手機報告](C_RESTART_RESULT_20261116.html)／[結果與維運責任](C_RESTART_RESULT_20261116.md)／[獨立審查](C_RESTART_POSTREVIEW_20261116.md)。固定遠端 approved→manifest→DB／cache驗證→Pool檢查→active→ready；同cache V1升V2、空cache V2、重用V2不重抓DB均通過，兩壞manifest pin案例503且cache/active不變。1000/1001頁低頻，非容量/RTO/Kubernetes。629凍結輸入不變，原K5未改；服務停止、有效V2指標恢復，原反例保留。新增bootstrap/publisher/啟動接縫維護責任，沒有新增常駐服務種類；人工工時仍未知。startup-only明確關閉熱更新，不能與K5拼成已整合系統；自動重試/告警/GC/rollback未驗。下一決策先界定指標壞掉時等待修復或容許受控舊版服務，再選最小整合；本輪停止，不擴故障矩陣或壓測。scripts/c-restart-20261116、scripts/c-restart-report-20261116、evidence/c-restart-20261116；native .lab/c-restart-20261116。


**2026-11-16 選型校正：比較 A／C 維運差額，不先把 C 產品化做完。** 使用者已明確確認。共同資料新鮮度／舊版服務政策先列共同需求，只有實作差異影響選型才深入；取代O1「下一步先展開stale-serving」建議，歷史報告保留。[手機材料](DR_SELECTION_DELTA_20261116.html)／[差額帳與操作卡](DR_SELECTION_DELTA_20261116.md)／[獨立審查](DR_SELECTION_DELTA_REVIEW_20261116.md)。唯一優先行動：用A公司既有runbook/IaC或相似站點紀錄走查新增一站及常態維護，核可重用量、一次性/持續/每站增量、owner與頻率；每日更新/失敗復原為同次輔助卡。不外發、不要求新演練。A資料缺乏則保留未知並停止勝負判斷，不能用B或更多C實驗代答。A維持完整可行基準，C有受控候選資格；K5 reader8CPU12GiB另MinIO4CPU4GiB，O1 startup-only不拼成已整合容量版。C移除BE/MariaDB與換ES是兩軸；有客製本身不淘汰，必要行為不成立或維護抵銷淨省才支持偏A。暫停新容量/引擎/復原矩陣，不擅自選成本勝者。


**2026-11-16 落地範圍補充：C 工作盤點不必等待 A 對口資料。** 使用者指出新增ES仍有容量／磁碟／升級及事故責任，自動化不使成本歸零；團隊需要理解C實際交付。見[ES異地索引與C六個工作包](DR_LANDING_SCOPE_20261116.md)。A主要缺ES移轉是目前理解，非完整A驗收。ES snapshot→異地完整repository→rename restore→驗證→alias切換為官方可行設計，尚未公司實測；C仍需Pod本地儲存/worker與版本生命週期，非只管MinIO。調整上一輪唯一下一步：先具體盤點C沿用/適配/新增與owner，同時核A資料；不盲目補全C，也不讓A資料缺乏阻塞C估工。沒有新增實驗或正式部署。


**2026-11-16 團隊選型報告 v1 已交付：目標→機制/證據→架構→C落地→維運差額→決策。** [主報告](DR_TEAM_DECISION_20261116.html)／[來源索引](DR_TEAM_DECISION_20261116.md)／[獨立review全部closed](DR_TEAM_DECISION_REVIEW_20261116.md)。手機/桌面連續閱讀，六工作包各列沿用/適配/新增/建議owner/驗收/持續責任；ES snapshot/restore+alias官方設計與Pagefind歷史保留。C有受控證據值得導入評估，A為完整可行基準；未證C成本勝出或正式整合。K5 R1切版完成但體驗未全過、R2通過；reader/MinIO預算分列；O1不拼K5。A公司資料未知不阻塞C具體盤點。團隊應確認必要差異(須對口明確接受)、六包owner與最大成本未知，再選單一有價值補驗，非先把C全做完。本輪無新壓測/服務/對外發布。UI320/390/768/1280、details/keyboard/anchor/links/print events已驗，無真人或實際PDF/列印驗收。初次UI只因review檔尚未產生缺連結，原紀錄保留，最終通過。scripts/team-decision-20261116；evidence/team-decision-20261116。


**2026-11-16 GitHub 討論包已發布：僅 discussion/ 五檔，未啟用 Pages。** 使用者只需在其他電腦拉取後開HTML。遠端預設分支codex/cloud-migration新增commit da456da93064f2c9d1cffa0863afb0d1f48a02a6（parent c558a51f7c76a62e657310fc3f3554ef99baad8d），五檔遠端讀回逐bytes/hash相符。入口 discussion/index.html，Pagefind專頁 pagefind.html，證據摘要 evidence.html、README與manifest。公開包約58.6KB，不含raw logs/DB/fixture/憑證/研究程式；本機未提交研究保持原狀，未重設本機branch。Pagefind reviewer確認不足排除：小型Next成功、100k/6GiB是builder預算失敗非reader上限，SQLite後續投入不同；舊中文反例及已修問題保留。下一個100k gate只是條件式提案，未執行。公開包review三finding全closed。Repo網址 https://github.com/Joe-Luo-1994/dr-search-lab/tree/codex/cloud-migration/discussion 。scripts/discussion-publish-20261116；evidence/discussion-publish-20261116/publication.json。


**2026-11-16 Pagefind 下一輪已準備，尚未執行。** 使用者提出同步準備 Next Pod 本地 Pagefind 實驗，本輪先完成設計。見 [有界實驗卡](PAGEFIND_NEXT_GATE_20261116.md) 與 [設計審查](PAGEFIND_NEXT_GATE_REVIEW_20261116.md)。舊 server adapter 已唯讀確認：同 Node 程序 localhost 資產 listener、生成 JS/WASM、SQLite pf_map、私有 fragment parser；MS1 本地正文/無 Tags 不是目前 C 的遠端內容整合。先 G0 凍結與控制器，再單次100k中央 builder（提案4CPU/12GiB/30min），成功後有界小型G2（4CPU/4GiB/15min、外部query截止、完整輸出授權oracle）；執行前仍需控制器與oracle review，不自動升級1M或負載矩陣。本輪沒有新build/load或GitHub推送。

**2026-11-16 Pagefind G1 通過、G2 首題逾時後停止。** [結果報告](PAGEFIND_GATE_RESULT_20261116.md)／[獨立結果審查](PAGEFIND_GATE_POSTREVIEW_20261116.md)。G0 OOM/timeout程序樹保護通過；G1單次4CPU/12GiB、100k中央建置與完整性成功，wrapper161.139s/controller162.811s，cgroup峰7.915GiB，Pagefind bundle97,747,059 bytes（另SQLite154,439,680 bytes），共101571檔。G2 4CPU/4GiB首個Next API commonterm/user huge 預期50k命中、回10筆，5003.314ms未得response而QUERY_TIMEOUT；清理無殘留。其餘31必要與1legacy觀察未跑，未加資源/放寬截止/重跑。外控kill使runner results.json未落，逐case與controller已保留；reviewer事後核10469源檔及101571產物全符，不等於G2通過。原因未定位，下一建議是同首題/同配置/同5s加入耐停止phase trace，不直接判PF引擎上限或擴RAM。MS1仍本地正文/SQLite映射，未是遠端正文C，未證成本勝出或百萬reader。native .lab/pagefind-gate-20261116；Windows scripts/pagefind-gate-20261116、evidence/pagefind-gate-20261116。未推送新實驗至GitHub；先前discussion包仍為較早版本。

**2026-11-16 Pagefind D1 已定位到 pf.search 返回前，單次診斷結束。** [結果](PAGEFIND_D1_RESULT_20261116.md)／[獨立審查](PAGEFIND_D1_POSTREVIEW_20261116.md)。同首題/同4CPU4GiB/swap0/5秒，僅trace、新server、沿用G2完成的Nextbuild；非perfAB。唯一query5005.051ms timeout，40筆連續trace：request後46.695ms進pf.search；5個本地資產843740bytes皆serverfinish200，末筆request後145.778ms；無pf.search.end/mapping.start，因此本次自有全結果mapping未開始，不能歸為純WASM慢或client已消費資產。最後已知39筆trace直接helper59.537ms，尾筆自身成本未知。外控QUERY_TIMEOUT/cleanup空；result.json未落，case/trace完整保留。Reviewer事後10586來源與101571產物hash全符。下一項只建議同題同預算少數pf.search內部await/WASM邊界觀測，尚未執行；不加RAM/改total/重跑全套。新native原RUN/d1；scripts/pagefind-diagnostic-20261116；evidence/pagefind-diagnostic-20261116。D1 plan是凍結來源請保留原bytes，狀態在此與結果報告更新。GitHub討論包未更新。

**2026-11-16 Pagefind D2 已定位直接同步 wasm.search 邊界，暫不擴容。** [結果](PAGEFIND_D2_RESULT_20261116.md)／[review](PAGEFIND_D2_POSTREVIEW_20261116.md)。使用者已授權必要時擴資源壓測，仍有效。D2同首題/4CPU4GiB/5秒，一個JS僅18項trace替換（其餘101570產物同原），82trace：所有body/decompress/init/chunks完成，request後219.678ms wasm.search.start後無end、無decode/JSON/JSmap/自有mapping。case5004.821ms timeout。5個query窗口樣本覆蓋0.216–4.235s，4.019s內CPU4.041s≈1.006core，user4.024/system0.017；quota/memevents/reclaim/refault無增量。Reviewer支持不為此單題盲加8CPU/RAM，未證未來worker併發擴容無效。清理空，result.json未落，case/trace保留；10707freeze、修改包101571及原G1全SHA/集合保全。新native RUN/d2；scripts/pagefind-d2-20261116；evidence/pagefind-d2-20261116。下一建議限時唯讀上游1.6.0/官方接口成本盤點，找不改必要語意/授權的可維護路徑；若需Rust/WASM fork則回選型，不無限深挖。D2 plan被freeze引用請保留bytes，狀態於交接/結果更新。未擴容壓測、未更新GitHub討論包。

**2026-11-16 選型重新聚焦：暫停下一項 Pagefind 上游/引擎優化。** 使用者質疑 SQLite/Pagefind 的 consumer API 負載與接回原BE/Gateway職責是否值得；本輪僅核對既有證據並請reviewer，沒有新實驗。SQLite K5 8CPU12GiB/8workers通過6search/s混合更新工作點，不是已測最大RPS；Pagefind D2為單一廣泛命中查詢5s截止，非RPS測試，故不寫兩者API必定不可用。主要新判斷是低總維運成本未證，移除BE與換搜尋引擎的代價要拆開；Gateway若可異地沿用可重用限流/身份等，不必全部搬到Next，仍須應用授權/併發隔離。建議把A（沿既有BE/Gateway/ES及必要DB）放回優先提案，C保留有條件備案；這是建議/研究優先序，不是使用者已正式定案或已證A最便宜。下一步建議用現行search→page→media路徑及部署/runbook盤點可沿用/需適配/新增責任，A缺證據不以B代替，也不再以更多引擎實驗代填。C重新投入需證明明確每站淨省且必要任務/維護可接受。使用者的條件式資源擴容授權保留，但目前不啟動。
