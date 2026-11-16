# C 容量候選 K1：結果與續接

先看 [手機可讀HTML](C_CAPACITY_RESULT_20261116.html)，再按需讀 [獨立事後審查](C_CAPACITY_POSTREVIEW_20261116.md)、[成本紀錄](C_CAPACITY_COST_LEDGER_20261116.md)。本輪可有限結案，停止新增負載。沒有A/B比較或正式採用結論。

Next16.4.5／Node22.18.0，Linux WSL2。Reader全程序2CPU/1GiB、MinIO1CPU/512MiB、swap0；100k搜尋、256頁正文hotset、8合成附件（64KiB/2MiB/8MiB）。單次正式14計量階段加warmup，最高32req/s搜尋、內容、混合各20秒，更新8req/s60秒；全部符合預先研究靶點。32是已驗最高率、未找飽和上限。

| 已驗階段 | 到達率 | 含排程P95 | Reader採樣記憶體峰 |
|---|---:|---:|---:|
| 搜尋 | 32 req/s | 108.95ms | 454.66MiB |
| 正文／附件各半 | 32 req/s | 17.70ms | 468.41MiB |
| 混合6:3:1 | 32 req/s | 109.11ms | 475.85MiB |
| 更新時混合 | 8 req/s | 109.20ms | 833.22MiB |

V2 333,807,616bytes實下載19.914秒、下載起至啟用20.386秒，159正常請求與下載重疊；節流16MiB/s，非WAN/RTO。正式自然跨activation0筆，smoke刻意hold另外證pin；舊URL409仍可能要求user/consumer重搜。正式4,090 raw（含warmup/契約）全200/ok，27controls含預期拒絕，不把它們算成功使用者任務。62freeze與兩installedDB核對一致。

MinIO有記憶體回收壓力：formal maxevents+589、OOM0，累積peak516.07MiB含前置發布，不能稱寬裕。io.stat為null，沒有block-device I/O證據。publisher RSS峰約1.30GiB，屬中央工具成本；公司工程人時與token金額未知。

新實作在 `scripts/c-capacity-20261115/`，資料與runtime在native `/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo/.lab/c-capacity-20261115/`；本機 `evidence/c-capacity-20261115/`是去密紀錄，沒有MinIO root key/admin token/DB binaries。獨立native專案node_modules留在runtime/project。不要盲跑固定formal-1命令：目錄與freeze拒覆寫，新研究需新attempt卡；production部署仍未交付。

收尾：三專用端口3172/19540/19541關閉；reader與MinIO已停。reader unit failed因Next收到SIGTERM退出143；所有reader歷史PID消失，診斷保留。WSL supervisor另由主agent停止，資料不刪除。舊E1/E2/R1–R3不修改或借用成當前容量。

下一步優先核實團隊可接受的搜尋語意／409重搜、實際附件大小與流量分布、正式身份／ReBAC／consumer契約，以及A現有部署與備份自動化的增量成本。若需補驗，按能改變選型的缺口另立有界卡；不因仍可壓更高QPS就自動延長。
