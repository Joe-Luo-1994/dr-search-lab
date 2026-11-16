# discussion v2 的研究證據公開選取審查

2026-11-16。只讀盤點；未啟服務或壓測。目標是讓團隊能審查設計、實作與結論，不承諾完整環境一鍵重跑。

## 最小完整鏈

每項至少有「事前卡／契約與停止規則 → 來源與 oracle → 該輪實際程式 → 原始結果／失敗 → 分析方法 → 獨立 review／限制」。摘要與 SHA 只能指認資料，不能取代讀者取得資料。

以下 evidence 根均需保留對應 freeze／limits／ready／config-public／cleanup／修補或保全 receipt；以公開轉換副本發布，不更動原件。

| 鏈 | 設計／結果／review | 不可只以 summary 取代的數據與實作 |
|---|---|---|
| E1 必要搜尋 | `DR_E1_CARD`、`DR_E1_RESULT`、preflight／postrun review；followup 與 UI continuation 卡、結果、review | `v1-e1-20261115` 的 r1 儀器失敗、r2 requests／cases／summary 原 fail、repair patch；`v1-e1-followup-20261115` 的 API raw、原失敗 result、四項 continuation、alerts、late-response abort、兩環境 clock raw。`scripts/v1-e1-*` 的 source、CONTRACT、獨立 oracle、provider、runner／UI 程式。不可將離線補核改寫成原 r2 passed。 |
| E2 來源與切版 | E2 card／runbook／result／design、preflight、postrun review | v1/v2 exact source delta／oracle、37 HTTP、壞版保舊／切流／舊URL事件；operator 兩次 attempt、介入與耗時分母。如研究包涵蓋 E2 負擔結論，不能只附第二次成功。它也是 remote fixture 的來源鏈。 |
| 遠端內容 R1–R3 | `DR_REMOTE_CONTENT_CARD`、runbook、result、兩 review | requests、remote-io、anonymous、lifecycle、publication-io、cache-audit、listener cleanup；`postrun-audit.json` 原誤算與 `postrun-audit-r2.json` 更正並存。scripts 中 oracle、publisher/install、S3、reader／auth／canonical、fault driver；不得推成正式 IAM。 |
| K1 100k 容量 | `C_CAPACITY_PLAN`、result、design／postreview、cost ledger | formal raw/resources/events/disk/limits；smoke-1 環境失敗與 smoke-3 hold probe 分開。fixture、oracle2、load／pool／worker／storage 及統計程式。自然跨 activation=0 不被人工 hold 成功取代。 |
| K2 百萬／fallback | `C_MILLION_PLAN`、fallback review、result、postreview | 1 GiB formal-1 readiness failure；4 GiB fallback 全 raw/resources/status/events、未送 canceled 與原 summary、analysis 更正、cleanup。舊 overlap=0 與重算246需可追溯。 |
| K3 Web 內部競爭 | `C_WEB_SEARCH_DESIGN_REVIEW`、result、postreview | reading baseline、1/2/4 query階 raw/resources/status，4/s reading 不合格但全部成功；五個 browser text query僅是 smoke。實際新 runner＋唯讀引用 K2 source/oracle。 |
| K4 查詢成本 | `C_QUERY_COST_DESIGN_REVIEW`、result、postreview | profile/raw、result、plan.json（EQP）、9原 worker reference、45量測、資源與 runtime pragmas/version。原 worker 與分段 worker 兩份都附；不把 count／top10 內含 filter 說成獨立 filter 成本。 |
| K5 擴容 | `C_SCALE_PLAN`、design／兩 preflight、result、postreview、operations ledger | r1、r2 全 raw/resources/events/status/disk、analysis＋verification。兩輪各2550任務、R1拒絕與R2成功皆留；實際4／8worker生成副本不可只附最新通用碼。不得由6搜尋/s推上限。 |
| O1 啟動 | `C_RESTART_PLAN`、design、result、postreview | 6 cases configs-public/events/results、http.ndjson、publisher events／publish各receipt、壞pin與恢復、prepare／cleanup；實際 startup-only service、bootstrap、publisher、storage與pool。與K5不同runtime明列。 |
| PF 歷史 | `PAGEFIND_ASSESSMENT`、OBJECT_STORAGE、DECISION_REVIEW、TEAM_REVIEW；歷史 standard／兩round review／MS1 review | 12頁 round1／round2 raw result、asset GET／missing／corrupt反例及凍結 source；PF02兩attempt raw與tested-source；MS1 60、10k raw、100k停止、source-capacity；100頁 Node／browser 原始結果。既有12檔 history mirror不足以單獨審52 HTTP與fragment改善。 |
| PF G0／G1／G2 | NEXT_GATE卡及review、G1/G2 preflight、GATE_RESULT／POSTREVIEW | G0 OOM/timeout終止證據、G1 control/verification/inventory、G2首case/control/marker／stderr與事後保全。G2無正常summary不能補造。原17個MS1源檔、確切oracle與wrapper/controller、PF package lock。 |
| PF D1／D2 | 各PLAN、preflight、RESULT、POSTREVIEW | 全trace、case、runner、control metrics/result、analysis程式、修訂freeze、instrumentation diff／receipt、D2原／新inventory與provenance、poststop保全。原JS與診斷JS都需可讀；一個JS異動不稱原包全hash一致。 |
| 成本／推薦方向 | implementation audit、landing scope、selection delta／review、operations priority、cost decision review／model | 六工作包資料、公式／check-model、成本ledger、未知欄位。公司A資料欠缺即明列；不拿B、agent秒數或服務種類當成本證據。 |

檔名前綴表中的日期以現有完整檔名為準。建議依 family 公開現有 Markdown 設計／結果／review，避免只選結論文章。HTML報告可作入口，但 Markdown、數據與程式須可直接下載。

## 已完成 native 精確選取

私有本地選取表：`evidence/publication-audit-20261116/native-include.local.json`。**此檔含原機器絕對路徑，不直接公開。** 主 agent 可按每筆 sourcePath 取檔；proposedPublicPath 是建議鏡像位置，originalSha256／evidencePins 用於轉換前校驗。

目前列 **362 檔／64,994,628 bytes**，具歷史 freeze／provenance pin 的項目全部比對相符。包括：

- K1／K2 的 `.lab/.../project` 精確來源、K2 compact oracle、K3／K4 native runner。
- K5 r1／r2 的各自 runtime 四檔；O1 startup-only runtime 六檔。
- PF G1 原 MS1 source、G2新src／api-template、D1／D2生成src與精確原／診斷 Pagefind JS。
- native `evidence/two-rounds-2026-11-14` 的兩輪 raw／反例／source，`evidence/ms1-2026-11-14` 的 build/runtime/capacity raw與source，PF02兩attempt原始證據。
- 歷史 provenance 直接指定的 `scripts/product-review` oracle／harness／supplement、標準文件、PF objectstore／demo／dataset，均查到且匹配 pins。

唯一大選取項是 K1 `fixture-100000-oracle2/oracle.json`（58,006,641 bytes）。它是當時驗證器用的 oracle，不是 DB/index；可 gzip 發布並記解壓後hash，不必刪掉。原始 DB、Pagefind index/fragments、node_modules、Next編譯輸出與binary不在這份選取表；它們的版本、大小、hash與省略原因仍要在公開manifest辨識。generated Pagefind JS屬本輪被直接修改與分析的對象，應保留其來源／版本及相應授權標示。

這份表是 native 補充；Windows 的 docs/scripts/evidence 鏡像由主 agent另選。沒有pin的歷史檔只標目前讀取hash，不假稱已證歷史完整性。選取不等於已完成內容清洗。

後續依授權已實際收集到 `evidence/research-publication-20261116/native-sources/`：加上 links.json 指出的 native 歷史文件／資料目標，共 **389 檔／66,230,340 bytes**，逐份 copy readback SHA 相符，可映射的 native 歷史缺口均找到。`manifest.local.json` 提供原路徑、建議公開位置與 publicLinkAliases；原樣含私人環境路徑，只供主發布流程清洗取檔，不直接公開。沒有補進 HANDOFF 私人雜訊，也沒有改動原實驗。

## 成包審查 checklist

1. discussion 每個關鍵數字／機制／反例有可點擊的公開證據入口；不是仍連本機或只有來源hash。
2. 每輪可找到事前門檻／來源oracle、實際程式、raw、統計與review；K5／O1／PF不同版本能分清，不拼成同build。
3. 失敗attempt、未執行案例、取消分母、資料更正及instrumentation修補保留。沒有正常summary就說缺少，不重新生成冒充。
4. 比較原始SHA與公開SHA，列轉換類型／數量；絕對root用一致placeholder映射，不能改數值、status、request次序、schema或預期。程式若因placeholder不可直接執行須明說。
5. gzip 同時記compressed SHA與解壓public SHA，逐筆JSONL/NDJSON可解析且行數一致；不是截尾抽樣。統計仍能從公開raw重算。
6. freeze 中省略的index／binary／依賴列明排除理由；保留hash、版本、lockfile與取得條件，不能稱所有freeze物件均已交付。
7. 絕不公開 private-config、env、access/secret token、簽名URL、Authorization實值或憑證；測試身份與固定合成fixture可保留，但須掃描字串內容，而非只信副檔名。
8. cmdline／stack／source／manifest／patch／SVG和PNG都可能帶環境資訊。清洗含原／新diff及receipt，不能漏掃gzip解壓內容與本地規劃表。
9. 只保留支撐UI聲明的必要截圖與原browser結果，將agent觀察、真人證據和PDF視覺未驗分清。報告版面截圖不是實驗能力證據。
10. 公開入口說清「可審查的研究紀錄」，並列未交付的大產物與執行依賴；不承諾完整一鍵重播。發布後核commit檔案allowlist與遠端raw/hash，不能僅以本地build或push成功認定資料可取。

## 最終公開包審查：通過

已核對成包 `research/`，目前 **1,236 個來源副本**；其中 **393 個 native 補充來源**均在公開 provenance 與來源 manifest 找到，原 SHA 對應零差異。歷史 spec-v1 與 Pagefind 1.6.0 package metadata／兩份隨附授權文件已納入。當年有 freeze／provenance pin 的來源維持原 pin；未有歷史 pin 的補檔沒有被升格為已證歷史版本。

獨立驗證儲存與解壓後 hash；並將來源 bytes 套用已宣告的純清洗規則，確認 **496 個 JSON／JSONL／NDJSON 的公開內容完全相符**，不是重新產生摘要或改寫數值。**78 個逐筆紀錄檔合 25,027 筆**，行數保留且可解析。此次核對後新增的 spec-v1 是 Markdown，不改上述數據集合。來源／數據核對 receipt 保留於本地 `reviewer-package-audit.json`、`reviewer-data-integrity.json`。

關鍵反例均可直接取得：E1 r1 儀器失敗與 r2 原 fail／raw；followup 原失敗與 UI continuation；remote 原容量誤算與 r2 更正；K2 原 readiness failure；K5 r1／r2 完整 raw；PF G2／D1／D2 timeout 與 partial trace。獨立查表未見上述必要檔遺失。不同 runtime、原始失敗及未執行案例仍各自保留，沒有以新增公開資料把失敗改成通過。

公開資料清洗檢查涵蓋 gzip 解壓內容，未發現個人 home/workspace root、私人對話URL、私鑰或可辨識的實際存取token。credential 關鍵字的候選已人工核對，為動態產生／讀取／組裝的程式，不是帳密值。PNG 與來源 bytes 相同；此審查沒有重做所有歷史圖片的視覺驗收。DB／完整索引／node_modules／私密設定未納入，省略與非一鍵重播限制已寫明。

先前發現生成的 provenance／導覽／verifier 未受主來源 manifest 涵蓋，已用外層 **delivery.json** 關閉：獨立重算 **1,242 個 payload** 的大小／SHA 與實際檔案集合全符，涵蓋主 manifest、frozen provenance、README、index、verify.py、LINK-GAPS。delivery 自身由最後 Git commit／遠端讀回錨定，不做循環 hash。`verify.py` 已靜態核對先驗 delivery、再驗 stored／decoded bytes；不會執行實驗。

主 agent 的最終 link receipt 為 gaps=[]、47 aliases；主鏈入口與歷史來源導覽已補齊。UI／離線瀏覽由主 agent另驗，非本 reviewer 重跑。

**最終裁定：可依使用者授權發布此研究審查包，無剩餘來源完整性或內容安全阻擋。** 它提供可審查的設計、精確實作、原始紀錄與限制，仍不保證一鍵重播或正式環境有效。此 review 更新後只需同步本檔的公開副本、來源 manifest 與 delivery hash，再按 allowlist commit／push 並做遠端讀回；本裁定不等於發布已完成。
