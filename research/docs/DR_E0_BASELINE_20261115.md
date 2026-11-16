**閱讀提示：這是E1之前的歷史E0盤點，表中當時缺少Tags／PDF等實作的敘述不代表目前狀態。最新成本與責任比較見[決策頁](DR_COST_DECISION_20261115.html)；E1／E2／遠端內容結果依最新HANDOFF。原盤點保留，不回寫歷史。**

# E0：完整方案與輕量方案，究竟差在哪些成本

2026-11-15。V8；來源盤點完成，尚無新容量測量。範圍：使用者已確認的A完整異地部署＋完整備份，以及B保留ES／C本地SQLite兩條替代路線。公司程式、部署配置、帳單及工時不在本repo；不是正式TCO或A驗收。

## 本輪決定

**保留A為可行基準；B/C繼續作候選。先做E1小型必要任務，不做新百萬壓測。** 本機程式證據已確認替代路線還有共用Tags／PDF／page-media與consumer接縫；沒有成本資料支持直接宣布B/C較省。E1的獨立價值是排除不適合的方案、量出新增責任，不是證明淨節省。

最值得先否證的兩個假說：

1. B/C能以有限轉接工作沿用既有閱讀方式，支援基本搜尋與下載。若拿掉Backend後必須大量重建產品邏輯，兩條輕量路線一起失去吸引力。
2. C不需要持續客製斷詞／查詢修補，就能完成必要搜尋。若做不到，B保留ES應優先，不能靠低RSS抵銷。

## 相同需求下的能力與責任

標記：U使用者確認；C本輪程式盤點；H歷史實驗子證據；P待驗設計／估計；?正式未知。表中責任為待確認分工，不是公司owner已接受。

| 項目 | A完整方案 | B保留ES、替換周邊 | C本地SQLite |
|---|---|---|---|
| 搜尋／原API | U：既有可行架構與程式沿用方向；?異地配置及consumer切換細節 | H/C：真Next→ES參照有子證據；?與公司mapping/query／API等價 | H/C：Next／FTS及中文前處理已有子證據；?必要品質與正式契約 |
| 異地服務責任 | U：Next、Backend、MariaDB、ES、MinIO；?副本數、配置、自動化重用量 | P：Next、ES、MinIO及ReBAC整合；?每站規模 | P：Next、MinIO、ReBAC整合及本地檔生命週期；?每站／每Pod規模 |
| 搜尋與metadata轉接 | U：多數既有Backend邏輯可沿用的方向；實際零改動未證 | C：S1 core拒絕tags，還缺本輪PDF／media接縫；舊release lib有可重用Tags/membership | C：S1／release core拒絕tags；FTS/schema需補metadata篩選，並接同樣PDF／media契約 |
| 授權與交付一致性 | U：Backend/MariaDB既有檢查＋ReBAC；?異地更新／復原配置 | P/C：Next補page→Space→Role及page→media；索引／metadata／正文需一致，各輸出欄授權不能漏；既有mock不能當公司ReBAC | 同B；C特有的是FTS／前處理與SQLite檔案安裝／本地生命週期，責任實作成本另量 |
| 來源產製 | ?既有DB／ES備份工具與自動化 | P：從備份匯出內容／metadata，ES還原或建索引策略待定 | P：共用匯出＋SQLite build；集中一次供多站使用為工作方向 |
| 每地同步與儲存 | ?DB／ES／MinIO備份、還原、副本與保留 | ?ES data／translog／快照＋MinIO內容；不能只算ES store | H：代表DB約2.13GB；每Pod下載與新舊版／staging另計，不能只算單一DB |
| 異常處理與升級 | ?現有runbook及平台可沿用多少 | P：ES原有升級／監控＋自有Next轉接／發布維護 | P/H：SQLite版本／前處理／worker／installer／版本與GC維護；daemon少不等於操作少 |
| consumer | ?現行API可沿用程度與換址成本 | P：Next adapter差異需逐欄核對；搜尋語意／total／分頁／舊鏈是B/C共用契約責任，不預設同JSON零改動 | 同B；實際差異與修補量依各引擎觀察 |
| 共同成本 | 各方案都要異地入口、身份、內容／附件可達、監控、演練及責任人；不同之處是可重用程度，不是是否存在 | 同左 | 同左 |

成本與時間：A/B/C公司金額、正式工時範圍均未知。不能填零，不能用實驗agent耗時替代公司工程工時。第一次接通一個小型切片將記研究實作耗時及新增模組，作估計輸入，仍非長期維運證明。

## 可核查程式來源與具體缺口

以下相對路徑均指WSL原生repo `/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo`，不是Windows舊checkout。E0未修改這些來源。

- B：`scripts/s1-es-api/core.mjs:24–46` 支援q／spaces／分頁及page JSON；參數allowlist不含tags；`app/page.js:1`只是說明頁，不是完整閱讀UI。`scripts/s1-es-experiment/prepare.mjs:14–40` 是synthetic Lexical來源→ES，沒有公司MariaDB connector。
- C：`scripts/s1-scope-api/core.mjs:17–31` 拒絕tags；`search-child.mjs:1–31` 有scope SQL、FTS、normalizeQuery、highlight及worker責任。不能拿較舊s1-sqlite未優化路徑冒稱最新版本。
- 既有release：`scripts/minio-release-api/core.mjs:32` 附件讀取以附件spaceId判斷，沒有要求page membership；新E1需要符合使用者描述的page metadata→media list驗證。
- 可沿用而不從零造：`lib/readonly-release.mjs:13–18,45–57,70–108` 有tagIds、mediaIds、membership與hash驗證；`lib/release-es.mjs`有ES adapter；`lib/release-export.mjs`消費匯出檔，非MariaDB connector。
- 小型fixture：`scripts/minio-release-review/fixture.mjs:14–37` 是24頁、3Spaces及文字附件，沒有Tags／真PDF；PDF文字源在主站MariaDB是U已知，但不等於這個fixture已有PDF路徑。
- 本機環境：2026-11-15查WSL研究目錄內未找到ES executable。Node26.13.1與已建MinIO工具存在；893GiB可用磁碟是當次環境觀察，不是方案成本。補ES執行工具屬研究準備，不計成公司每地新維護責任。
- `onboarding/start.md`、`scripts/export-transfer.mjs`、`scripts/minio-release-experiment/install.mjs`分別是Lab啟動、交接封裝、實驗installer；不是公司Kubernetes／Harbor部署自動化。

## 多地擴張：現在可算什麼，不能算什麼

設N為地點數、P為每地reader Pod數、K為每Pod同時保留的完整DB份數、D為DB bytes；另有共用build成本、每地MinIO版本保留與附件成本。非均質站點應分站相加，不能用單站乘N遮掩差異。

歷史L的D=2,133,065,728 bytes，包含FTS與本文，不是純index。下表只是P=1、K=2的條件計算，**不是實測配置／安全容量上限**；不含額外staging、media、OS cache、日誌、物件儲存與ES對照。

| 示例站點N | reader DB總儲存2ND（十進位GB） | 各站一天收到1份新DB的合計傳輸ND（GB/day） | 若每4h都產新完整DB且各站收6份（GB/day） |
|---|---:|---:|---:|
| 1 | 4.266 | 2.133 | 12.798 |
| 2 | 8.532 | 4.266 | 25.597 |
| 4 | 17.065 | 8.532 | 51.194 |

此傳輸只計一層：發布端到每站一份；各站MinIO→每Pod另算，Pod重建、重試、空更新略過策略、壓縮／去重與出口拓撲均未計。P加倍不一定使跨站流量加倍，但會增加各Pod本地副本與站內安裝流量。不能把4h的資料傳輸倍率當維運工時倍率。

比較帳的形式：一次性改造＋T期間的共用維護＋各站服務／持久資料儲存／傳輸＋各Pod安裝／本地副本儲存＋跨站協調。各桶互斥：consumer一次性改造是一次性總額子項，日常支援歸相應維護，不另重加；各站儲存指物件／服務持久資料，各Pod只計本地副本。T=1／3年與N=1／2／4只是敏感度假設。資料沒有支持數字時保留符號或未知；只有同需求且估計區間不重疊才有較強成本結論。

## 成本假說如何控制下一輪

| 假說 | 目前範圍／未知 | 下一個可測量 | 會怎麼改變選型 |
|---|---|---|---|
| H1 去掉Backend/MariaDB可少維護 | 服務移除是候選架構；新增轉接責任已由程式確認，正式工時未知 | E1共用API／Tags／membership／PDF／consumer需要新增與沿用哪些模組 | 若需要大量重建產品邏輯，優先A；小切片完成只保留B/C資格 |
| H2 去掉ES可省每地服務 | ES基準金額／資源未知；C有本地副本／worker／前處理責任 | E1必要品質與修補；E2操作；僅在仍值得比較時E3同工作量資源 | 必要查詢持續客製修補則轉B/A；E1成功不自動等於較省 |
| H3 集中build可低成本擴站 | 同版重用可行方向；N/P/K與網路未知 | E0上述量級；E2新接縫操作；E3有條件量bytes／build／資源 | 副本／傳輸／更新複雜度抵銷節省時修正策略或保留A/B |
| H4 A已有成熟自動化，增站便宜 | 公司部署／備份／升級工具與人工步驟未提供 | 對口可用本表補現有工具及一地增量；不需先交精準帳單 | 如果A增量小，減少B/C客製投入；資料缺時不宣稱總成本優勢 |

## 舊證據重用與E2刪除項

經獨立reviewer讀MR1／MR2／S1-ES／L紀錄後，整理以下重用範圍；未核新hash前不是新版繼承通過。

| 情境 | 已有證據 | 本輪處理 |
|---|---|---|
| 下載中斷、缺件、同長壞bytes、installer中斷保舊 | MR1既有有限矩陣、無舊版unavailable | 相同機制不完整重跑；新Tags／PDF adapter改完整性邊界才選代表案例 |
| 空cache下載／hash／新Next PID | MR1兩次百萬、L限速約107.52秒子鏈 | E2只需新小版接縫，不重跑兩次百萬 |
| MinIO失聯與恢復 | MR2本地完整正文／附件可用、空cache503 | 不能套到遠端讀內容；新方案若改依賴位置，驗其改變 |
| 更新下載與舊服務重疊 | MR2小Next鏈；L百萬Node reader、單在途query | 不為E2重跑百萬同版下載；真Next混合資源只留條件式E3 |
| V1舊鏈送V2 | MR1/MR2已驗409；L同版不補此缺口 | 新增的是Web重搜／client重建完整鏈，非再證明409 |
| ES抽取、基本語意及長文 | S1-ES 1107頁／24任務有限證據 | 未改抽取器不重造長文；Tags／PDF-only是新接縫 |
| mock身份與輸出授權 | 歷史scope與拒絕子證據 | 新membership、輸出欄、快照漂移另驗；不冒充正式ReBAC |
| DB大小／RSS／下載材料 | 歷史口徑及限制保留 | 可填責任／量級，不重測以湊表；不產生跨環境速度排名 |

引用：native `docs/reviews/minio-release-2026-11-14/final-review.md`、`minio-dependency-2026-11-14/final-review.md`、`s1-es-2026-11-14/final-review.md`；本地 `L_FIRST_VERSION_20261115.md`。L沒有獨立執行後review，不能補稱已有。

## E1最小準備範圍與本輪界線

新增隔離小fixture及共用Next adapter，補Tags、PDF-only與membership；B用真ES-reference，C用SQLite現行中文前處理。E1先用明示本地內容bundle控制搜尋→讀取→下載接縫，MinIO下載／發布重用歷史證據並留E2新接縫；這是縮小本輪故障變因，不代表現有MinIO遠端內容已驗。缺既有editor時只作替代render，不宣稱產品整合完成。

完整執行卡、獨立oracle、資源護欄與review未完成前不執行正式案例。本輪E0無新壓測、無修改公司系統、無正式成本接受。盤點由較便宜模型唯讀完成，主agent抽查core與工具入口；reviewer獨立核歷史重用。模型請求設定可記錄，真實費用與總token未知。
