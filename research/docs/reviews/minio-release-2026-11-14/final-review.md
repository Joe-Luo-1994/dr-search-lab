# MR1 獨立審查：完整 MinIO 版本與可替換 SQLite cache

2026-11-14。**本版有界 MR1 通過：八個小型 scenario／86 HTTP，以及兩次空新 cache 百萬副本恢復／各八 HTTP。** 證據支持「MinIO 保存完整 artifact，Next 的 SQLite 本地副本可重新取得」這個方向；未證明正式 DR、完整舊 M01、透明切版或總維運成本已較低。

標準與 oracle 由 reviewer 組先凍結，implementation 組完成候選、故障 driver 與執行；reviewer 再讀原始證據、審查程式與獨立全檔 SHA。兩組皆為 agent，不是內部 DevOps／consumer owner 接受。來源分離以程式與 runtime path 證據為準，原 producer 仍可在主機讀取，沒有 namespace 故障隔離。

## 確實跨過的門檻

每個小型版本是 24 頁、三 Space、49,152 bytes SQLite 加三個各 88 bytes 的獨立 MinIO 附件。搜尋命中、授權 total、全部回傳 page 集合、title、highlight、版本 URL、正文與附件 SHA 均用原始合成 doc oracle核對，不從受測回應自我比對。

| Case | 真實觀察 | HTTP |
|---|---|---:|
| 初次 v1 | 空 cache GET 四物件，完整三身份鏈與邊界防護 | 18／18 |
| 中斷下載 | 真 MinIO GET 的本地 Transform 主動中止，TRANSFER_INTERRUPTED，v1 仍完整 | 9／9 |
| 缺附件 | manifest 引用的最後附件不存在，NoSuchKey，v1 仍完整 | 9／9 |
| 同長錯 bytes | 附件長度相同、首 byte 被改，SHA256_MISMATCH，v1 仍完整 | 9／9 |
| updater 重啟 | PID16657 在 DB 完成、附件前 barrier 被 SIGKILL；新 PID16668 再處理缺件，NoSuchKey | 9／9 |
| 無完整舊版 | 空 cache 安裝失敗，Web listening=true／ready=false、health503；三功能均 RELEASE_UNAVAILABLE | 3／3 |
| 完整 v2 | 四物件全部驗證後啟用，fresh reader只回v2，舊marker零筆 | 18／18 |
| 舊鏈路由 | v1 reader 舊鏈仍200；v2 reader 收到 v1正文／附件 URL 明確409 | 11／11 |

四故障的 active.json SHA 前後一致，維持 v1 `39e761cd…5018c75`；只有完整 v2 安裝才改為 `6f73804a…53ed90`。故障含驗證舊鏈整個 case 約 0.268–0.354 秒，均低於預定60秒。失敗原因具體，不以任意錯誤代表完整性防護成功。

故障是刻意注入，不是實驗功能未通過；全部預期拒絕仍留 log。86 HTTP不是86種能力，也不代表連續整個故障窗口無中斷：舊鏈在每故障結束後抽測，沒有持續到達負載。restart只驗一個 partial barrier，未遍歷 fsync、rename、pointer提交前後所有crash點。

## 2.133 GB 真 MinIO 與兩次 fresh reader

既有百萬 DB 不重建、不刪除，向新 MinIO prefix 上傳一次 **2,133,065,728 bytes**；包含正文與FTS，不是純索引。upload約10.135秒。兩個新的空 cache 各實際 GET 全檔、校驗 SHA，啟動獨立 Next production PID16809／16892及各自 child，runtime sourceDb 分別指向 `cache-cold-1`／`cache-cold-2` 的 release DB，沒有指向 `.lab/ms1` 舊來源。

| 恢復副本 | installer父程序時間 | 空cache開始→八項HTTP完成 | HTTP |
|---|---:|---:|---:|
| cold-1 | 9.145秒 | 12.672秒 | 8／8 |
| cold-2 | 9.412秒 | 13.081秒 | 8／8 |

兩次皆低於本卡暫定120秒參考。八項是 small／huge／all各搜尋→正文、unknown auth503及pageSize51明確400；page total／Space／正文 SHA由既有 reviewer corpus公式獨立計算。三搜尋單次約0.676–1.187秒，正文約5.9–17.8毫秒。樣本太少，不能產生穩態P95結論，也不取代前輪百萬mixed P95約2.44秒未達2秒參考的缺口。

Reviewer 在正式計時與監測結束後，另對兩份落盤 DB 做唯讀串流 SHA：皆為 `bdd4a22ca136ee7112540c6a6a4c670d2871b55517ae5cdf811c0f713d21eaa0`、bytes完全一致，見 `reviewer/cache-postcheck.json`。此事後核實不算功能重播、不混入冷恢復時間。MinIO upload／installer GET及postcheck三層證據吻合。

這裡的「冷」僅指空應用cache及新程序；同主機loopback、來源hash與傳輸會暖OS page cache。第一次 cache保留以供核對，第二次改用全新目錄，沒有實際刪除第一份；因此證明不依賴第一份路徑與可再建立，未實測原host完全損毀。12–13秒不是事故開始至導流／登入／必要工作恢復的正式RTO。

## 代價與未兌現的承諾

本候選是先完整下載 SQLite 才本機唯讀查詢，**不是 SQLite 對 MinIO 按查詢遠端隨機讀取**。能少維護一個持久化搜尋叢集的可能性提升，但仍需約2.133GB本地cache，發布期間多版暫存、每reader重建完整下載I/O、artifact產製／完整性驗證、殘留staging清理、版本保留與GC。下一輪不能只展示常駐RSS而忽略這些責任。

root採樣候選 Next＋MinIO＋transfer RSS峰約651.75MiB；新artifact峰6,464,587,017bytes（約6.02GiB，主要為MinIO＋兩cache），未觸6GiBRSS／8GiB產物與4GiB剩餘磁碟護欄。背景ES另列，影響共享環境但不是候選依賴。共享cgroup峰約10.43GiB，包含其他程序、背景ES與OS cache，不能全部歸因候選，也不能以約652MiB RSS忽略整體記憶體。RSS不是最低Pod規格或正式成本比較；剩餘磁碟最低約15.05GiB。監測282秒含setup idle，不當服務存活時間，driver實際42.204秒。build12.243秒且180秒watchdog，沒有功能失敗後修碼重播；本輪102 HTTP含83個200、19個預期拒絕，不能將全部當使用者工作成功率。

本地release目錄完整驗證後rename、再切active；單writer及process-pinned reader降低本輪混版機會。啟用v2需restart/rollout，舊程序固定v1；新版程序拒舊版URL409。這相對舊M01跨reader舊鏈仍成功是**需求讓步**，consumer需重搜、重新取得同版連結，尚未經owner接受。保留舊資料不代表切版後舊連結透明可用；若核心client不能接受409，應優先另驗版本路由／保留reader，而非宣稱現方案已足夠。

installer驗證hash後，reader啟動只核manifest SHA及檔案長度，依賴受控本地cache不被同長改寫的前提；本輪未測本地損壞／TOCTOU。MinIO immutable prefix亦無物件鎖/正式IAM證據。單publisher沒有CAS競爭驗證，沒有完整distributed atomic release證明。GM／撤權／DNS／多AZ／MinIO HA／上游snapshot一致性／資料age與正式RPO、真Lexical長尾、持續負載、正式consumer／非作者runbook操作仍未知。

## 下一個決定

V3取得空cache新程序恢復的有限子證據，V5取得本卡四類發布失敗與同鏈版本核對，V6僅沿用mock Space；不能標成所有DR價值全面通過。建議下一次對口討論帶兩個具體取捨：DevOps是否接受完整cache下載/多版空間/發布與清理責任，以及核心consumer是否接受409重搜。若409不可接受，再有界驗版本路由；若可接受，優先公司MinIO實際網路、容器限制、GM依賴的整合，避免無限微調本機搜尋。

root核對41個追蹤PID皆結束，實驗3135/3136/19400/19401關閉，原DR19300仍ready；所有本輪資料與故障log保留。九項reviewer凍結輸入SHA未變；coordinator事後核對23原檔hash、4封存索引完整digest、小S1完整digest及3容量ES metadata/count皆不變，沒有重掃百萬ES內容digest。未commit/push，未公開服務，沒有新增付費資源。
