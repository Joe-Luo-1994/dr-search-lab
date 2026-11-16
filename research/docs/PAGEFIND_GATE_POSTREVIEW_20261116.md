# Pagefind gate 事後獨立審查

2026-11-16。只讀原始紀錄與程式，另做離線 SHA 保全；未重跑 build、查詢或服務。

**裁定：G1 有效通過；G2 首題因研究預算超時停止，能力 gate 未完成。** 不把它改記成通過，也不把它解讀為 Pagefind 引擎本身慢、100k 全面不可行，或正式產品必須在 5 秒內完成。5 秒是本輪事前定義的停止界線。

## 可採信的結果

- G1 原始 controller 與 verification 共同支持：100k 來源、mapping、fragments 與完整產物核驗成功；builder 124.299 秒、wrapper 含核驗 161.139 秒、controller 含監控／清理 162.811 秒。4 CPU／12 GiB／swap 0 下 memory.peak 為 8,499,032,064 bytes，沒有 memory max／OOM 事件。這修正了「目前只有較小 Pagefind 產物」的證據狀態，但不能由此推論 1M builder 或 reader 常駐需求。
- G2 首題為 `commonterm`、身份 `huge`、第 1 頁、每頁 10 筆。來源 oracle 預期 total=50,000。`cases/01-ms1-common-huge-page1.json` 保存 **5,003.314 ms／TimeoutError**，沒有取得 HTTP response，沒有實際 total 或 hits 可供正確性比較。不能說回錯文件、錯授權或缺少目標；只能說這次完整請求在限時內未完成。
- 外部 controller 保存 `status=stopped`、`reason=QUERY_TIMEOUT`，整輪 **49.345 秒**；實際 4 CPU／4 GiB／swap 0，memory.peak=2,153,762,816 bytes，memory max／OOM／CPU throttling 事件為零。這些是含建置與準備的整組觀測，不能當成首題獨立資源剖析或根因證明。
- 原始首題已 fsync，operation marker 保留。外部 kill 使 runner 未能完成 finally 後置 hash，故沒有 `results.json`；這是保留的中斷結果，不能補造正常結束 summary。其餘 **31 個必要案例與 1 個歷史 Node 觀察均未執行**。小 fixture 建置完成不等於其 Tags／PDF／中文／授權案例已驗證。
- controller `remainingPids=[]`、`cleanupErrors=[]`、MainPID=0；unit signal／status 9 是本輪硬停止的紀錄。沒有把它洗成程序正常退出。

主要來源：`evidence/pagefind-gate-20261116/g1-control/result.json`、`g1-verification.json`，以及 `g2/control/result.json`、`g2/cases/01-ms1-common-huge-page1.json`、`g2/operation.json`、`g2/serve-ms1.stdout.log`／`stderr.log`。

## 事後保全：完成，但不取代 G2 驗收

獨立讀 native frozen 路徑：**10,469 檔 SHA 全部相符**。G1 inventory 的 SHA 符合 verification pin；實際 **101,571 個產物檔案**逐檔大小與 SHA 全部相符，名稱集合沒有新增／遺失／特殊檔。`results.json` 確實不存在。

新獨立 receipt 為 `evidence/pagefind-gate-20261116/g2/reviewer-poststop-preservation.json`。它證明本輪停止後的原輸入與 G1 產物仍完整，不證明未執行的能力、不回填 runner 的 after 欄位、不改原始失敗。

## 下一個唯一值得考慮的診斷

**建議一次「同首題、同預算、只有分段觀測」的冷啟動診斷，尚未授權或執行。** 用新的隔離副本保持來源、query、身份、total／排序契約、4 CPU／4 GiB 及 5 秒外部硬停止；只增加停止後仍能讀到的階段開始／完成紀錄：state／SQLite 開啟、Pagefind import／options、`pf.search`、結果 mapping 與授權核對、10 筆內容組裝／回應。資產 listener 同步記取得的路徑、bytes 與完成時間；不輸出內容，不添加第二個 query 或預熱救分。

原因是凍結 MS1 adapter 目前在 `pf.search` 返回後，會對**全部結果**逐筆查 SQLite mapping、核 Space 與去重，再選本頁 10 筆。這是已存在的實作責任，不能從這次沒有 response 的紀錄得知時間花在這裡，還是 cold loader、資產取得、搜尋或其他階段。現有 engineMs／mappingMs 只隨成功 response 返回，無法回答停止位置。

紀錄應在階段邊界落盤、mapping 只做粗粒度進度，不讓追蹤本身變成每筆同步 I/O。若一次診斷能定位阻塞階段，停止並只評估該階段的一個候選改動；若仍無法定位，保留未知，不自動加資源、放寬 deadline、改 exact total 或重跑整套。追蹤增加的開銷須明示，這次診斷也不是容量比較。

## 對選型的影響

Pagefind 已取得新的 100k 建置可行證據，同時留下中央 RAM、逾十萬檔案、版本綁定 fragment parser、SQLite mapping 與額外驗證成本。G2 尚不足以讓它取得完整必要能力資格，也不足以永久排除。SQLite 得到較多擴容與適配投入的事實仍須保留，不能把本次停止當作同資源／同成熟度對照。

本輪仍是舊 MS1 本地資料路徑及另建能力 fixture，不是遠端內容 C 的整合驗收；歷史中文 Node／browser 差異未重新觀察、更未閉合。A 完整 stack 的維運差額、正式 consumer／ReBAC、每站 reader 容量與真人任務品質均未因此得到答案。
