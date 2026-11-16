# C 容量候選 K1：獨立設計審查

2026-11-15。審查 `C_CAPACITY_PLAN_20261115.md` v1、C／A 實作 audit 與既有 R1–R3／L 證據。Reviewer 本輪只讀與寫此 review，未起服務、執行負載或修改實作／舊凍結檔。

**裁定：設計方向可進實作與靜態 preflight；以下三處補明前，尚未批准正式階梯凍結／執行。** 不要求新增 B 矩陣、10k 完整容量矩陣、長時間 soak 或正式 SLO。

## 接受的範圍與取捨

- 100k 為唯一正式搜尋工作集，10k 只作契約／儀器 smoke；256 頁與 8 附件 hotset 明示為內容子集。結果不能稱 100k 全內容交付、任意存取或大附件一般能力。2／8 MiB 是本輪新增候選能力，不能繼承 R1–R3 的 ≤1 MiB 通過。
- reader 2 CPU／1 GiB／無 swap，包含 Next、所有新舊 workers 與更新；MinIO 1 CPU／512 MiB／無 swap。實際 cgroup limits、程序歸屬與 events 讀回是執行前硬門檻。這是 CPU 配額與記憶體限制，不是專用 CPU／網路／磁碟；外部 builder、generator 與已暖來源 cache 分開揭露。
- 每版 catalog、按命中取摘要、長駐 workers／有限 queue 與下載 admission 是有意的新實作，應分開記工程與維護工作。內容完整 buffer／hash、不支援 Range 的限制可接受；不能因此忽略記憶體複製及慢客戶端持有 slot 的代價。
- 四個 phase、20 秒短窗 open-loop、混合更新最多 60 秒，以及明示 2 秒／1% 研究靶點可形成有限觀察。短窗、少樣本與 hotset 不升格穩態容量或 production pass。

## 凍結前必補的三項

### 1. 更新 phase 的裁定與版本 oracle

卡目前詳述更新動作，但「每階」研究靶點如何適用 60 秒更新 phase、未完成啟用如何裁定仍不夠明確。請寫定：下載／驗證／啟用須在 phase／總 deadline 內完成，無完成或無實際重疊只能判更新子題未完成，不因其他請求成功而 passed。沿用或另列錯誤率／延遲靶點即可，不需另找正式 SLO。

正常負載如何取得版本、搜尋後讀取如何帶版本、V1 in-flight 回應與 V2 回應如何各依來源 oracle 驗證，須固定；不能用完成時的 active version 當所有回應的期望。另列專門 oldURL409 正確性探針，與正常負載的可用／超時／拒絕率分開；若一般任務也發生409，保留其任務結果，不以「預期拒絕」掩蓋。啟用、舊 pool 排空及保留兩版要有實際證據，不只發出 background promise。

### 2. 每階計數、drain 與停止的共同期限

請明確以預定 arrival 窗定義 offered／missed，以最終 deadline 後的逐筆終態核 sent／completed／timeout／rejected，且另列成功延遲樣本數。missed 不算成功、timeout 不從工作分母消失；P95 究竟含哪些終態應固定，不能用快速503改善成功任務的延遲印象。250ms 落後／漏送使階段無效的規則保留。

每階20秒停止發送後只允許有界 drain；60秒 update 與15分鐘總 deadline 須涵蓋下載、worker 啟用、排空及最後收尾前的受測工作。停止訊號應阻止下一階並取消本輪在途工作；安全 cleanup 獨立執行。worker 4秒期限不能只 reject parent Promise 而留下同步 SQLite 在背景跑，需實作 preflight 確認取消／終止、slot 回收及 worker 替換的記錄方式。metadata 請求亦須經有界 admission，不可旁路成無限 queue。

### 3. 儀器修補次數與保全

「儀器故障保留 attempt 並新 attempt」請改成最多一次有根據、經 reviewer 確認的儀器修補。新 attempt 與 code／freeze 差異另存，原失敗不改；產品、授權、資料正確性與真容量失敗不能改稱儀器失敗。修補不能暗改資料、負載、資源、靶點或查詢契約。這不是要求研究錯誤永不修正，而是防止同一輪反覆調整直到通過。

## 實作／產物 preflight 待核

這些屬已定設計的執行證據，不能僅因現在尚未生成便視為新設計缺陷：

- 依來源獨立推導 exact total、必要／禁止頁、Top10 若含排名義務的規則，以及 V2 delta；不得從 SQL 回應生成 oracle。smoke 先覆蓋必要契約，再 freeze 正式工作集與輸入。
- cgroup CPU／memory／swap 真值、所有服務 PID／worker 歸屬、OOM／退出偵測、應用 deadline 與 RuntimeMaxSec 收尾；MinIO 啟動若超預算須如實停止，不臨時提高 quota。
- reader 安裝 inode／page-cache 歸屬、資料與 staging bytes；memory.current／peak 連同 anon／file 及 CPU throttling 解讀，累積 peak 不誤稱每階 peak。
- 下載 slot 持有到回應完成／取消，worker queue 有界、慢任務能終止，版本 reference pin／排空成立；安裝壞 hash 保舊與正式兩版 hash／identity 來源一致。
- 各 phase 使用既定負載序列、真實更新重疊、同一 build／limits receipt，完整保存失敗與未執行階段。不要把 L 的百萬／107秒與此候選合成一個容量結果。

最後結果只回答此 C 候選在本輪配置與合成工作量下的曲線、飽和／限制，以及新增操作與維護責任。A 正式 Backend／MariaDB 不在 repo，B-reference 不代替 A；公司人日、成本優勢、正式 ReBAC／consumer／部署接受仍未知。

## 實作 preflight 第一輪（2026-11-16，待修正）

已靜態讀 Windows 的 `service.mjs`、`pool.mjs`、`worker.mjs`、`storage.mjs`、`fixture.mjs`、`load.mjs`、`environment.py`。長駐 workers、按命中取摘要、精確 count、有限 queue、內容4個 slot持有至傳輸完成、真完整下載後才切版的主要路徑已落地。主 agent 回報的 smoke-1 WSL lifetime 失敗及 smoke-2 通過保留；本次 reviewer 未重跑服務，也尚未以回報代替產物 hash／limits 的最終核對。

正式 freeze／load 前有四項必修／收斂：

1. **共用停止與總 deadline 尚未落實。** 所讀 `load.mjs` 的 `fail` 只設定字串；control／update沒有共同 signal，無15分鐘總 watchdog。`environment.py` 的 load 呼叫亦無 finally 停本輪 units；RuntimeMaxSec=1800不是15分鐘停止。需 fatal／總 deadline 真正取消受測工作、阻止後續 control／update，drain取消後等 pending settle 再寫 summary；外層finally獨立停止自有units並保留證據。runtime更新也需受取消或服務終止約束，不能 client停止後偷偷啟用V2。
2. **pool啟動的10秒未包含check，失敗會遺留候選children。** `Pool.start` 每個ready timer後另跑4秒quick_check；reject沒有關閉整個未啟用pool。請以整個start＋identity／check共同10秒deadline，任何失敗均關閉並確認所有候選child退出；成功才可加入active。原4秒SQL timeout確實kill child，可保留，不得將此fatal改成普通admission拒絕。
3. **新fixture沒有隔離PDF抽取來源；摘要oracle亦需落齊。** `attachmentknowledge` 同時放進所有published頁正文，FTS僅讀title／content，故目前 `pdf` query實為published-marker，不能聲稱新builder已驗PDF-only抽取文字。最小修正是在來源分開明示 extractedText，放至少一個正文／title沒有的詞，再由獨立來源predicate產expected；不要求跑PDF parser或渲染。若不做，必須降格此主張並保留必要功能未驗，不能當PDF輸入資格已過。`load` 已要求 exact snippet，而所讀fixture尚無snippet；這項須在新產物freeze前對齊，不能從引擎輸出取expected。
4. **磁碟護欄目前只在開始前查，沒有覆蓋更新增長。** `environment.py` 的8GiB檢查只在load前，`download` 的10GiB free檢查只在下載前；卡卻承諾碰界立即停止。請至少在更新前用candidate實際bytes預算staging／最終兩版並核free與總量，正式期間用有界頻率監控free及研究目錄增量／配額，觸界沿共用停止路徑處理；不必每500ms掃整棵目錄而污染負載。

**接受限定 pin probe。** 可在smoke增加 admin-gated、明確test開關的hold request：先證已pin V1，再做真V2 update；等待真activated最多45秒，核held請求仍回V1，後送V1 URL409，新V2內容正確。超時／取消須釋放reference與slot。正式從fresh cache／V1重開且記開關關閉，容量負載不人工hold；正式自然跨activation只報觀察數，零樣本不宣稱其自然零中斷。這只補pin／in-flight機制，不是容量數值或真人任務證據。

下一次只定向核上述修正、freeze receipts與smoke產物；不增加全矩陣或重跑L。

## 定向複核與正式 gate（2026-11-16）

上述四項實作 finding 已關閉／按明示範圍收斂：

- runner 共用 executionAbort、15分鐘 watchdog、request／control／sleep／update取消及停止後不啟後續control已落地；drain後等待pending settled再統計。formal controller finally停止本輪reader／MinIO units。runtime更新接client取消，下載40秒與pool啟動／check總10秒分別有界。
- Pool.start以整體Promise race包ready與check；失敗await close所有候選children，close先終止、500ms後升級SIGKILL並等exit。4秒SQL超時仍為fatal，不偽裝成普通admission拒絕。
- fixture以原來源計算exact snippet，另建oracle2保留舊產物。PDF查詢按主agent決定收斂為published-marker：本輪不證明新builder的PDF-only抽取文字入索引，也不能直接繼承舊E1該項資格；需在plan／fixture-contract凍結時一致標明。
- 安裝前以baseline＋兩DB＋128MiB投影8GiB，controller每5秒記實際研究目錄bytes及free，guard由500ms sampler接共用停止；沒有把它稱成檔案系統硬quota。

已離線核 Windows smoke-3 證據：17個control checks無失敗；61條raw皆ok（V1契約25、mixed10、held-V1一條、V2契約25），20個resource樣本維持reader `200000 100000`／1GiB／swap0及MinIO `100000 100000`／512MiB／swap0。events與raw相符：badHash拒絕後維持V1；held-pin先於真V2下載／activated，held回V1；後送舊URL409，V2契約正確，舊pool有retired-drained。最終reader PIDs為1597／1663／1664，與新pool相符。這是10k smoke機制證據，不是100k容量或自然零中斷。

**正式 gate 裁定：沒有剩餘實作阻擋；完成既定freeze後，可執行一次100k正式卡，不需再加smoke或矩陣。** freeze須鎖實際native執行的service／pool／worker／storage／load及controller、Next build outputs／dependencies、100k oracle2／兩DB／物件、非機密配置與limits，並讀回hash；正式fresh V1與testHooks=false仍由runner檢查。當前Next build receipt只記耗時與版本，不單獨充當hash保全。大型oracle未鏡像Windows可保留native並記SHA；此審查沒有假稱已讀取尚未提供的final freeze。

本次讀到100k oracle2 build報告兩DB為333,697,024及333,807,616 bytes，只作預算／更新規劃，不推正式容量結果。原smoke-1環境失敗、smoke-2與smoke-3各自保留；smoke-3成功不改寫早期失敗。Reviewer未起服務或新增負載。
