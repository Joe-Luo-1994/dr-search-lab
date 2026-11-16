# C 容量候選：新增工程與維運責任

這份紀錄描述本輪實際新增的工作，不把 agent elapsed time 換算為公司人日，不聲稱比 A 更便宜。程式位於 `scripts/c-capacity-20261115/`；舊實驗保留，新候選不是 production 分支已完成整合。

| 工作包 | 本輪完成的具體實作 | 已需要的處理／維護 | 正式化尚缺 |
|---|---|---|---|
| 按需 metadata／摘要 | metadata與原搜尋文字放SQLite，查ID／前十筆時取，source oracle核snippet | 固定schema、中文正規化與SQL；版本錯誤拒絕 | 公司正文格式、正式抽取文字輸入、schema migration／真實品質 |
| 搜尋程序與流量 | 每版2個長駐child、每worker8MiB SQLite cache、queue16、4秒硬終止 | child退出、背壓、timeout、整體啟動10秒、錯誤時清理 | 正式worker復原政策、監控、consumer重試；本輪worker異常直接停實驗 |
| 受保護內容交付 | 4個內容slot、每件最多8MiB、完整驗hash後64KiB分塊寫並遵守backpressure | slot持有至完成／取消；記憶體與hash CPU；授權仍mock | >8MiB、Range／串流完整性策略、正式IAM／ReBAC；不自動以提高上限解決 |
| 版本安裝與更新 | MinIO完整stream下載到staging、hash、SQLite identity/quick_check、新pool啟用、舊請求pin／排空 | 新舊磁碟／記憶體重疊；40秒下載+10秒start；失敗保舊；保留兩版 | 公司發布可信來源、K8s rollout、排程、版本GC、告警與長期漂移政策 |
| 資源與實驗工具 | 真Next production、systemd cgroup、open-loop runner、來源oracle、raw/resource evidence | 實測CPU/RAM/swap、abort、disk guard、WSL生命週期與cleanup | Kubernetes資源對照、真實負載代表性、長期soak；研究工具非正式服務必要組件 |

## 實際發生的投入與修正

- Linux沒有本輪Next依賴快取，offline install明確失敗，之後在獨立目錄下載固定Next16.4.5／React19.3.1；沒有更改主專案依賴。
- smoke-1在負載前遇到WSL閒置終止systemd服務；保留log／空cgroup觀察，未把它視為容量結果。加入限時foreground supervisor，smoke-2才完成初始契約。
- reviewer在freeze前要求全程abort、Pool整體deadline／child清理、磁碟護欄、source snippet oracle與更新in-flight證據。修正後以新oracle2目錄、smoke-3確認，不覆寫舊成功或失敗。
- 只有formal-1是凍結後正式容量序列；沒有因負載失敗改資源／資料／查詢語意。實驗結果與未驗範圍以結果報告為準。
- 角色分工：主agent負責runtime／環境／整合；fixture agent負責source／oracle；runner agent負責負載與統計；reviewer非實作者核設計及證據。token金額與公司工程人時未知。

## 可重現操作的責任（不是每天人工執行）

中央builder需從正式來源產版本；publisher需上傳、讀回／驗證並只發布完整版本。每地reader需在ready前安裝，日常更新時保舊到新版本可用，失敗告警後仍提供舊版。這些步驟應自動化；人工成本主要在初次整合、失敗診斷、升級及演練，不能以「每天跑一次」推算每天固定人工。

本輪controller以新目錄拒絕覆寫證據，故再次執行要選新attempt並建設定；不是已交付可重入、通用的production部署工具。保留的hook只供smoke，formal明確關閉；正式產品不應直接部署研究admin／mock identity。

資源計價應分開：一次中央builder／publish、每地MinIO、每reader本地兩版與CPU/RAM、使用者內容傳輸、更新／重建下載。A已有MinIO及備份，不把這些共同項全部算成C新增或節省；A的真實部署與維運增量仍需團隊提供。B本輪未測，不代替A。

## 單次正式實測的成本數字

- 兩版builder（含fixture與oracle產生）8.18秒，程序RSS峰約514.14MiB；不是純正式建索引流程，也未施reader的硬限。
- 發布兩版5.66秒，1,065個S3請求，PUT698,105,045 bytes、GET697,968,177 bytes。publisher目前把DB完整讀入並讀回校驗，程序RSS峰1,359,336KiB（約1.30GiB），是中央工具未優化的實際成本。
- V1/V2 DB為333,697,024／333,807,616 bytes，兩版合計667,504,640 bytes（約636.58MiB），不含程式、logs、其他保留或MinIO。每reader完整更新至少搬一份新DB；不是純FTS大小。
- reader在mixed32rps的500ms取樣記憶體峰475.85MiB、平均CPU1.083核；update8rps時峰833.22MiB。更新時的file cache／程序重疊不可從規格中省略。
- MinIO限1CPU/512MiB，formal期間memory.events.max增加589，OOM為0；累積peak516.07MiB含前置發布，不能稱全程低於設定或寬裕。block I/O計數不可用；傳輸是logical bytes，非WAN帳單。
- 正式runner331.40秒，單次執行後沒有升階／改資源重跑。正式27項control、4,090 raw（包含4,020計量、20warmup、50契約）皆依原始範圍核對。時間不能當人力費用。
- controller finally停止兩服務，三專用端口均拒絕連線、5個reader歷史PID皆不存在。Next16.4.5收到SIGTERM明確exit143，systemd將unit標failed；原狀態與診斷保留，這是停止語意需在正式runbook／監控處理的接縫，非負載期間服務失敗。

實作依據：[Node22.18 SQLite同步API](https://nodejs.org/download/release/v22.18.0/docs/api/sqlite.html)因此隔離在child workers；[systemd資源控制](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)用於本輪CPU／記憶體群組限制。正式Kubernetes配置仍需獨立整合。
