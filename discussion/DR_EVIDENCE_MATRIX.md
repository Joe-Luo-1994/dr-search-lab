# DR 決策證據與未知矩陣

2026-11-17｜[回決策摘要](DR_ARCHITECTURE_DECISION.md) · [會議指南](DR_TEAM_DECISION_GUIDE.md)

這份矩陣區分「足以支持試點」與「正式採用已驗收」。各列 owner 是建議角色，尚未代表公司已指派。

## 來源索引

以下連結鎖定已發布 commit，不用隨分支變動的歷史結論。原始檔細節在 archive 中；展開報告內的部分相對連結須解壓完整包後使用。

- **N1**，commit `7a08707ed3eedd675c805b8eaa5cf06b0feec9ab`：[結論](https://github.com/Joe-Luo-1994/dr-search-lab/blob/7a08707ed3eedd675c805b8eaa5cf06b0feec9ab/research/n1-20261117/docs/DR_N1_OUTCOME_20261117.md)、[review](https://github.com/Joe-Luo-1994/dr-search-lab/blob/7a08707ed3eedd675c805b8eaa5cf06b0feec9ab/research/n1-20261117/docs/DR_N1_POSTREVIEW_20261117.md)、[原始資料與程式包](https://github.com/Joe-Luo-1994/dr-search-lab/blob/7a08707ed3eedd675c805b8eaa5cf06b0feec9ab/research/n1-20261117/source-and-evidence.tar.gz)。包內：`evidence/n1-native-20261117/formal-summary.json`、`g3a-sqlite-attempt3/summary.json`、`g3a-tantivy-attempt1/summary.json`；runtime／loader 在 `scripts/n1-native-20261117/`。
- **R0**，commit `a42b8664be76558c6aedfaeffdc3918b7269114e`：[結論](https://github.com/Joe-Luo-1994/dr-search-lab/blob/a42b8664be76558c6aedfaeffdc3918b7269114e/research/r0-20261117/docs/DR_N1_R0_INTEGRATION_RESULT_20261117.md)、[原始摘要](https://github.com/Joe-Luo-1994/dr-search-lab/blob/a42b8664be76558c6aedfaeffdc3918b7269114e/research/r0-20261117/evidence/r0-release-20261117/integration-20261117-101241/review-summary.json)、[原始資料與程式包](https://github.com/Joe-Luo-1994/dr-search-lab/blob/a42b8664be76558c6aedfaeffdc3918b7269114e/research/r0-20261117/source-and-evidence.tar.gz)。包內 `scripts/r0-release-20261117/` 的 `installer.mjs`、`publish.mjs`、`runtime/{pool,service,storage,metadata-worker,preloaded}.mjs`、`formal_recreate.py` 對應以下實作判斷。
- **F1–F7 原始碼審查**：[公開 issue 回覆](https://github.com/Joe-Luo-1994/dr-search-lab/issues/1#issuecomment-6937354435)，列上述 R0 檔案與行號；10份來源 hash 對上已發布版本。這是 source review，不是新整合測試。
- **C1**：[公開設計卡](https://github.com/Joe-Luo-1994/dr-search-lab/issues/1#issuecomment-6937733220)、[公開結果敘述](https://github.com/Joe-Luo-1994/dr-search-lab/issues/1#issuecomment-6940031342)。**原始程式／結果 local/unpublished，無可獨立存取的 C1 commit。** 本機對照：`docs/DR_C1_CAPACITY_RESULT_20261117.md`、`evidence/c1-capacity-20261117/integration-20261117-120451/{audit.json,native/capacity-summary.json,native/fault-result.json,result.json}`。這些是定位字串，不是公開證據連結；本包不把 issue 敘述等同原始資料獨立審核。
- **本次範圍及修正依據**：[reviewer 要求](https://github.com/Joe-Luo-1994/dr-search-lab/issues/1#issuecomment-6940475924)。產品需求來自目前討論，未冒充已簽核需求書。

## 本次範圍調整

依[Active凍結工作假設](https://github.com/Joe-Luo-1994/dr-search-lab/issues/1#issuecomment-6941087832)，A與C都按待命準備→災難啟用→持續唯讀→切回比較，待團隊確認。核心是Active正確性／可用性與待命良版可復原；在線更新僅在新增需求下重開。最小良版機制見[架構提案](DR_ARCHITECTURE_DECISION.md)，尚未實作或驗證。

## 狀態怎麼讀

**已證（測試範圍內）**＝合成契約成立；**可接受降級候選（待批准）**＝產品選擇而非既成事實；**試點／採用門檻**＝缺少會妨礙安全採用的證據；**影響決策的未知**＝答案可能改選；**選配最佳化**＝不預設成阻擋條件。同一需求可同時有已證部分與未過門檻。

## 搜尋與使用任務

| 需求 | 候選機制／精確來源 | 已觀察及限制 | 狀態 | 決策影響；owner／最低成本釐清方式 |
|---|---|---|---|---|
| 中文／英文找得到、相關性足夠 | N1 G1 source oracle；G2 21題，typed query／tokenizer | SQLite128、Tantivy64合成案例通過；不是業務 golden set，不代表 ES 相同召回／排序 | 已證（合成）；試點門檻（品質） | Product／搜尋owner提供少量必找、不能漏、常用查詢及預期文件；先人工對照，不做學術全面排行 |
| 稀有／常見詞，BM25／Top-K | N1 `formal-summary.json`；E精確total＋pageId tie | S1常見詞P95約825–850ms、長詞組1659–1682ms；T約7.86–8.08／12.62–12.68ms。原生串行基準含IPC／分詞位置差異，非HTTP旅程；不能算純引擎倍率 | 已證（此配置）；降級候選（total/tie）；無tie Top-K屬選配研究 | API owner先回答是否需要exact total／穩定tie。BM25是詞項相關性計分，不是「品質已好」證明；不同分析／字段設定可改排序 |
| title／body與PDF抽文 | N1 G1；使用者確認MariaDB可供PDF抽文 | title/body合成檢查成立；名稱含pdf的query不是PDF抽取鏈驗證 | 已證（合成）；試點門檻（來源） | Backend核對export欄位／抽文成功與缺漏；以一個PDF實例追來源，不新增效能矩陣 |
| Space、Tags AND | N1 G1/G2、R0 runtime query與metadata | 合成篩選通過；tags是page metadata；未證公司索引與權限欄位契約 | 已證（合成）；試點門檻 | Backend提供schema與篩選範例，核對空tag、多tag與跨Space案例 |
| highlight／沿用ES體驗 | [H1公開程式與案例](../research/h1-highlight-20261117/README.md)，Tantivy0.27官方SnippetGenerator | 20題搜尋判斷全符、highlight整體16通過／4失敗：中文3、組合音標1搜到卻摘要空白。現行預切詞與snippet analyzer不一致；英文resident batch10成本已測，但未接API，不代表正式延遲。ES analyzer仍未知 | 已證（限定案例及失敗）；highlight為選配，若升為必需則需先修正語意一致性 | Product先看案例確認價值；若值得，才有界驗同語意原文offset接合。不能以title-only直接解決中文，也不以另換分詞器繞過失敗 |
| 正文、附件全部可達 | R0 installer／service／storage；N1與C1 hotset | V1正文256／V2 257、8附件；百萬index不代表完整body。PoC manifest≤1MiB、remoteObjects≤10,000、檔案buffer≤8MiB | 試點／採用門檻 | Backend／資料owner給實際數量／大小與coverage清單；先做匯出契約盤點。這些是自製PoC限制，不是Tantivy/MinIO上限 |
| Web流程與API consumer | N1 G3a loader、R0 service；C1本機HTTP | SSR→search與API已測；沒有完整browser/editor體感、正式API相容／gateway驗收 | 已證（HTTP）；試點門檻 | Web／API owner各給一個真實旅程與request/response；確認錯誤、pagination、驗證與速率治理，不能只看endpoint可呼叫 |

## 權限、發布與復原

| 需求 | 候選機制／精確來源 | 已觀察及限制 | 狀態 | 決策影響；owner／最低成本釐清方式 |
|---|---|---|---|---|
| ReBAC／撤權／stale ACL | R0 `runtime/service.mjs`；Page→Space→media membership | 合成身份通過，非正式ReBAC；舊snapshot的搬頁／撤權與即時Role資料可能不一致；UNKNOWN不可當ALLOW | 試點／採用門檻；降級候選僅限經批准時差政策 | Security／ReBAC／Backend一起走查撤權、搬頁、無法查詢三例。增加同步頻率減少窗口，不自動解決錯誤授權 |
| immutable build與publish | R0 installer/publish/preloaded、F1 source review | hashes、來源lineage、Node/ICU/binary相容已有檢查；publisher依uploads清單，壞V3仍可「發布成功」再被installer拒絕。C1完整pre-deploy gate未執行 | 已證（安裝拒壞）；試點門檻（發布核准） | Release owner定義權威manifest、全部引用覆蓋與核准流程；先review既有流水線。hash驗位元不等於驗發布者，簽章／IAM信任政策尚未驗 |
| fixed Pod／待命更新策略 | R0 `formal_recreate.py`實際Recreate；094213雙Podguard停止 | 冷啟／替換已驗，兩Pod及RollingUpdate未驗；Recreate由本機限制選定。待命重啟可能足夠，不保證一直有可用Pod | 已證（Recreate）；待命恢復為核心門檻；RollingUpdate僅條件式 | Platform先確認待命更新可否重啟及RTO；僅在軟體／安全部署或新需求要求共存時評估surge，不預設雙Pod採用門檻 |
| 跨版本請求與409 | R0 service固定版本URL；正式101241 | 31個409（17更新＋14回滾）；舊URL未靜默讀錯版。Active凍結不需要例行V1→V2路由，但入口切換／舊連結仍可能不符版本 | 已證（拒舊）；錯內容防護為核心；在線更新路由條件式 | Web/API owner按實際啟用／切回旅程定義舊連結錯誤與提示；不預設雙版服務或dual-pool。409體驗若會遇到仍待確認 |
| 更新／壞版／回滾 | R0 101241原始摘要 | 1377＝839成功＋507停機失敗＋31拒舊；0漏發/錯內容。更新失敗取樣14–15秒；壞版136–137秒。C1混載更新未跑 | 已證（低頻Recreate）；Active在線更新非預設門檻 | R0冷安裝、拒壞、回滾可支持待命復原提案，但不能代證災難中斷更新。507失敗仍是失敗；不將其視為Active可接受停機 |
| 待命更新中遇到災難 | R0 installer／rollback是部分依據；完整啟用互斥未驗 | 遠端核准≠已安裝ready。提案保留異地良版pin、image與全部引用產物，promotion成功後才原子更新紀錄；啟用時先停止並阻擋更新者，再選良版、必要時重裝／驗證／導流 | 核心試點／採用門檻；設計提案未完成 | Release擁有驗證與良版紀錄、Storage擁有保留、DR/Platform擁有互斥／啟用。先用既有流水線/runbook走查候選下載中、舊Pod已停、ready未提交三個中斷點；無良版應明確失敗，不自動核准候選 |
| RPO／RTO／持續DR | R0 apply→ready 23.40秒冷啟；每日同步／1小時為工作假設 | 不含來源匯出、跨區同步、發現災難、DNS／人工與建置；C1 900秒hold中止，不能宣稱長期運作通過 | 影響決策的未知；採用門檻 | DR owner區分來源時間/RPO、啟用下載重啟導流/RTO及凍結後增長的資料年齡；確認主站可用且切回後才恢復更新。持續時間無一小時上限；是否補hold依實際服務時間／資源風險，不自動續跑 |
| MinIO相依性 | R0 remote body/media及immutable包；C1下載混載 | C1 2/s mix平均payload3.5625MiB/s，並非網路上限；本機不證跨區耐久、帶寬、憑證或獨立故障域 | 已證（本機）；採用門檻 | Storage／DR先核對異地複寫、依賴台灣服務與保留規則；三種架構都不能免除這些責任 |

## 容量與長期擁有成本

| 需求 | 候選機制／精確來源 | 已觀察及限制 | 狀態 | 決策影響；owner／最低成本釐清方式 |
|---|---|---|---|---|
| 百萬索引HTTP容量 | N1 G3a；C1本機audit／summary | N1 T：12,900正式任務零錯漏，SQLite E Web暖機4秒後pool關閉，非正式0RPS。C1：14窗74,400零錯漏；W16/read1和W4/C32/read1/media2各3×300秒。兩組不可相加，未找到最大值 | 已證（合成下限，C1原件未公開）；實際需求未知 | API/Product提供實際持續／尖峰流量與並行使用模式；有明確缺口才針對該情境補驗 |
| CPU／RAM／啟動預算 | C1 app4CPU8GiB、MinIO2CPU2GiB；cluster high6/hard12GiB；controller2GiB | C32 reader平均約0.22core、current峰約0.199GiB只含container；cluster約6GiB／controller peak2GiB。Windows available5.9368GiB觸6GiB停止線；無cluster OOM/swap不代表全域無瓶頸 | 已證（觀測）；歸因未知；持續運作門檻 | Platform/研究owner先檢視既有記帳及Active負載／持續時間，不能用0.2GiB當完整Pod預算。若日後需雙Pod再評估；此次不啟動診斷或調資源 |
| Node／Rust pool fatal復原 | R0 pool原本fatal後live仍200；C1最小health連接 | C1單Rust child kill，平台同Pod重啟22.80秒，恢復後180/180通過；沒有自製supervisor。未證過載重啟風暴／其他crash | 已證（單故障，本機未公開）；採用門檻 | Runtime owner定義busy/fatal、第一原因、告警與升級責任；保留單故障範圍，不需因此新增服務 |
| 監控／on-call／升級 | F1–F7、N1 operations ledger（archive內） | 有研究telemetry／receipt，未證正式alert、runbook可被值班人操作；研究腳本不是免費正式監控 | 影響決策的未知／採用門檻 | DevOps與app owner各指派責任，走一次build失敗／內容缺漏／worker crash桌上演練；工時未知，不用LOC或agent速度估TCO |
| A既有IaC/runbook重用 | A完整Next/BE/MariaDB/ES/MinIO，非獨立ES B | 未量測公司異地部署、備份、升級、容量、值班的增量成本 | 影響決策的未知，可能直接改選 | 現有A owner展示一份實際異地runbook與缺口；先確認已有自動化，不先寫新成本模型 |
| metadata瘦身／極限RPS | N1與R0完整SQLite3,313,811,456bytes；T index99,888,889bytes（V2） | metadata仍攜舊content/FTS；SELECT*／lineage依賴需處理。未做瘦身，不能預支節省；未測更高流量不代表失敗 | 選配最佳化 | 只有產物大小或實際流量阻擋選擇才啟動；不讓可選最佳化變成無限研究門檻 |

## 證據保全與本次自我審查

- 依本機原始報告／C1 audit 與已發布 N1/R0資料核對數字、單位、窗口與配置；不修改凍結原件。
- C1中止的900秒hold只留下3,302 terminal（540暖機＋2,762正式），其餘5,338 slots不當成功或server失敗；不截取前300秒冒充通過。F1 live gate與混載更新仍未執行。後者移出預設必驗不等於通過；完整發布核准／良版可復原仍是核心，持續服務風險也未因凍結消失。
- N1曾有編譯／儀器失敗，R0有雙Pod／單Pod主機護欄停止，C1有前置工具失敗；原包／本機原件保留，不以最後通過抹除。
- 本包為文件整理與agent自我審查，不是新的獨立實驗review或真人易讀性驗證。C1原始證據公開前，外部讀者只能審視其敘述與限制。
