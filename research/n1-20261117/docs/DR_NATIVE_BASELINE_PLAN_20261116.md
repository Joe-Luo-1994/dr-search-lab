# N1：有限投入下的 SQLite／Tantivy 唯讀搜尋基準

## 2026-11-17 執行修訂（優先於下方原設計）

使用者已授權review修正後依gate執行。獨立review見DR_N1_DESIGN_REVIEW_20261116.md；以下關閉文字歧義，實際harness仍須於各gate前核對。

- R1：E兩引擎皆必須score排序後pageId升序tie-break；Tantivy原生DocAddress不能冒充pageId。L允許各引擎原生tie順序，須明示無total＋可能tie放寬，E/L差距不得全歸因count。SQLite可保留tie，沒有強制取消。跨引擎3/1僅代表title優先偏好，非相同BM25公式。
- R2：每golden列獨立expected eligible set/count、must-find、forbidden、expected fields與version；回傳數=min(10,eligible count)、pageId唯一、所有must-find全入Top10。百萬題也驗足額／唯一／授權／filter，不能只驗回傳項合法。增加非同分native score單調性與title boost案例，adapter明示score方向。oracle在reader配額外，generator驗證負擔須監測。
- R3：G3每任務記scheduledAt/sentAt/completedAt/deadlineAt；所有lane端到端deadline=scheduledAt+4秒。過期未發送記漏發／未完成，不追趕突發補送。暖機與測量分標籤，各階結束drain最多8秒；測量分母為預定到達數，完成歸原arrival window。漏發>1%判instrument-invalid，不判引擎容量失敗。單階外部deadline=60+300+8+30=398秒，baseline同制，更新階最多60+300+8+30=398秒；正式掛起由外部process group停止。
- R4：G2每block每shape warm3+measure30，共三block90正式樣本；兩引擎交錯順序。先兩引擎G1/G2，再4CPU E共同點；E未過且L有G2依據才進L，不預設全矩陣。進G3需G1全過、無未處理crash、G2每shape有4秒內完成樣本且無未釐清timeout；否則停止該配置。一次階段失敗即停止升階；只允許一輪明確bug修復的新attempt，耗盡預算列研究未完成。8CPU僅在資源壓力有證據時。每stage前檢查8h餘額可容納整stage；不縮窗湊結果。6h工程以session區間記錄並標並行agent時間不可相加當人時，無可靠計量則用兩項SQLite變更／單reader路徑／一次修復硬上限。

本輪G0/G1目錄使用20261117；原卡日期保留以便追溯。沒有授權推送新實驗結果；完成後先交付本機證據。

狀態：2026-11-16 設計稿，尚未實作／執行，尚未獨立 reviewer 簽核。使用者本輪授權設計；不由此啟動壓測或公開發布。這份卡承接 related work、外部feedback與既有K4／K5，取代「直接完整引擎矩陣」的方向。

## 要支持的決策

百萬頁、Web與consumer共用DR時，原生配置是否能讓SQLite以可接受維護負擔達成任務？若不能，Tantivy是否以有限新增工程換得有用的能力？研究結果是已探索配置的成本—能力集合，不是全域最優或正式容量承諾。A完整沿用仍是成本參照，B不代替A；本輪不新建ES對照、不重做Pagefind、不做全功能產品化。

成功不是一定選出勝者：若兩者均需要過多客製或未滿足必要任務，回到A也是有效結論。

## 固定契約與變體

| 項目 | 本輪約定 |
|---|---|
| 來源 | 沿用K5凍結百萬合成頁V1／V2及既有原始欄位，不修改原DB／證據；新引擎重新產製自己的索引，記來源hash |
| 搜尋 | title/body、相同中文切詞輸入與英文正規化、詞項AND、Space精確篩選、多Tags AND；索引／query兩邊token序列要有抽樣與golden斷言 |
| 授權 | 同一合成身份→allowed spaces oracle；在TopK前正確納入限制；未知身份拒絕。不是正式ReBAC驗收，真實網路延遲未知 |
| 回傳 | 最多10筆pageId、spaceId、title、必要tags、同規格摘要、snapshotId／dataAsOf；閱讀／附件沿用異地MinIO與canonical membership路徑 |
| 排序 | 原生BM25、title權重3/body1；兩引擎分數及順序不要求完全相同。結果皆須相關且授權正確。相同引擎等價最佳化須符合原契約；tie-break改動另標契約差異 |
| E：計數契約 | 回傳授權與filters後精確total，沿用現行研究行為；不宣稱已是consumer正式義務 |
| L：有限降級契約 | 不提供total欄位，不以0或不精確值冒充精確數；只保證第一頁Top10，不承諾深分頁或穩定跨頁排序。是研究提案，尚未批准正式降級 |

E/L之外不新增契約變體。取消total不能同時偷偷取消Tags、授權或降低必要命中。中文pretokenization是共同受控研究輸入；它有自己的維護責任，不宣稱能重現公司ES analyzer。

## 階段與進入條件

### G0：凍結、公平性與實作資格

主agent列版本、source hash、資料量／欄位、tokenization、查詢集合、資源accounting、輸出schema、oracle與限制。歷史小型fixture不可替代百萬資料；現有K4／K5只當既有觀察，不與新結果直接計算加速倍數。

Tantivy先確認可用穩定版本與可重現lockfile。選一個最小Rust binary，以有界本機IPC供Next呼叫，正式search reader不帶線上writer。避免新造Node native binding；不提供獨立對外API，不重做Gateway。binary封裝／啟動／crash／cancel／upgrade責任全部記帳。若必須自製引擎核心或大量不穩定binding才能滿足基本契約，停止進入下一階，不把採用資格不過寫成搜尋效能失敗。

SQLite與Tantivy均放在Next主事件迴圈之外；服務比較包住Next、child／Rust reader、queue與安裝程序，不能只限制其中一個process。不同worker與原生thread數可以不同，但必須固定、公開且受同總資源限制；最多試兩個有理由的併發preset。

### G1：合理原生配置與正確性

- SQLite S0：當前凍結SQL的本輪控制。S1：優先嘗試原生rank排序保留權重；先靜態／EQP核對，再跑。保留pageId次排序會否阻礙快路徑需記錄；不能為了快而默默移除。若需要移除，僅可列入L並明示同分次序差異。
- 索引統計／必要metadata索引可作第二項有文件依據的候選，與rank分開，最多兩項變更；每項記因果假說與結果。Contentless、大改schema、自製cache／分片均延後，不同時展開。
- Tantivy T1：原生indexed fields、結構化Space／Tags過濾、TopDocs／必要count；使用原生collector／query能力。記錄預設與實際thread、segment、stored-field設定，禁止針對凍結題目硬編結果。
- 先完成小型非重複golden語料：至少24個固定案例，含中／英／混合、title-only/body-only、零命中、長短詞組、全Tags AND、狹窄Space、身份拒絕及PDF抽取文字。各案例事前列must-find／must-not-find／授權集合。排名另列明確的已知文件任務：目標文件在Top10的成功率，不能以SQLite順序當Tantivy標準答案。
- 百萬九shape沿用K4，所有命中須符合獨立來源oracle；有大量同分時允許契約內合法Top10，不強求兩引擎相同ID。另加至少12題不同詞頻／長度／filter選擇性的固定probe，事前產生、不參與調校；它們只能補查詢覆蓋，不能讓重複合成語料變成真實語料。

任何未授權結果、錯版本、Tags錯誤、漏掉必須找到的golden案例立即停止該配置；修復保留原失敗與新attempt。純MATCH無排序只作診斷，不列為已滿足相關性任務的候選。

### G2：有界引擎測量，篩選進入服務階段的配置

新read-only索引先固定4CPU／8GiB總reader預算；同主機串行跑，不讓builder與測量重疊。build可用單獨4CPU／8GiB預算，記CPU時間、牆鐘、峰值記憶體、磁碟、索引大小與產製失敗。預算為研究提案，G0須重查本機餘裕。

各引擎最多選一個通過G1的原生配置，分E/L測量。保留S0少量同session控制以確認原生改動效果；不以歷史數值作分母。稀有／常見／Space／Tags／中文分層，不只報全體平均。

每shape先3次warm-up，再30次串行量測；三個block交錯引擎順序A-B／B-A／A-B，固定隨機seed。回報原始分布、p50及高分位的樣本數／不穩定性，這些不是API SLO。另記新程序第一次query，不稱OS cold cache；不清除宿主全域cache。引擎時間從reader收請求到完成搜尋，API時間另量，不能用兩者混算。

G2無洩漏／錯誤且仍有達標可能才進G3。不用「單題平均×RPS」推算容量；若保留契約的單題大幅超過研究deadline，停止升載並記原因。

### G3：共同工作點及一次更新

使用相同Next／內容路徑、相同總reader 4CPU／8GiB，MinIO另4CPU／4GiB，不超賣總主機記憶體。MinIO若有壓力則標為混雜因素，不能直接歸因搜尋引擎。

每個候選先測reading-only基線；再測兩階：W=Web搜尋4/s＋閱讀1/s；M=W＋consumer搜尋2/s＋下載2/s。這是沿用研究工作點，非已確認正式尖峰需求。

每階60秒暖機＋300秒測量；每候選3次測量，交錯順序、同seed排程與shape組成。只對通過W者測M；每lane獨立固定到達排程，不隨前一請求完成時間減慢發送。記offered、started、completed、rejected、timeout、generator漏發；延遲從預定到達計時，另拆queue／reader／內容組裝。每lane與query-shape分層報告，失敗不從分母消失，也不以快速拒絕美化成功延遲。

研究門檻：Web／consumer成功請求P95≤2秒；閱讀P95≤max(2×本輪合格baseline,500ms)，baseline本身≤500ms；下載P95≤2秒（固定附件組大小與完整收完bytes）；各lane未完成／錯誤≤1%，generator漏發≤1%。P99只描述，列樣本數；三次均通過才稱此工作點可重複通過，短時證據仍非長期容量。權限／版本錯誤零容忍。

只有4CPU配置出現CPU節流／queue等資源證據，且原生方案仍有維護收益，才測一個8CPU／12GiB preset；不另開多階找最大RPS。需重查host餘裕，MinIO預算另計，沒有餘裕就記環境限制。沒有資源瓶頸證據不盲擴。

對通過M的配置，做一次V1→V2更新：60秒背景後觸發，維持最多300秒更新觀察，須有下載／校驗／新舊reader重疊、明確啟用、舊reader退出，啟用後至少60秒請求。需要記全套index＋metadata傳輸／磁碟雙版成本，不能只比引擎檔大小。超過300秒記觀察窗內未完成，不擅自延長或稱違反正式RTO。Tantivy若未實作熱更新，結果只能列「搜尋候選、生命週期未完成」，不能借SQLite證據宣稱已可用。

## 投入上限、維護記帳與執行護欄

建議本輪最多6小時active工程投入：共同契約／harness最多2h，各引擎各2h；等待build／測量分列，缺可靠計時則未知。不是要求投入相同時間；兩者都可提前停止。G3最多4個配置（兩引擎×E/L）、每個最多一個條件式擴容，總執行牆鐘上限8h；達上限保留未測，不壓縮測量窗補完。

禁止新做分散式索引、自製ranking、query-result cache、針對題目的特殊分支、全新部署平台。需要這些才有希望時，轉為架構成本結論。維護帳沿用六工作包，分研究harness、一次性產品工程、共用builder、每站部署／更新／監控／故障／升級；記實際介入原因、未知owner／工時，不以LOC或部署數直接換算TCO。

執行前查實際RAM／disk／WSL配置／其他專案服務。新runtime與port獨立；不覆寫凍結輸入。預設新增產物60GiB、free disk至少30GiB、host MemAvailable至少1.5GiB；每5秒外部監控，任一限制或監控故障停止自身實驗。build每attempt45分鐘、query外部deadline4秒、測量階外部deadline明列；timer需能在同步搜尋不返回時停止reader。新舊reader、builder與下載解壓均列資源accounting。失敗保留，finally只清理本輪服務，不刪原證據。

## Review與交付

實作前需獨立review檢查：契約E/L有無偷換、oracle不依賴被測引擎、Tantivy採用路徑可維護、包含全服務資源、deadline可打斷、同分／中文／filters正確性、G3發送與失敗分母。此為待辦，不宣稱已審；分工為主agent持有契約及整合、可獨立指派兩引擎adapter、reviewer找反例，不讓各agent自行改SLO。

交付單一決策表：配置／契約 → 找得到哪些任務 → 固定資源可通過的工作點 → Web受影響程度 → 更新／恢復缺口 → 新增維護責任 → 下一步。附原始數據、版本／hash、失敗與未測。結論可為SQLite已足夠、Tantivy值得後續、僅L可行需討論降級，或兩者不值得取代A；不得聲稱已證優於完整A或正式ES等價。

參考：[既有K4](C_QUERY_COST_RESULT_20261116.md)、[K5](C_SCALE_PLAN_20261116.md)、[related work](DR_RELATED_WORK_20261116.md)、[feedback對照](DR_EXTERNAL_FEEDBACK_REVIEW_20261116.md)。原生能力依據：[SQLite rank](https://www.sqlite.org/fts5.html#sorting_by_auxiliary_function_results)、[Tantivy官方API](https://docs.rs/tantivy/latest/tantivy/)。官方機制不是本案效能證據。
