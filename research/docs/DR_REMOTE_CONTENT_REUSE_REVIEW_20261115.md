# 第一版遠端內容：證據沿用與最小補驗審查

2026-11-15。使用者已決定第一版採**本地index／metadata，正文與附件由異地MinIO讀取**。這改變內容交付與故障依賴，不抹除E2歷史成功，也不表示SQLite是唯一搜尋候選。本次僅讀資料與設計，未改凍結檔、啟服務或執行補驗。

## 哪些證據還有效

| 既有證據 | 新配置可說到哪裡 | 不可沿用的結論 |
| --- | --- | --- |
| E1必要搜尋與E2雙版本Tags／Space查詢 | 同來源、同抽取／provider時，沿用已驗語意及獨立預期；不重跑完整搜尋矩陣 | 若改FTS格式、抽取或摘要來源，該變更不能直接繼承通過；Pagefind亦不能繼承SQLite結果 |
| E2 G2 hash-valid混版因DB identity拒絕、保舊 | 本地索引與metadata安裝的身份核對／失敗狀態模式仍有用 | 未驗本地metadata與遠端正文／PDF一致；原完整bundle closure不再覆蓋按需GET |
| E2 G3版本URL409、Web／client明確重搜 | consumer恢復方式及已驗Web任務可沿用為契約與UI子證據 | 新GET adapter仍須驗實際新正文／附件；不能由本地下載成功替遠端鏈簽核；正式consumer接受仍未知 |
| E2 G4來源路徑隔離、fresh安裝、有協助非作者接手 | 安裝本地artifact、啟reader、核版本的操作證據保留；首次記錄器失敗與一次介入保留 | 無遠端endpoint／憑證／物件版本／依賴健康操作證據，1545ms不是新配置恢復時間或人力成本 |
| MR1真MinIO GET、hash校驗、缺件／壞bytes／中斷保舊 | 支持同類artifact傳輸與完整性機制，可引用不重播整套故障矩陣 | 它是完整下載後本地讀，並非每次正文／附件請求遠端GET；亦未證正式IAM／物件鎖 |
| MR2完整cache在真MinIO約10秒停機仍完成任務 | 只保留為完整本地方案的故障取捨對照 | **對新配置的正文／附件可用性不成立。** 搜尋可否獨立工作也取決於metadata／摘要是否仍需遠端讀 |
| MR1／MR2空cache恢復、2.133GB下載及採樣RSS | 保留該版本／資料配置的觀察 | 不換算成新index大小、遠端閱讀延遲、Pod規格、流量或新RTO；原DB含正文 |

E2原始程式界線：`scripts/v1-e2-20261115/api.mjs`的readPage回傳本地manifest之body，downloadMedia讀本地PDF；snippet亦讀manifest paragraphs／PDF extractedText。`bundle.mjs`同時在manifest保存paragraphs／body，在普通FTS5 content欄存搜尋全文。**把下載路徑改MinIO不等於已移除本地正文，也不等於索引會很小。** 本地倒排結構、可能的FTS內容副本、摘要／highlight文字、metadata與服務正文應分別列帳；搜尋所需文字不是遠端內容交付的離線保證。

## 新邊界先寫進執行卡

採一份可識別schema／抽取格式的release描述，明確關聯index、page metadata、正文及media物件。page metadata至少保留canonical pageId→Space／Tags／media membership；每個遠端正文／media由服務端描述固定key及物件版本或不可變內容身份，附預期格式、長度／hash。不得讓client自選任意bucket/key，或依遠端內容自行宣告的Space授權。schema不相容明確拒絕，不以猜欄位降級讀取。

快照版本與當次Role分開：本輪仍是快照page→Space／media關係加當次合成Role，不自動升格目前正式關係，也不重開已接受的daily／4h研究範圍。未知授權不ALLOW；正文／附件每個請求仍走canonical page檢查。若改用可繞過Next的公開URL或presigned URL，必須另界定持有URL可用期限、撤權與直接取件權限；不能假設E1／E2每次授權證據仍適用。最小補驗可先選Next代取，避免同輪加入第二種交付模型；這是研究縮範圍建議，非已定產品決策。

發布完成、異地物件可取與Pod安裝成功是三個不同狀態。遠端保留／GC須覆蓋仍在服務的本地release，不能本地index還有效、舊object已刪。HEAD／存在不證bytes正確，ETag也不能未經契約便當成內容SHA。若只在實際GET驗內容，應明說啟用前保障的範圍；不能繼承完整bundle先驗所有bytes的承諾。驗證前已stream出的bytes無法收回，故本輪固定小物件可先完整驗後交付；大檔／range策略留作明示缺口，不偷換成任意大小已驗。

## 最多三組補驗，按序停止

主要V3／V5，V6為必要底線，兼記V8。以下是設計建議，尚非已freeze執行卡；實際路徑、schema、error code、資源與單次執行清單需先固定。可沿用5秒完整request與30秒Web任務研究上限；它們不是正式SLO。只用新小fixture／隔離MinIO namespace及獨立oracle，不動E1／E2原件。

| 補驗／影響的決策 | 最小案例與門檻 | 引用與不做 |
| --- | --- | --- |
| **R1 真遠端同版鏈與發布缺口**：按需內容是否能維持可信版本，需補多少發布／保留責任 | 用已有V1／V2差異的副本，MinIO真PUT／GET兩個正文與PDF；本地僅安裝宣告的index／metadata／搜尋輔助資料，記實際GET key／物件身份與本地檔清單。正常搜尋→正文→media→PDF exact內容／hash及版本一致；將一個候選描述指到可GET但內容／身份不合的物件，必須具體拒絕且不交付錯bytes，不可任意錯誤算成功。切V2後舊URL仍按409契約處置，Web重搜一次取得真遠端新內容。至少核仍固定V1的reader能取其保留V1物件；不新增透明版本路由 | E2 G1–G3、MR1同版及hash模式可引用；不重做所有中斷／同長損毀／crash點。若publisher未提供遠端閉包完成證據，結果卡必須保留發布完整性缺口，不能以單次GET代替全量保證 |
| **R2 遠端object不能繞過canonical授權**：是否可移除Backend而保持交付底線 | 在R1小fixture保留一個真跨Space／跨page的有效附件object。已知mediaId但不是該page會員→拒絕；搜索後撤去該身份Role再取正文／附件→拒絕；unknown→503；合法同版鏈仍成功。保存直接object存取的實際策略：若承諾Next代取，非授權caller不能憑已知key直接取內容。以具體404／503／object-store拒絕等凍結契約核對，零受限內容洩漏 | 沿用E1撤權與E2移Space語意，只補新的遠端入口／取件接縫；不重做身份UI、clock或正式ReBAC全矩陣。若只能用mock身份，仍只是合成授權證據，正式權限服務可達未驗 |
| **R3 遠端失聯的可解讀降級與恢復**：使用者能否接受新依賴，故障／操作成本是否抵銷省磁碟 | 在已安裝index的reader下，阻斷本輪MinIO內容連線一次，證明連線確實失敗且不使用本地正文／PDF備份。必要搜尋／metadata在期限內仍正確；正文／附件明確unavailable，不能偽裝404或零結果，UI指出內容暫不可讀且可重試。恢復同物件後，不重建索引便完成同版鏈。若index artifact也在同一失聯MinIO，再加一個空cache安裝失敗／不ready狀態；不能混稱已裝reader全站可用 | MR2可借故障／恢復方法，但其本地內容成功不能代替本項。只一個有界故障窗，不重跑限速百萬、併發、MinIO HA或全部G4接手；若操作手冊新增endpoint／憑證／診斷步驟，列新增責任，不沿用零介入假設 |

R1／R2的錯版或授權底線失敗即停，不用R3可用性或低RSS抵銷。三組可共用一份小build／source及一次受控序列，不三次重建fixture。R3若只有搜尋存活，結論是「搜尋降級可用、閱讀／下載依賴異地MinIO」，不是整個DR任務恢復；其是否可採用需結合原災難故障範圍及正式依賴部署，不能由測試者默認接受。

## 成本與Pagefind候選狀態

補驗只記能支持選型的帳：本地index／metadata／摘要實際bytes、新舊版與staging；同一次任務的遠端GET次數／bytes／失敗重試；共同物件版本保留、發布、憑證及監控；每reader啟用與故障診斷步驟。區分主站→異地複製與異地MinIO→reader按需流量，避免重複計價。移走本地正文／PDF可能減少Pod磁碟與重建下載，但增加閱讀路徑的網路／MinIO依賴；本輪尚無正式資料分布或A／B工時對照，不預判淨節省。

**Pagefind候選狀態待整合，不因E2用了SQLite便排除。** 本次讀到的DR_PRODUCT_REVIEWER歷史摘要記錄小型C1兩候選皆通過、MS1的Pagefind100k建置觸6GiB邊界；這只是特定版本／harness的線索，尚不足以在此文件認定Pagefind本質上不支援需求或永久淘汰。主agent另核原始卡／失敗證據與官方能力後，應區分「功能不符」「當時配置超預算」「為控制變因暫未納入」。遠端內容三組主要驗共同adapter，不能替Pagefind取得provider資格，也不要求現在重做引擎矩陣。A完整stack、B保留ES皆仍是基準／候選。

依據：本地`DR_E2_POSTRUN_REVIEW_20261115.md`及E2原始requests／operator／保全證據、`scripts/v1-e2-20261115/{CONTRACT.md,api.mjs,bundle.mjs}`；native repo `/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo` 的AGENTS、`docs/HANDOFF.md`、`docs/DR_PRODUCT_REVIEWER.md`及`docs/reviews/{minio-release-2026-11-14,minio-dependency-2026-11-14}/final-review.md`。本文件沒有新實驗結果或採用批准。

## Pagefind整合裁定（2026-11-15）

限定獨立複核[Pagefind決策審查](PAGEFIND_DECISION_REVIEW_20261115.md)：**通過，無必改項。** 已重算封存12檔／332,687bytes，均符history-manifest；原builder記錄為TREE_RSS_LIMIT、102.855秒、6,505,082,880bytes，不能解讀為100k reader失敗。同bundle中文Node1筆／browser3筆的原始反例保留，Round2 lazy init／映射已修問題沒有繼續當必然缺陷。未因E2選SQLite而排除Pagefind。

暫不重跑Pagefind可支持**第一版共同接縫的研究順序**：利用現有可執行provider減少新變因，先確認遠端內容路徑值不值得整合。這不支持最終引擎選型或SQLite成本較低；集中builder預算與reader／每站成本必須分帳。R1–R3的契約與內容adapter責任可共用，provider各自的artifact schema、映射、初始化與搜尋資格仍須各自驗；某一provider通過不能移植為Pagefind通過。若後續要宣稱最低維運方案，仍須有可比成本證據或明示Pagefind未閉合，不能只靠暫緩研究推成淘汰。

官方[Node建索引API](https://pagefind.app/docs/node-api/)、[複合filters](https://pagefind.app/docs/js-api-filtering/)及[中文extended語言說明](https://pagefind.app/docs/multilingual/)亦已唯讀核對，與決策文件所述能力邊界一致；官方功能不消除本專案Node中文反例或正式授權缺口。本次沒有新build、query、服務或壓測，歷史原件不改。
