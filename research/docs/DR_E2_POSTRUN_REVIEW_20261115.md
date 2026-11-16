# E2 獨立結果審查

2026-11-15。**E2小型合成版本、安裝與有協助的非作者接手可有限結案。** C仍是候選；本輪沒有證明較A完整stack或B保留ES更省。審查僅讀既存證據、來源及重算hash，未再發HTTP或啟服務。

## 證據與裁定

- **G1–G3接受。** 唯一正式runner記3關通過、37筆HTTP、8.85秒。獨立離線核對16項雙版本查詢的total／IDs／Space／Tags／title、正文與media membership，以及3份實際下載檔，均符合來源／oracle。混版先通過各檔hash，再因SQLITE_IDENTITY_MISMATCH拒絕；保舊紀錄與V1完整鏈相符。有效V2的資料差異、三種舊鏈409、unknown503、移Space及舊附件404符合預期；client與原Web頁面明確重搜後完成V2下載。
- **G4接受，必須標示有協助。** attempt1在產品安裝前，因operator自製記錄器同時寫transcript而失敗。原件保留；一次經審核記錄器修補後，同一非作者按runbook第4節安裝fresh cache並啟新PID43300。獨立核對status／search／page／media四份JSON與實際PDF：版本鏈、正文、membership及678bytes／SHA全部吻合。未修改產品、runbook或oracle；不是首次成功或零求助，也不是真人值班驗收。
- **保全接受。** 獨立重算E1原120檔、E2凍結132檔、兩attempt18份複製證據與fresh manifest／3個payload均相符；Role為baseline。cleanup收據記fresh仍存活時producer不可達，隨後停止43300、復原producer、3158–3161無listener。審查未再查活服務。

主agent畫面核對支持舊鏈錯誤／重搜、新正文／下載入口可見；V2 PDF iframe截圖空白，**本輪不宣稱預覽視覺通過**。下載bytes成功與預覽視覺分開。單次成功不證所有crash點、任意回退或零中斷；本地來源角色隔離不等於真fz1／fz2故障域隔離。

## 維運判斷與下一步

本輪具體揭露需承擔的工作：建立及核驗bundle、安裝與啟reader、另行切流、保留多版本／失敗staging、409後consumer重建鏈，以及operator整理記錄器與一次修補。1545ms僅為attempt2腳本Stopwatch時間，不含讀手冊、撰寫腳本、協助與整理證據，不能當人工工時或RTO。這次記錄器錯誤屬研究操作負擔，不能直接當產品日常故障率。A／B可比操作工時未知，不填零、不將少一個service換算為淨節省。

**先收斂資料放置與必要離線範圍，再決定是否需要E3。** 本輪完整local bundle含正文／PDF是控制版本接縫的配置，不能默認公司所有media都應下載到Pod。下一個決策應比較「本地index＋metadata、media由異地MinIO按需讀取」與「完整local bundle」，釐清附件總量／變動、每站或每reader副本、需承受哪種外部依賴失聯。MR1／MR2既有真MinIO證據另列；本輪未整合公司遠端media、正式ReBAC或consumer。沒有足夠資料支持直接展開容量壓測或宣布架構勝出。

證據入口：`evidence/v1-e2-20261115/result.json`、`requests.jsonl`、`bad-update-preservation.json`、`client-recovery.json`、`web-recovery.json`、`operator-attempt1/`、`operator-attempt2/`、`source-isolation.json`、`cleanup.json`及`postrun-audit.json`。機器可讀裁定見同目錄`review.json`。本輪到此停止，不追加實驗。
