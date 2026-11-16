# N1 Tantivy G3：最小接入與維護差額

2026-11-17，靜態盤點，未實作G3。依主agent回報，Tantivy E的21題單次screen通過、索引6 segments且hash未變；這不是服務容量或與SQLite的加速倍率。下列直接讀取K5所沿用的 `scripts/c-million-20261116/{service,pool,worker,storage}.mjs` 與K5 environment、目前Rust reader。

## 可先做G3a混載，但不得當G3結案

**可以**先在全新runtime把search op替換為預載Tantivy，沿用原Next build、metadata SQLite與異地MinIO閱讀／附件路徑。此階段只回答Web／consumer共享資源是否仍有競爭，能快速否證「單題快所以整套就可用」。索引在負載開始前已完整校驗並ready，清楚標示不測index下載、冷啟、更新或復原。不得拿預載G3a宣稱完整C替代版已完成。

原目標保留：只有G3a值得繼續才做G3b完整index＋metadata版本更新；其工程差額另記，不能用未知人時直接判不值得。若預算結束於G3a，結果是「混載可行、發布／生命週期未完成」，下一卡再決定，不默默取消更新驗收。

## G3a具體變更

| 接縫 | 可沿用 | 必要新增／小修 |
|---|---|---|
| Next與API | K5 `CAP_SERVICE_URL` 動態載入新service，不必重build UI；page/media/SSR主路徑 | 新runtime clone；search送Rust typed tokens，剝除研究diagnostic避免不等價回應負擔 |
| 身份與filters | service先限制all/a/none、query長度120、tags最多10 | `URLSearchParams.get('spaceId')` 無值為null，Rust會拒絕顯式null；adapter須省略該欄位，不放寬授權 |
| pool | queue16、admission 4秒、版本pin與refcount思想 | Rust用stdin/stdout JSONL而非Node IPC；新增request id對應、ready、EOF/crash、取消／kill、清理。不能直接將現有child.send改名即算完成 |
| metadata | 原SQLite worker的page／media／check與bodyKey/hash | metadata與Rust search各有reader但由同版aggregate handle持有；search回應snapshot必須驗與pinned.version一致再輸出 |
| 公平資源 | 同一reader cgroup包Next、Node metadata workers、Rust readers；MinIO另計 | PID／status／metrics改為列兩種程序；harness目前假設全部worker cmdline是worker.mjs，需更新assertion不能刪除歸屬檢查 |
| admission | 保留既有服務錯誤／timeout語意 | 兩個子pool不可各自queue16而偷偷變32。採aggregate有界admission，再分派search/page；排隊與執行合計deadline，不只限制Rust計算 |

最簡單起點是一個metadata reader＋一個Rust reader，兩者納入4CPU／8GiB總預算；是否增加reader由實際排隊決定，不直接複製K5的8workers。這是不同服務拓撲，需要在結果中明示；少量metadata額外process也算新增資源。控制器仍在reader quota外。

不建議在每個舊Node worker內再偷偷spawn Rust而只殺Node：timeout可能留下Rust持續計算。若採wrapper，必須有子程序追蹤／whole-group cleanup；直接RustPool＋metadata pool較容易明確盤點，但它仍是客製維護工作。

## G3b的新增差額

現在K5 `install()`只下載單個search.sqlite，再建立一個Pool；`active=x.pool`與舊pool refs歸零退出只針對單個資源。Tantivy有多個segment／meta檔及n1-manifest，不能直接沿用單檔descriptor。

最低變更是release manifest列出Tantivy全檔案及metadata SQLite，包含共同snapshotId、source hash、schema/tokenizer/binary相容識別及逐檔bytes/hash。原storage.download可逐檔重用；使用獨立staging目錄，禁止未列檔案／路徑穿越，全部驗完才啟動兩種reader並原子切換aggregate active handle。無需為本實驗新增壓縮封裝；若用tar則又增加安全解壓與解壓資源工作。

既有refs須pin整個release，舊版metadata與search同時保留到請求完成，再停止全部舊程序；部分新reader啟動失敗只回收新release，不影響active。改版時要驗V2的page-space／tags變動與新增page，不能僅換index版本字串。

storage現有磁碟guard按單descriptor `2×bytes`，需要改為整包、新舊同存及暫存總額；更新限速與global deadline亦須覆蓋整包。K5舊update硬限150秒，N1觀察窗另有定義，實作前須固定兩者關係，不可失敗後偷偷延長。

最省一次性工程的metadata做法是沿用原完整SQLite DB，但其中FTS及正文仍在，即使不再搜尋也必須算全部儲存／下載／校驗成本。移除FTS、另產metadata-only是另一項producer改動，不能當免費節省。V2 Tantivy尚須重建並發布；原SQLite V2的成功不能替它背書。

## 兩小時剩餘工程是否可信

G3a存在明確接縫，因此可以給一個有界嘗試；但目前沒有可靠active-time資料或已完成整合，不能承諾2h必能完成。G3a需要新IPC pool／aggregate lifecycle、null處理、PID／queue instrumentation以及必要端到端反例，不能把只有HTTP回應成功視作完成。

**不把G3a＋G3b完整交付承諾在同一2h內。** G3b除了多物件發布還有atomic activation、雙reader drain及失敗回收。先記G3a實際改動／耗時，若成功且有餘裕才繼續G3b；到預算就保留缺口，提出新的有限工作包。研究時間與未來日常DevOps工時分開；新增程式不自動等於高工時，也不因一次順利而等於零維護。

建議主agent下一步：待正式G2支持Tantivy候選後，先固定G3a單契約E與共同W/M負載，補search→page→media及身份拒絕的最小smoke，再按原N1重複窗口執行；通過後帶此差額表決定G3b。E未達標才另討論L，不能在G3無提示更換契約。A的完整維護成本仍未知，這輪不能宣稱已比A省。
