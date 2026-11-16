# C 容量候選 K1：執行卡 v1（reviewer 已允許完成 freeze 後單次正式執行）

主要價值 V4（容量與資源）、V8（新增工程／維運）。只評估 C，不啟 B、不推導 A 比較勝負。合成研究靶點並非公司 SLO／正式部署建議。舊實驗檔、證據與失敗不修改。

## 候選與固定預算

Linux WSL2、Node22.18.0、真 Next production server、長駐 SQLite worker，正式依賴版本與執行 hash 在 freeze receipt 記錄。reader 整個 systemd user service：CPUQuota=200%、MemoryMax=1GiB、MemorySwapMax=0，包含新舊 workers、Next、下載校驗及啟用。MinIO 獨立 CPUQuota=100%、MemoryMax=512MiB、swap=0，獨立資料目錄與 loopback ports 19540/19541；reader3172。實際 cpu.max/memory.max/swap/procs/events 必須符合，否則不開始正式階梯。builder／generator 不在服務預算內，分帳記錄。硬限不是專用核心／網路／磁碟保證。

100k indexed pages 為唯一正式工作集；10k只做儀器／契約 smoke。100 Spaces，50%大Space；正文約99%1KiB、1%8KiB；6類固定query涵蓋common/rare/Chinese/Space/Tags AND/absent，exacttotal+Top10+摘要。256頁完整遠端正文與8附件構成固定hot working set，其餘僅搜尋，不宣稱100k全內容交付；manifest明示bodyCoverage=subset。附件含64KiB／2MiB／8MiB，驗bytes/hash非PDF渲染。V2真改Space/Tags/正文/附件並增頁。source seed與獨立oracle由builder固定，預期集合／total不由SQL產生。

資料庫含metadata/全文/FTS，按ID與命中取摘要，不每request讀全manifest；兩長駐workers，每版queue16，讀取cache每worker8MiB/mmap0；metadata也走workers。內容最多4件在途、每件8MiB，完整驗hash再交付，持有slot至傳輸完成；不提供Range，明確研究限制。查詢4s worker期限、client5s。授權是明示mock，不稱正式ReBAC。舊URL切版後409，inflight在請求開始pin版本，舊worker於references歸零後關閉；保留兩版磁碟。

## 負載、門檻與停止

先freeze code／oracle／artifact／dependencies／limits。warmup10秒2req/s另記，不納正式。階梯採open-loop：search [1,4,8,16,32] req/s；content [2,8,16,32]（page/media各半）；mixed [2,8,16,32]（6 search:3 page:1 media）。每階20秒，等待在途結束後下一階；generator在途最多64，5s截止，不重試，不偷偷降到達量。

每筆保存scheduled/sent/done/type/query/version/status/bytes/check，記offered/sent/completed/timeouts/rejected/missed與包含排程延遲的P95。排程落後>250ms或漏送使該階無效；錯內容／越權／total或集合不符／OOM／worker非預期退出／磁碟護欄立即停止整輪。預期admission503或timeout>1%，或含排程延遲P95>2s，該階不合研究靶點、停止升階；下一phase可從卡定低階開始。20s是短窗觀察，不稱穩態認證；不能對失敗臨時調參後合併統計。

update phase60秒，負載取mixed已合格最高率且上限8rps（無mixed合格則不做）；第5秒啟用已發布真V2。從MinIO完整下載新DB，在reader預算內stream落盤/hash，控制最高8MiB/s以觀察有界重疊（明示應用節流非WAN模型），校驗identity／quick_check後啟新pool並原子替換目前version。記下載開始/結束、啟用、舊pool排空、實際前後版本及oldURL409；若無實際請求重疊不得判更新共存成立。下載／啟用不稱RTO。預定損壞hash候選在smoke拒絕保舊，正式不注入額外fault。

每500ms記兩cgroup CPU、current/peak、anon/file、events、procs；保存各階差值與累積峰。單獨記DB／兩版／staging logical bytes及磁碟free，logs不無限累積，研究目錄總上限8GiB且free至少10GiB。MinIO和reader同主機loopback；producer已暖原件page cache，reader下載產生獨立inode由reader歸帳，但cache仍受主機環境影響，不稱全機冷cache。附件固定hotset須顯示。

總負載時間上限15分鐘，服務RuntimeMaxSec=1800，沒有需求支持無限升階或長時間soak。先smoke；若儀器故障最多一次經review修補並以新attempt記錄，正式產品錯誤不改寫或自動重跑。完成／失敗皆停止本輪自有units，保留runtime與原始證據。主agent整合、fixture agent做source/oracle、runner agent做負載紀錄，reviewer只核設計與事後證據。

凍結前補充：每階包括所有offered工作之終態（含missed/拒絕/5秒timeout），發送窗口結束後最多6秒drain；分母不因失敗刪除，另報整體elapsed throughput。update維持同錯誤率/P95靶點，409單列為需重搜、不是成功且不納一般拒絕率。60秒內未啟用V2、沒有V1/V2合成oracle成功、或無真實下載重疊皆不得判更新成立。下載最多40秒、worker啟動／校驗最多10秒；update client55秒，不允許失敗後背景無限重試。由10k產物33.55MB推得100k可能接近335MB，8MiB/s在40秒deadline邊緣，因此正式前控制速度改為16MiB/s；尚未跑正式負載，不屬事後調參。下方/前段8MiB/s歷史草案以此修訂為準。

## 成本紀錄

記catalog/摘要按需、worker/queue、下載buffer/admission、版本installer/排空/回收五工作包的新程式、依賴、測試、故障與人工介入。自動量builder/build/publish/install/run時間、artifact與傳輸bytes、操作命令次數。agent經過時間不是工程人日；token／金額不可取得則未知。正式MariaDB匯出、ReBAC/SSO、K8s rollout/IAM/GC/告警尚未產品化，不因PoC完成免列維護。

## 最終 freeze 口徑（2026-11-16 Asia/Taipei；沿用實驗ID）

- 除前述6類，fixture另含published-marker、restricted、restricted-tags，共9個等輪替query shape；marker同時在正文/PDF，**新builder未驗PDF-only抽取文字入索引**。不繼承舊E1的PDF-only成功作新build驗收。
- 最終使用fixture-100000-oracle2（100000/100001頁）；oracle2只增來源獨立snippet欄，DB內容hash需在freeze核對。10k smoke-3含精確snippet／hash與admin限定held-pin跨啟用探針；正式config.testHooks=false，fresh v1 cache。
- 更新限速最終16MiB/s；下載總deadline40秒、整個Pool.start含quick_check最多10秒，失敗await child退出。runner共享abort及900秒watchdog，正式controller finally停止本輪雙unit。5秒一次實際runtime磁碟與free觀測、500ms接guard取消，另有更新前投影。
- WSL在host工具間可閒置終止user systemd服務，smoke-1在load前初始化失敗；保留log/limits。加入1800秒foreground supervisor後smoke-2通過；smoke-3因新snippet與hold契約再驗，非正式重跑。最終freeze後正式僅formal-1，儀器修補上限一次且需review。
- smoke controlled hold只證版本pin/排空機制，正式自然跨activation樣本數另報，沒有樣本不宣稱零中斷。更新期409保留為使用者需重搜，不能列成功。
