# K2 唯一備案：reader 記憶體 1→4 GiB

2026-11-16。**選擇並批准一次 resource-only fallback：reader維持2 CPU，只將MemoryMax由1GiB改為4GiB，swap仍為0。** 不改程式／SQL／兩workers／query4秒／pool-start30秒／資料／工作負載／各lane門檻；MinIO維持4 CPU／4GiB與原Go heap軟靶。本文件同時是有界備案卡，未由reviewer啟服務或執行負載。

## 原配置裁定與選擇理由

已讀 `formal-1/ready-failure.json`、`limits.json`、`events.ndjson`、公開設定及reader log。原2 CPU／1GiB候選在**ready gate失敗，尚未開始load**：V1 3,312,799,744 bytes完整下載／hash約9.748秒，隨後pool-start／quick_check共同30秒gate回WORKER_START_TIMEOUT，沒有ready事件，失敗時cgroup只剩Next PID2101，候選workers已關閉。三次status觀察的是同一cached初始化失敗，不是三輪重新安裝。不能把Next自身啟動「Ready」訊息當artifact reader已ready。

reader的memory.max events由啟動讀回0累積至34,832；失敗採樣file為949,432,320 bytes，workingset_refault_file為682,372、pgscan為11,569,669，OOM／oom_kill為0。CPU累積12.744秒、throttled約0.0159秒，沒有足夠證據將CPU quota當主要限制。因此，**先測增加記憶體，比同時加CPU或修改查詢更有判別力**。這是有根據的工作假說，不是已證明的因果根因；目前資料也沒有精確拆開每個啟動子步的30秒耗時。

MinIO本身亦接近4GiB且有memory.max／cache回收活動，不能稱完全無瓶頸。其V1交付已完成而ready失敗發生於後續本地pool gate，支持本次先保持MinIO不變。正式負載尚無任何Web／consumer／bulk容量結果，不能說百萬查詢或Web已失敗，也不能說授權／資料正確性失敗。

原`formal-1/freeze-before.json`於失敗後才產生，**只作事後provenance，不冒稱事前freeze**。原失敗、設定、來源與log全部保留。主agent已回報68項verify無差異；這不追溯補成原ready前已有freeze。

## 唯一允許的差異與成本

| 項目 | 原配置 | fallback-1 |
| --- | --- | --- |
| Reader CPUQuota | 200% | 200%，不變 |
| Reader MemoryMax | 1,073,741,824 bytes | 4,294,967,296 bytes |
| Reader swap | 0 | 0 |
| Worker數／cache／queue／SQL／query期限 | 原K2卡 | 全不變 |
| Pool-start／quick_check、下載、更新期限 | 30s／100s／整條150s | 全不變 |
| MinIO | 4 CPU／4GiB，Go heap軟靶1GiB | 全不變 |
| 來源、artifact、oracle、SSR、lane負載、門檻 | 原K2卡 | hash相同，完整沿用 |

新增的是每reader **3GiB記憶體上限／規劃預算**，不是已實測新增常駐用量，也不是自動等於三倍公司費用。更新兩版DB合計約6.63GB，大於此記憶體上限，仍可能產生page-cache競爭；不因一次ready成功就預判更新可通過。K1、原K2的1GiB失敗與4GiB備案必須分開呈現。

## 執行順序與硬 gate

1. 新 `fallback-1` evidence／cache與新reader PID，不覆寫`formal-1`；保留已發布相同MinIO物件，不重建或重發資料求較好結果。比對原provenance與本輪程式／build／兩版artifact／oracle，記錄只有readerMemory及attempt路徑／新PID等必要設定差異。
2. 記新設定、實際cgroup `cpu.max=200000 100000`、`memory.max=4294967296`、swap0、MinIO相同設定，以及初始化前新cache為空的證據。完整程式／build／artifact／oracle／非機密設定hash receipt須在正式load前完成；區分ready前已記的設定／來源與ready後才完成的freeze，不追溯宣稱所有準備均事前凍結。本備案裁定及差異紀錄另外保留；private config只記hash不洩憑證。
3. 只做一次初始化，沿用原下載與30秒pool gate，不延長、不跳過quick_check。若ready失敗、OOM、錯identity／hash或limits不符，立即停止備案，記ready失敗與收尾；不啟load、不再換資源或修改查詢。少量status輪詢只觀察同次初始化，不觸發新嘗試。
4. ready成功後核V1、兩workers及所有PID仍在reader cgroup、testHooks=false、安裝DB符合pin。記ready elapsed／資源後，即可執行**一次原K2正式卡完整序列**：Web baseline→consumer階梯→合格最高率＋bulk→合格才更新。門檻與停止規則完全沿用；不需再做額外smoke或開另一矩陣。
5. 全程900秒shared deadline、16秒drain、disk guard及controller finally停止自有units沿用。保存各未執行phase、各lane失敗／409、資源、事件、事後hash與實際cleanup。唯一fallback額度至此用掉，不自動追加第二備案。儀器問題仍須另經既定review，不能把容量／品質失敗改名重跑。

## 結果如何解讀

這是**配置敏感度觀察**。前次下載、MinIO cache、host page cache與執行順序已改變，fresh應用cache／新PID不等於全機cold；不清全機cache、不為配對再跑1GiB。即使4GiB成功，也只能支持「此較高記憶體配置在本次順序與已知資料下可啟用／完成哪些任務」，不能單憑一次前後結果證明所有改善都由增加RAM造成。

若ready成功而Web／consumer／下載／更新仍失敗，按原lane和query、queue/run、event-loop、cgroup事件判讀，保留未證根因；不改exacttotal或默放寬門檻。若各階合格，報已測最高率，仍非最大容量、正式consumer接受或A／B成本勝負。

中央發布成本另列：既存stream publisher兩版PUT約6.657GB、GET約6.657GB、26.06秒，process maxRSS120,696KiB（約117.87MiB）；不是reader的資源消耗，也不等於production發布／發現／IAM已完成。此備案不重做出版，原中央產製／取件／每reader預算需一起帶入後續成本判斷。

進度附記：唯一memory-only備案選擇與gate已先經review訊息回覆。主agent其後回報fallback-1 fresh PID2237／workers2257、2258，下載9.000秒、check5.031秒、ready總14.071秒；load前68項freeze完成且來源相同，正式單輪已開始。這段目前是主agent進度回報，非reviewer事後獨立驗證；待export後核原始資料，不提前判容量通過。
