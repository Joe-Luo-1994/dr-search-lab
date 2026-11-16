# E2 最小設計審查

2026-11-15。主要V3/V8，V5/V6底線。**建議一輪四關，只觀察C的新版本與操作接縫；A完整方案、B保留ES仍作候選。** 本輪沒有A/B操作成本對照，不能以C通過宣稱較省，也不能替B的ES發布／版本切換責任簽核。本次僅設計，未啟動服務。

## 本輪必做與門檻

| 關卡 | 最小操作 | 成功門檻 |
|---|---|---|
| G1 真V1基準 | 新隔離V1完成搜尋→正文→media→PDF；Web與client保留實際回傳的版本鏈 | index、metadata、正文、PDF吻合獨立來源；不能手工偽造一個「舊URL」取代真的舊結果。 |
| G2 新adapter混版反例 | V2 manifest／metadata配V1 DB，各檔hash本身正確但版本／來源身份不合 | 啟用前拒絕並顯示具體理由；active及V1完整鏈不變。這驗新接縫，無需重做MR1同長壞bytes矩陣；事後抽測不稱零中斷。 |
| G3 有效V2與舊鏈恢復 | 啟用真V2，核Tags／移Space／正文／PDF差異；原Web頁面及client拿V1鏈請求新reader | 舊鏈明確失效且無內容；Web清楚提供重搜，client重建請求鏈；兩者用同一穩定query重新找到頁並取得V2 bytes。裸409不算任務完成，也不默認正式consumer接受。 |
| G4 來源失聯與非作者接手 | producer目錄隔離後，新非作者只照runbook，由獨立DR artifact安裝全新cache、啟動新reader | 無作者臨時補檔或偷讀producer，V2完整鏈成功；記新PID／實際來源／hash與所有步驟、求助、人工判斷。只證agent接手，不證真人值班接受。 |

G4是原E2計畫既定必要接縫，不能省成「原reader繼續可用」。這裡只做**單一合成producer來源角色失聯**；不冒稱真fz1／fz2故障域隔離、主機損毀或網路斷線。DR artifact／程式／mock Role仍在，依賴逐項明列。本地file transfer只能支持新adapter；MR1真MinIO GET證據另列，不能混成公司MinIO驗收。

## 精確fixture差異與獨立預期

已寫 `scripts/v1-e2-20261115/review/oracle.json`，狀態為設計oracle，尚未freeze成可執行HTTP卡。來源以E1凍結37頁的**新副本**製作：

- E2-v1另設snapshotId／capture label；a-pdf增加唯一固定anchor `e2packet`，供V1/V2同一查詢恢復。這不修改E1。
- E2-v2：a-tag-both移除validated、加入contact；a-pdf換正文及pdf-checklist-v2，保留e2packet；a-move改屬Space b；新增a-v2-only／harborledger。其餘內容沿用。
- 新PDF抽取文字為saffron attestation及seal9652；依E1已凍結PDF格式算得678bytes、SHA `22b32411322dc3cfaed1e2ee15b4eb173c1708d2771c536f9a4a15478b366dae`。這只是離線算指定內容的參考bytes/hash，未執行搜尋或服務。
- 舊PDF探針用7324：V1命中a-pdf，V2零結果。不要重犯「silverline certificate否定句不含詞」的舊oracle錯誤。
- Oracle同時列V1/V2的Tag交集、移Space兩身份、V2-only與新舊media期望。正式source產生後須由非實作者核對recipe與hash，不由引擎輸出回填。

HTTP版本契約已定為正文、media-list及下載皆帶 `?version=<snapshotId>`；缺少回400 VERSION_REQUIRED，不符回409 VERSION_MISMATCH，不能透明移除token重試。unknown身份先判503 AUTHORIZATION_UNKNOWN。版本已變且身份仍有權的穩定a-pdf用來驗恢復；移Space拒絕另驗，避免把版本失效與撤權混為同一原因。route／response schema與契約hash待正式freeze。

安裝只發布已驗證release並更新last-success.json；另起reader及手動traffic.json切流分開記錄。G2須因SQLITE_IDENTITY_MISMATCH拒絕，traffic.json、V1 manifest及last-success.json前後bytes/hash不變，last-attempt另顯示失敗。不能把安裝成功當流量已切換。

## 可直接省略

MR1已涵蓋中斷、缺件、同長錯bytes、updater固定barrier被殺、無舊版unavailable及兩次空cache百萬恢復；MR2已覆蓋全本地bundle於MinIO失聯及受控下載重疊。保留限制後引用即可，除非E2改了相應機制。刪除新百萬資料、限速重測、時鐘重測、E1品質／PDF／Tags全矩陣、所有crash點、透明多版本路由與零中斷要求。

本輪的壞版保舊不等於已驗有效V2啟用後任意回退V1；不額外實作rollback服務。若runbook主動承諾回退，需另說明版本／授權變舊的界線，不能默默算已支持。

## 執行卡仍須固定

以單一observer單調時間記期限，不再用跨程序wall-clock包含關係判成敗。可沿用每request5秒、API鏈15秒、UI任務30秒作研究上限；fresh-reader及operator整體期限、資源護欄、總watchdog須在卡內填定，不能中途放寬。準備／build與正式結果分開，build輸入收據須先於build。

只寫新E2路徑，原120檔與r1/r2/F1證據不變；新輸出拒覆寫。source隔離前核絕對路徑及獨立DR副本，保留原件。一次正式執行；未預先審核的修補不自動重跑。非作者操作失敗或需作者介入如實記錄，不教會後重報無求助。

成本只記本輪改造、共用發布／版本／consumer責任、每站／每reader磁碟與安裝、人工步驟／求助；一次性與例行責任分開。未知公司工時不填零，agent操作時間不當值班人力成本。若必要恢復依賴未記錄手工工作、版本混合或負擔抵銷成本假說，停止／修正候選，不自動進E3。

依據：原生repo AGENTS、HANDOFF最新段落及DR_PRODUCT_REVIEWER；MR1/MR2 final-review；本地DR_EXPERIMENT_PLAN_V1的E2與E1補驗獨立裁定。

