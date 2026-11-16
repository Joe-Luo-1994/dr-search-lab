# SQ：搜尋品質與 ES 差異的評估草案

## 目前優先範圍：必要 fallback 任務驗收（2026-11-15 收斂）

使用者質疑全面ES品質比較對災難fallback是否值得；獨立reviewer支持縮減第一版研究。裁定見 [範圍審查](DR_RESEARCH_SCOPE_REVIEW_20261115.md)。以下是研究工作優先度調整，尚非正式產品降級或owner批准；沒有新增實驗。下方原SQ全套方法保留為條件式工具箱，不是第一版全部必做清單。

**本輪要回答：以可承擔的維護成本，必要文件能否在DR被找到並開啟？** 不以完整ES等價或每個差異都解釋完畢作前置條件。

第一階段只做：

1. 凍結一組代表任務及獨立預期pageId：title／正文、中文短詞／長詞、英文／混合、技術碼、PDF-only文字、Space、Tags AND，並有干擾／負向案例。20–40題是先前量級建議，不是硬性額度；必要覆蓋比題數重要。
2. 每題判定任務可完成：候選標準為目標頁在第一頁可辨認，點pageId可開正確內容；需要檔案的案例能授權下載。每頁筆數、可接受等待及必要任務需於新卡事前固定；不是已接受SLO。
3. 未授權結果、錯頁、Tags AND錯誤、錯版本或錯誤偽裝無結果不能用總成功率抵銷。必要任務漏找須修補或由受影響對口接受具體替代方式；「多數可搜」本身不是採用門檻。
4. ES-reference僅做同題任務對照：兩者各自可／不可完成、可見差異及影響；不要求命中集合／順序完全一致。不等待正式ES資料才驗合成路徑，也不把reference說成production。
5. 一頁結果與失敗卡：必要案例結果、第一頁成功觀察、已知限制、修補／維護成本與下一個決定。合成通過只支持內部提案／試用；正式consumer接受另驗。

**暫不做**：nDCG／MRR／Precision／Recall／Overlap全套報表；全面tokenizer、詞典、trigram、權重組合探索；公共benchmark、大規模分級標註與統計顯著性；完整ES行為仿真。保留小型獨立／未針對調參的反例，避免只證明作者寫的happy path，不需先建立完整相關性研究平台。

**停止搜尋研究**：必要案例符合預定條件，已知降級明示且沒有未解、會改變選型的搜尋缺口，即轉向真Next／consumer鏈、發布／切換與非作者接手。保留案例作回歸，不為補齊理論繼續調參。

**條件式加深**：必要中文／技術碼系統性漏找、需頻繁改寫查詢、consumer依賴不支援行為，或修補開始累積自有斷詞／詞典／評分負擔時，才啟動對應SQ診斷；若修補成本可能高於沿用A/B，直接比較沿用，不預設SQLite必須救到等價。

DR持續時間未承諾上限；兩處機房不代表已證獨立cluster或短故障。長時間仍只需既定唯讀能力時，輕量方案可能足夠；寫入、時效、必要功能或相容性承諾超出其能力才觸發更完整架構評估。最低安全／資料一致性／可恢復性不因縮小搜尋研究而刪除。

---

## 保留的方法工具箱（原草案；依上述觸發條件選用）

2026-11-15。依 [需求與討論紀錄](DR_DISCUSSION_REGISTER.md) F01–F05／D09–D16。計畫尚未執行；案例、預算與門檻須在新實驗卡凍結。本次只記錄與設計，不新增 DR 實驗，不宣稱真人品質已成立。

## 要分別回答的兩個命題

- SQ01 絕對品質：使用者基本任務能否完成？答案來自獨立相關性判定、必要文件與行為底線，不以ES輸出自動產生標準答案。
- SQ02 相對差異：相較ES-reference／之後ES-production，哪些查詢變好、變差、漏找或只改排序？ES是對照組，不是唯一真值。正式配置仍未知。

兩者交叉解讀：和ES一致但都漏必要頁仍不合格；與ES不同但相關頁排更前可能改善。API相容性另評，不能用相關性進步掩蓋consumer欄位／分頁破壞。

## BM25 與文字分析

BM25是詞彙相關性評分：結合詞頻（收益遞減）、詞在語料中的稀有程度與文件長度校正。不是語意理解，也不負責把未被query匹配的文件找回來。Title加權、query組合、token統計與不同實作使SQLite和ES即使都叫BM25，也不能比較原始score數字或假設排名一致。

SQ03 對齊順序：同版來源與抽取文字 → 字元正規化／token與位置 → 查詢AND/OR/片語/欄位語意 → Space/Tags與授權 → 評分／title權重 → excerpt／API輸出。逐層定位差異，不同時調多個變因。

ES可用_analyze觀察指定field/analyzer的tokens；SQLite需記錄前處理輸出及實際FTS詞彙／位置。最新L已有Intl.Segmenter('zh-Hant')中文前處理，建置與查詢均使用；它不是SQLite內建中文語言模型，也非與公司ES等價證據。固定Node／ICU／SQLite／ES、source／extractor／query版本。

可比較的SQLite選項：現行分詞前處理、特定規則或詞典、trigram／其他候選。每個選項列中文短詞、技術碼、詞邊界、詞頻／長度改變、highlight位置映射及索引大小。trigram歷史長詞成功／短詞失敗保留，不當通用中文解方；擴充自製規則的維護成本算入C。

## SQ04：測試集設計

業界方法是文件集合＋查詢／資訊需求＋相關性標註（qrels）。借用方法與指標，不把通用英文benchmark成績當公司中英文、Space／Tags／PDF任務的採用保證。

第一階段建議少量有代表性的固定案例（例如20–40題，僅規劃量級），小語料可完整標註；再加入具代表性的干擾文件，與後續容量語料分開。正式／去識別查詢取得後另建真實保留集，不能拿合成case替換成正式接受。

每case記錄：ID、使用者任務、query、來源snapshot、identity／可信Space集合、requested Space、Tags AND、預期必要pageIds、禁止pageIds、相關程度與理由、可接受差異、來源欄位（title/body/pdfExtract）、語言、已標註覆蓋率。相關性0=無關、1=部分有用、2=直接有用、3=目標答案可作草案；尺度需先固定並保留分歧，不宣稱使用者已接受。

| 族群／教學案例（未執行） | 預期要證明的事 | 必要干擾／反例 |
|---|---|---|
| 已知頁：設備A備份SOP | 目標page在前幾筆，點pageId回正確內容 | 同詞但不同設備、過時草稿、只有正文偶然提及 |
| 中文長／短詞：資料庫備份、備份 | 依明定語意找回相關頁；比較token差異 | 相似詞、無關備份種類；不預設部分字串都應命中 |
| 英文與中英混合：database backup、資料庫 backup | title/body混合匹配；空格AND/OR先定契約 | 只含一詞、其他語意；不預設跨語言翻譯等價 |
| 技術碼：ERR_CONN_RESET | 正確代碼目標頁；底線／標點不默默改成錯的任務 | ERR_CONNECTION_RESET等近似碼是否匹配需另定 |
| PDF-only詞：pumpseal42 | 詞只在MariaDB存的PDF抽取文字，結果指向該pageId | title/body都沒有此詞，避免測錯欄位；正確media關係 |
| Tags AND：ops＋approved | 同時具有兩tag才合格，即使正文無tag字串 | 只有一tag；正文寫approved但metadata沒有 |
| Space及權限 | requested∩authorized，hit/total/excerpt均不洩露 | 權限未知、頁面移Space、撤權、同名頁不同Space |
| highlight與閱讀 | 有highlight時位置、欄位、安全render正確；pageId銜接 | 長文、跨Lexical node、中文前處理偏移、HTML字元 |
| 無結果／失敗 | 合理無結果可辨識，timeout不是偽裝無結果 | 查詢錯誤、來源缺失、版本不合 |

Golden cases同時包含正向與反向，不只幾個容易成功的demo。詞面相近但屬同一意圖的變體應分在同一資料分割，避免調參集與保留集洩漏。

SQ05 標註治理：合成文件可由設計的獨立oracle確認事實；真人相關性由domain reviewer抽查／定義，隱藏引擎來源判斷ES與SQLite候選聯集，另加已知必要頁與干擾頁。LLM可草擬、分類或找漏項，但LLM單獨標註只叫暫定標註，不當真人接受。未知相關性不能直接算無關；同時回報unjudged比例，必要時補標。

## SQ06：量測與裁定

| 指標／檢查 | 對人的意義 | 邊界 |
|---|---|---|
| 必要案例／安全不變量 | 正確page、Space與Tags；不能越權或混版 | 經案例契約明定的必要項逐項過關，不用平均相關性抵銷 |
| Success@5（候選cutoff） | 前5筆至少有一個可完成任務的答案的查詢比例 | 5是研究起點不是業界通用門檻；以任務定義「有用」 |
| MRR@10 | 第一個相關答案排多前；名次1得1，名次5得0.2，10內無答案得0，再平均 | 對單一目標查找有用，不描述所有相關文件的完整性 |
| nDCG@10 | 直接有用的答案是否排在部分相關／無關答案前面 | 要graded qrels；固定gain／discount慣例；沒有相關答案的題單列，不默默混入 |
| Recall@k | 已知應找回的相關頁有多少在前k | 小完整標註語料才可算完整範圍recall；大語料pool不完整只能報已標註集合recall與限制 |
| Precision@k（輔助） | 前k結果的相關比例／雜訊 | 固定不足k筆的計算方式；不能把未標註頁默認無關 |
| ES差異／Overlap@k | 結果集合與排名改變多少 | 相似度不等於品質；逐題列SQLite獨有、ES獨有及其相關性 |
| p95／錯誤率／build及資源 | 找得對之外，是否可用、是否值得維護 | 同契約同負載分開量；原始BM25 score不跨引擎比較 |

先凍結開發／調參與保留評估集，調整後不反覆偷看保留集求好分數。報每題及語言／任務子群，列退步案例，不只報總平均；若樣本支持，提供成對差值不確定性，避免小樣本宣稱普遍優越。

品質採用門檻目前未定。可提「必要任務全過＋關鍵族群不得出現不可接受漏找＋排名指標相對退步容忍範圍」，但容忍值必須以使用情境及對口接受決定。不存在nDCG超過某固定值就保證公司可用的通用標準。也不能只相對不輸一個本來不佳的ES就稱絕對足夠好。

## 每次報告交付形狀

每題卡片：query／identity／Space／Tags → 必要page與判定理由 → ES top-k／SQLite top-k → 哪些漏找或排名變動 → token/查詢/篩選/排名原因 → 對使用者影響 → 修補與維護成本。總表包含子群品質、失敗案例、未標註率、成本；能點回原始結果與固定設定。

對外說法用填值模板，非目前結果：在[固定來源/案例集]中，[必要任務完成數]、[前5筆成功率]、[分語言nDCG]；相較[ES-reference/production]有[退步/改善案例]；[正式未知]。不說「搜尋品質達95%」這類未定義百分比。

## 官方／研究方法來源（2026-11-15查核）

- [Elastic BM25與排名](https://www.elastic.co/docs/solutions/search/ranking)
- [SQLite FTS5／BM25／tokenizers](https://www.sqlite.org/fts5.html)
- [Elastic _analyze](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-analyze)
- [Elastic ranking evaluation](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-rank-eval)
- [NIST TREC relevance judgments](https://trec.nist.gov/data/reljudge_eng.html)
- [TREC test collection三要素](https://trec.nist.gov/pubs/trec30/papers/Overview-2021.pdf)

採用這些方法不代表本研究已通過TREC或任何正式認證；也不代表公司ES已啟用某種語言／同義詞設定。
