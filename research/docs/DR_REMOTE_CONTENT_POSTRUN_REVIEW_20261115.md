# 遠端內容R1–R3獨立結果審查

2026-11-15。**本地搜尋／metadata＋真MinIO按需正文與PDF的合成接縫可有限結案。** 唯一正式執行17組通過、40筆API HTTP，約11.98秒；沒有修補重跑。這支持第一版候選的遠端內容方向，不代表正式DR、正式授權／consumer接受或較A／B／Pagefind省維運。Reviewer僅讀既存raw、重算hash及檢視四張PNG，未再查詢或啟服務。

## 獨立核對與價值證據

| 面向 | 證據與裁定 |
| --- | --- |
| R1同版內容與錯件拒絕 | V1／V2實際搜尋→正文→media→PDF鏈符合獨立來源。wrong-v2真GET200、199bytes，SHA確為a-pdf-near而非a-pdf，Next回503 CONTENT_INTEGRITY_MISMATCH，未交付錯正文。三種真舊URL送V2均409；原Web明示重搜後完成V2讀取／下載，固定V1 reader重播原URL仍讀保留V1。不是透明跨版或GC／rollback保證。 |
| R2canonical授權 | all身份可看兩Space，但a-pdf配實存pdf-ledger仍404，排除僅因Space無權而拒絕的假正例。a直取b頁／PDF、b撤權後真舊鏈、unknown皆按契約拒絕；拒絕路徑未新增物件GET。Role恢復後b正常鏈成功。匿名直接GET兩個已知有效object均403 AccessDenied。正式身份驗證及ReBAC未驗。 |
| R3依賴降級與恢復 | 本輪MinIO PID1192停止且live=false，已裝index仍可搜尋e2packet、Tags AND及列media；正文503 CONTENT_UNAVAILABLE、PDF503 MEDIA_UNAVAILABLE，沒有用本地搜尋文字回填readPage。空cache installer為ARTIFACT_UNAVAILABLE；有效fresh參數在缺caches/fresh/v2處ENOENT退出，無ready，不是Usage或port衝突。相同store新PID1492恢復後，原Next／index不重建即完成同版API與Web重試鏈。 |

40筆API包含26個200、6個404、3個409、5個503，預期拒絕不是使用者任務成功率。獨立離線核6份成功正文的exact body及canonical欄位、7次搜尋metadata、所有media-list／版本欄位與6份實際下載檔bytes／SHA，未見不符。最大單筆API記錄約108.25ms，僅短小同機觀察，不作延遲SLO或容量外推。授權時間只核ISO格式，沒有重新引入跨程序時鐘包含斷言。

正式remote-io有32次S3嘗試：26個200、2個403、4個fetch失敗；後者記TypeError，結合程序停止與執行序列證實本輪依賴故障，不推定未記錄的底層errno。IO切片及凍結runner順序支持拒絕／local路徑無GET；不靠跨程序毫秒時間差作此判斷。

四張mobile PNG可見版本過期／重新搜尋、內容不可用／重試按鈕、恢復後兩段正文及下載入口；無pageerror。PDF iframe呈灰色空白，**只接受下載bytes，未接受本輪PDF預覽視覺**。這是agent任務／畫面檢查，不是真人可理解性或owner驗收。

## 保全與成本

獨立重算formal freeze460檔（含舊E1／E2的252檔）及cache-audit的9個安裝payload均符；Role為baseline，fresh有效release／last-success不存在。runner最後停止MinIO1492，另有listener-cleanup.json記3162–3166、19440／19441皆無listener。這是既存收尾證據核對，reviewer未再起服務。原所有失敗／反例／出版IO保留。

本輪**沒有省本地容量的證據**。以相同版本artifact邏輯bytes、含巢狀PDF的E2完整包對照：

| 版本 | E2完整local artifact | 本輪local index／metadata／search-text | 差額 |
| --- | ---: | ---: | ---: |
| V1 | 81,076 | 86,815 | +5,739 |
| V2 | 81,254 | 87,265 | +6,011 |

這些小型PDF只有約1.36KB；新增descriptor／search-text等責任使本輪local artifact較大。FTS與search-text仍保存搜尋全文，沒有contentless或去重優化；「正文不由本地交付」不等於「本地沒有全文」。不由此反推真實大附件配置一定更大或更省。原postrun-audit.json漏計E2巢狀media，已保留；採postrun-audit-r2.json遞迴修正值，沒有重跑實驗。

正式17次成功content GET共7,257bytes，包含Web／反例／多條鏈，不能當單一使用者任務成本；其他artifact GET及失敗另計。準備發布183次PUT／GET另列，不與正式閱讀混算。新增責任包括物件描述／schema／hash、兩版保留、完整讀後驗證、簽名與憑證部署、MinIO可達及錯誤診斷、installer／reader／切流、consumer409重搜及重試。root測試credential不是正式最小權限；本地trusted publication receipt是啟用輸入，遺失後發現／恢復未驗。

採樣最大Windows程序working set＋MinIO RSS為1,717,690,368bytes；含研究reader／browser等，排除未分攤的WSL VM／OS cache，不是最低Pod規格或正式TCO。一次build／約12秒runner時間也不代表工程工時、跨區RTO或日常維運人力。

## 停止理由與下一個決定

本輪已回答遠端同版交付、canonical授權接縫及MinIO故障降級，不再重跑E1／clock／引擎或大壓測。**已裝搜尋存活不等於閱讀／下載可用**；採用此方向需要接受對異地MinIO的在線依賴，並有對應部署／監控與保留責任。

下一步優先把這條候選鏈對接一個代表性的正式正文／附件格式及consumer契約，明列異地MinIO／身份與ReBAC可達、部署receipt與物件保留／IAM的責任與可沿用能力，再與A完整stack、B保留ES比較一次性和每新增一地的成本範圍。公司輸入未到時保留未知，不再用額外同機微測填補。Pagefind維持條件式候選；本輪共同adapter結果不能替任何未測provider簽核，也不能宣布SQLite成本最低。

實際範圍僅Windows Node22／Next／SQLite對WSL本機DEVELOPMENT.GOGET MinIO，37／38頁、物件≤1MiB、完整buffer驗後交付；未驗正式ReBAC、跨區／雙fz／HA、真人、正式SLO／RTO／RPO、Range／大PDF／併發buffer或跨區發布交易。這些限制保留，沒有因17組成功而降格為不必要。

證據：`evidence/v1-remote-content-20261115/`下的`result.json`、`requests.jsonl`、`remote-io.jsonl`、`anonymous.jsonl`、`commands.jsonl`、`lifecycle.jsonl`、`resources.jsonl`、`cache-audit.json`、`freeze.json`、四張mobile PNG、`postrun-audit.json`與`postrun-audit-r2.json`、`listener-cleanup.json`。原卡／oracle／程式及結果均未由本審查改寫。
