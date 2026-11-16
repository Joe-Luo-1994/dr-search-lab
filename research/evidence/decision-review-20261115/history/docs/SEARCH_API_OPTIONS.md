**2026-11-15 研究目標再確認（優先於下方歷史敘述）：** 使用者已將完整技術棧異地部署＋完整備份視為可行基準A；研究不是證明DR能不能做，而是找出滿足基本需求、整體成本更低且適合未來多處備援的替代方案。A維運較貴、B/C較省均待證，不預選SQLite。完整任務鏈是替代方案的資格檢查，不能單獨證明研究成功。下一步將A/B/C按相同需求比較可沿用能力、一次性改造、共用維運及每新增一處的資源／操作／consumer成本；若替代方案沒有足夠淨收益，沿用A也是有效結論。詳見[討論紀錄](../../../../frozen/native/docs/DR_DISCUSSION_REGISTER.md) F12及成本比較規則；未新增實驗或成本實測。

**2026-11-15 最新使用者決策（優先於下方歷史紀錄）：** 異地DR為fz1、fz2皆徹底不可用時的唯讀fallback；第一版獨立hostname、Web使用者手動換網址，公司導流／災難政策延後。快照沿用daily研究基準，每4小時為候選而非定案；不以零漂移作受控原型前置，仍保留Role／Space／media檢查。同步週期不等於實際資料age上限：失敗或主站無法產新版時，快照會持續變舊。後續優先驗獨立完整搜尋→閱讀／下載鏈、Tags／PDF／consumer與版本完整性，正式整合及風險門檻仍待證。詳見[討論紀錄](../../../../frozen/native/docs/DR_DISCUSSION_REGISTER.md) F09–F11與[readiness使用者補充](../../../../frozen/native/docs/DR_V1_READINESS_REVIEW_20261115.md)。本次未新增實驗。

**2026-11-15 第一版readiness更新：** 使用者已確認fz1／fz2平時均可用，fz1失效由DNS Team切至fz2；不可再視為冷副本恢復。新異地fallback觸發／owner仍待核對。[獨立readiness審查](../../../../frozen/native/docs/DR_V1_READINESS_REVIEW_20261115.md)裁定可進受控第一版整合，未達正式可切入；缺口G01–G07，三優先對口輸入為啟用責任、故障依賴、快照授權政策。已確認PDF文字在MariaDB、Tags metadata及Web highlight偏好維持；見[討論紀錄](../../../../frozen/native/docs/DR_DISCUSSION_REGISTER.md) F08/D21。重用MR1／S1-ES／L子證據，未新增實驗。

**2026-11-15 研究範圍收斂：** [獨立review](../../../../frozen/native/docs/DR_RESEARCH_SCOPE_REVIEW_20261115.md)支持以必要fallback任務驗收為先；[SQ計畫](../../../../frozen/native/docs/SEARCH_QUALITY_PLAN.md)已將全面ES對齊／多指標／benchmark降為條件式工具箱。保留中英文、PDF、Space／Tags與授權正確性及pageId鏈；不因多數成功抵銷必要失敗。使用者只確認fz1/fz2為兩處機房，cluster／共同依賴仍未知；沒有承諾故障短或正式擴大到全台斷網覆蓋。詳[討論紀錄](../../../../frozen/native/docs/DR_DISCUSSION_REGISTER.md) F06/F07、D02/D11/D12。此次未新增實驗，非owner採用批准。

**2026-11-15 最新需求與搜尋品質討論：** 先讀 [討論紀錄](../../../../frozen/native/docs/DR_DISCUSSION_REGISTER.md) F01–F05／D01–D20 與 [品質評估草案](../../../../frozen/native/docs/SEARCH_QUALITY_PLAN.md)。PDF抽取文字已在主站MariaDB可用；Web highlight為加分項，不等於consumer接受移除；中英文、Tags獨立metadata／AND、pageId銜接維持。集中建索引為工作方向，正式品質／ES契約仍未證。後續每輪引用相關問題ID、更新證據，其餘維持；不得將舊稿PDF來源未知當最新狀態。SQ計畫未執行，未改凍結實驗或新增DR實驗。

# DR 搜尋 API：功能、資源與總成本比較

## 共同產品標準優先於工具比較

本文件功能／資源比較受 `DR_PRODUCT_REVIEWER.md` v0.1約束。C1–C4每輪先映射價值ID與共同門檻，再比較各方成本。以下microbenchmark仍是局部證據，尚無候選通過完整產品門檻；RP0為後續新實驗的暫定靶點，不可追溯判舊結果通過。


2026-11-14。來源基底 c558a51。依使用者最新補充修正研究順序；本輪已做隔離合成 probe，尚未做正式 Next.js API／公司容量驗收。

## 決策問題與已接受前提

既有 consumer 原先呼叫 backend API，再由 backend 查 ES，取得頁面、內容、highlight 與跳轉連結。DR 不起原 backend 時，由 Next.js 承接此 HTTP 契約。優先減少新增持久化服務，但 Next.js＋廠區 ES 是必須保留的成本／功能對照，不能因先前「不新增 stateful」措辭就排除比較。

必要索引來源可以補入備份，是目前接受的可行性前提；不以 JSON／metadata 是否已備齊阻塞選型。只有發現不可備份、明顯昂貴或實際介面限制時，才升級成決策議題。授權仍是最終驗收必要條件；本輪可先用明示的 synthetic scope 測查詢與成本，與正式授權整合平行釐清。

DR 可以協議功能降級，但要逐項列明 consumer 成本。相同 URL／JSON 欄位不代表相同斷詞、排名、分頁、total、highlight 或錯誤語意。缺正式 API 範例時先用合成共同契約，不要求 consumer 為每個引擎改用不同 SDK。

## 目前候選與成本落點

| 候選 | 頁面／文字／URL／highlight | MinIO 與查詢的關係 | 主要新增成本與限制 |
|---|---|---|---|
| Next.js → 廠區 ES | 原生全文、highlight、篩選、排序等；沿用 analyzer/mapping 可減少語意差異 | 索引由 ES 節點服務；MinIO 備份不能直接代替活躍 ES data path | 額外常駐服務、磁碟、容量／健康、版本及備份恢復；仍需 Next API adapter 與授權，並非自動零 consumer 改動 |
| Next.js → SQLite FTS5 | 可回傳保存的本文／URL；原生 highlight()、snippet()、bm25()；可 SQL 篩選／分頁 | 版本化 DB 存 MinIO；先下載／驗證至可丟棄磁碟，再唯讀查詢 | 下載／切版／快取流程、中文 tokenizer；同步 DB API 對 Next event loop 影響；不需要另一個 DB daemon |
| Next.js → Pagefind 1.6.0 | 本輪原生 Node 已回傳 content／URL／英文 `<mark>` excerpt；中文字與瀏覽器有反例 | bundle 存 MinIO 已有 PF02；本輪 Node 查詢讀 loopback HTTP 片段，兩條路徑尚未整合 | generated module 與版本配置適配、中文語言初始化、片段請求與 cache；需實測 Next 打包、並發、多身份隔離，不能把 browser 成功視為已完成 server API |
| Next.js → MiniSearch 7.2.0 | 搜尋＋保存內容／URL；本輪不實作 highlight，回傳 null | 序列化索引存 MinIO；本輪整份讀入記憶體 | RAM／載入／更新雙版本峰值；中文斷詞及摘要／highlight 要自行補，prefix／fuzzy 能力存在但與 ES 不同 |

Orama 已有歷史 adapter，可在上述候選出現明確缺口時補入，不先擴成所有工具競賽。Meilisearch／Typesense 仍是獨立服務，不因換名稱就消除持久化維運。

SQLite「按需讀取」要拆清楚：本輪是 OS 從本地唯讀檔按頁載入，不是原生 SQLite 對 MinIO URL 查詢。HTTP Range／自訂 VFS 是額外方案，需要另一筆整合、快取、一致性與請求成本證據，不列為已成立能力。Pagefind 的 MinIO 索引片段亦不代表零 Web RAM 或零網路成本。

## 本輪直接證據 A：Pagefind 原生 Node，不用瀏覽器代跑

對既有 100 頁合成 bundle，用未修改的 generated `pagefind.js` 在 Node 22.21.1 執行 4 個 query，資產由 loopback HTTP 服務；沒有 document/window polyfill、headless browser sidecar 或原始碼 fork。Node 與 browser 另各執行一次相同 4 題。

- Node 搜尋英文 backup 得34筆；技術碼得1筆，皆有 `<mark>` excerpt、content、URL；錯字 bakcup 得0筆。
- 同一索引「資料庫備份」：Node 1筆 p07，excerpt沒有mark；browser zh context 3筆 p07/p02/p01，有mark。這是已重現的差異，不接受為正式降級、不偷偷改 expected。
- 原始碼的非browser分支、language偵測／loadedLanguage與 CJK segmentation 提供調查線索，但本輪沒有完成根因與修正驗證。不能用新合成資料上的成功抹除此反例。
- 初次使用文件示範的 bundlePath，在此 Node 載入方式下嘗試 file URL 而 fetch失敗；改用此版本 generated module 的 basePath 後成功。失敗stderr及空結果保留，這是 probe 配置修正，不宣稱首次直接成功。

**推論邊界**：可保留 Pagefind 作 server API 候選，不再預設只能瀏覽器查詢。仍不是完整 Next route／MinIO Node 查詢／正式授權／長期 API 支援契約的驗收。官方 npm Node API 主要描述建索引；本輪查詢用 generated module，兩者不同。

## 本輪直接證據 B：1千／1萬頁的有界資源觀察

同一 deterministic synthetic corpus，約1 KiB JSON／頁，10,000頁總 JSONL 10,182,592 bytes；內容含英文、中文、技術碼、2,000個重複詞彙、97個topic與4組scope。是高度規律的小文本，不是公司正式資料分布。每個 engine／count 的 builder與reader用不同 Node子程序；8題、16次warmup、200次循序計時。SQLite 3.50.4、MiniSearch7.2.0、Pagefind1.6.0；Node22.21.1。

### 10,000頁觀察（不是硬體需求下限）

| 設定 | 索引／bundle MiB | reader程序峰值RSS MiB | 開啟／載入 ms | 首次查詢 ms | warm混合題P95 ms |
|---|---:|---:|---:|---:|---:|
| SQLite unicode61 | 15.73 | 31.1 | 0.8 | 19.9 | 23.42 |
| SQLite trigram | 35.53 | 31.9 | 0.8 | 25.8 | 36.33 |
| MiniSearch default | 18.69 | 261.9 | 338.6 | 19.3 | 14.12 |
| Pagefind native Node | 5.77 | 131.8 | 47.4 | 226.8 | 86.24 |

1,000頁的同序觀察：索引1.52／3.57／1.81／1.09 MiB，reader峰值30.9／31.0／94.0／76.9 MiB。完整建置時間、原始latency樣本、結果與stderr見 evidence。

**不能據此排名或開正式規格**：

- 工作量不等價：SQLite計total、排序且產生highlight/snippet；MiniSearch不產生highlight；Pagefind取top10 fragment，並包含同程序loopback資產server。各自排序及斷詞不同。
- RSS含Node但不含Next基底、OS page cache或完整容器成本；builder RSS尤其不代表Pagefind native子程序總記憶體。沒有CPU配額、並發或OS冷cache驗收；沒有MinIO網路、正式授權、真實content fetch。
- 使用512MiB V8 old-space上限僅約束JS heap的一部分，不是512MiB容器限制。不能以31MiB RSS宣稱SQLite只需32MiB pod，也不能將此P95當HTTP SLA。
- 10,000頁新fixture中多數常用詞命中7,500筆，返回10筆；有短中文未命中的引擎，因此全題P95不是相同功能的速度競賽。看體積／載入／資源型態與功能缺口，之後才做等價任務壓測。

### 同時量到的功能差距

| 查詢／期望（ops scope） | SQLite unicode61 | SQLite trigram | MiniSearch default | Pagefind Node新fixture |
|---|---:|---:|---:|---:|
| backup／7,500 | 7,500 | 7,500 | 7,500 | 7,500 |
| ERR_CONN_RESET／7,500 | 7,500 | 7,500 | 7,500 | 7,500 |
| 資料庫備份／7,500 | 0 | 7,500 | 0 | 7,500 |
| 備份／7,500 | 0 | 0 | 0 | 7,500 |
| topic42／77 | 77 | 77 | 77 | 77 |
| 不存在詞／0 | 0 | 0 | 0 | 0 |

SQLite trigram改善本例較長中文字串，但二字詞MATCH無結果，且artifact較大；這是具體成本與缺口。需比較預斷詞、自訂tokenizer或明示降級，不推論trigram全面解決中文。MiniSearch也可配置tokenizer，但本輪預設結果不是修正後能力上限。Pagefind新fixture中文通過不抵銷前述既有fixture的Node/browser反例。

SQLite與Pagefind的highlight輸出需映射至既有API欄位並處理安全rendering；不可將可插標籤等同任意內容已HTML escape。正式fragment切分、標籤、命中offset語意待契約測試。

### ES 的量測缺口

歷史 Lab 配置每ES節點512MiB heap，不是總RSS或最低需求；歷史50次微測的Node RSS明確不含ES server，因此不拿來與上表比較。官方建議heap不超過可用記憶體50%，同時需要off-heap與OS filesystem cache；這也不是固定硬體最低規格。本輪沒有新的同資料ES量測，不能聲稱嵌入式在同功能／同SLO下必然省多少倍。

## 下一輪：把「功能差異」轉成「可接受成本」

1. **C1：共同Next HTTP契約＋差異清單。** 先以合成request/response固定query、scope、pagination，回傳page ID/title/content/URL/highlights/total；各引擎經adapter輸出同形狀。拿到真實API後替換契約。完整內容可由版本化JSON供應，不要求搜尋引擎原樣保存所有JSON。逐題記「原生支援／adapter補足／需降級／未完成」。Pagefind優先確認Node語言差異、Next打包及並發，SQLite優先量中文策略。這輪可用合成授權介面，不等正式GM串接才開始。
2. **C2：MinIO載入與替換Web。** SQLite/MiniSearch測完整下載、hash、切版與可丟棄cache；Pagefind把本輪Node路徑接到既有真實MinIO probe。記錄冷啟動、GET/HEAD/bytes、RAM／暫存峰值。僅在全下載實測不合預算時再投入Range/VFS，避免先承擔不必要的客製維運。
3. **C3：等價任務與資源包絡。** 所有候選使用同一允許降級清單，再比較1k/10k/100k頁、短頁/長頁、併發1/5/20、搜尋＋閱讀／下載混合流量。數值是探索格點不是公司容量承諾；有限timeout及預算，超限即記錄。依序探索，不能全組合無限跑。ES同fixture的server RSS／CPU／磁碟與Next adapter一併計入；嵌入式也計Next增量及cache，不只比較engine RSS。
4. **C4：發布故障與接手。** 沿用S2/S4的中斷、缺物件、重啟、舊版保留與他人操作，正式授權在此之前接通並驗證。成本包括建置／發布、監控、資料新鮮度、回退與清理、漏洞更新、consumer接入及雙版本峰值，不只數服務個數。

停止／轉向依據：固定投入上限內無法接通必要API，或必需語意只能以大量自製邏輯補足，就列缺口請對口選擇降級／調預算／保留ES。不得代替consumer同意缺highlight或不同排序；也不得以未知量級阻止先量測可行範圍。正式資料不可備份／昂貴僅在有證據時升級。

## 本輪失敗、證據與重播

- `evidence/search-api-options-2026-11-14/` 保存官方來源URL/hash／摘錄、Node/browser反例、容量原始結果、summary與checksum。
- 首輪Pagefind capacity builder的filter使用string而Node建索引介面要求array；兩個count都失敗。保留 `capacity-attempt-1/` 與原harness；只修測試harness的型別並重跑Pagefind，不重跑已完成SQLite／MiniSearch。此失敗不能歸因為引擎容量不足。
- 官方SQLite網頁被網路政策拒絕、一次官方文件鏡像路徑404，記錄保留；用官方SQLite source與實際執行核對函式能力。
- 新產物只寫隔離 `.lab/search-api-options/`；未重建既有fixture／Next build／ES索引，未啟動ES、正式Next或公開服務。探針loopback服務結束即關閉。

```bash
export PATH=/workspace/toolchains/node-v22.21.1-linux-x64/bin:$PATH
# default output only for an explicitly new evidence run; use PROBE_OUT to avoid overwriting history
PROBE_OUT=/tmp/new-capacity-evidence node scripts/search-api-options/capacity.mjs
node scripts/search-api-options/pagefind-node.mjs /path/to/existing/synthetic/bundle-parent
PLAYWRIGHT_BROWSERS_PATH=/workspace/playwright-browsers node scripts/search-api-options/browser-parity.mjs /path/to/same/bundle-parent
```

官方依據（讀取來源及hash另存）：
- [Pagefind search API](https://pagefind.app/docs/api/)：result.data()、URL與marked excerpt。
- [Pagefind Node API](https://pagefind.app/docs/node-api/)：建索引與custom record。
- [Pagefind v1.6.0查詢原始碼](https://github.com/Pagefind/pagefind/blob/v1.6.0/pagefind_web_js/lib/coupled_search.ts)：非browser分支、語言與分片載入；實測對應版本。
- [SQLite FTS5](https://www.sqlite.org/fts5.html)；[官方輔助函式原始碼](https://github.com/sqlite/sqlite/blob/master/ext/fts5/fts5_aux.c)：highlight、snippet、bm25。本輪網頁無法讀取，不冒稱查閱成功。
- [MiniSearch](https://github.com/lucaong/minisearch)：in-memory、可配置tokenizer、prefix/fuzzy。
- [Elasticsearch JVM設定](https://github.com/elastic/elasticsearch/blob/main/docs/reference/elasticsearch/jvm-settings.md)：heap及其他記憶體成本。
