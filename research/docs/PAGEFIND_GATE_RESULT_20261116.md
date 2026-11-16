# Pagefind：十萬頁建置通過，首個 server 查詢碰到停止門檻

2026-11-16。**G1 已產出並驗證完整的 100,000 頁合成 Pagefind 包；G2 第一個冷 API 查詢未在 5 秒內回應，依卡片停止。** 這解除本配置的中央建置疑問，但尚未通過 reader 必要能力驗證；也不能把逾時歸因為引擎能力上限或記憶體不足。

| 這輪要回答什麼 | 結果 | 如何影響選型 |
|---|---|---|
| 100k 能否完成中央建置？ | 固定預算內完整通過 | 舊 6 GiB 軟預算失敗不足以排除 Pagefind |
| Next server 的必要搜尋流程是否通過？ | 首題 5 秒截止，後續未執行 | 保留候選，但沒有可宣稱通過的 100k reader 證據 |
| 是否比 SQLite／完整 A 省維運？ | 尚未知 | 不能拿中央建置成功、少部署單元或本次記憶體峰值判勝負 |

本輪使用 Pagefind 1.6.0、Node 22.18.0、ICU 77.1、SQLite 3.50.2；沿用 MS1-v1 合成來源，1,000 個 Space，其中一個有 50,000 頁。來源 JSONL 約 123.17 MB，正文約 109.98 MB。這個 MS1 方案仍將正文／附件保存在本地 SQLite，未整合 C 的異地 MinIO 取件。

**完成了什麼、花了多少資源**

| 項目 | 本輪觀察與口徑 |
|---|---|
| 硬限制 | 整個受測程序樹：4 CPU 配額、12 GiB `memory.max`、swap=0；期限 30 分鐘。實際 `cpu.max=400000 100000`，非專屬四顆 CPU。 |
| 全流程時間 | 控制器 **162.811 秒**，含監控／收尾；建置＋稽核 wrapper **161.139 秒**。兩者都不是單獨 Pagefind 寫索引時間。 |
| 原 builder | 內部總計 **124.233 秒**：ingest 64.678 秒、Pagefind write 39.098 秒、mapping 16.712 秒，其餘為 manifest／清單等。wrapper 觀察到 builder 返回為 124.299 秒。 |
| 新增完整性工作 | 來源與映射稽核 **17.130 秒**；逐檔 SHA／清單及凍結檢查階段 **19.696 秒**。已包含在 wrapper 時間，不能再次相加到總時間。 |
| 記憶體 | cgroup `memory.peak` **8,499,032,064 bytes（7.915 GiB）**；取樣程序樹 RSS 峰 **8,406,511,616 bytes（7.829 GiB）**。前者包含 cgroup 計帳的檔案快取／核心記憶體，後者為取樣 RSS，不能互換。 |
| CPU／退出 | cgroup CPU 累計增量約 **176.796 CPU 秒**；工作程序 exit 0，OOM／OOM kill 皆 0，清理後無剩餘 PID、無 cleanup error。systemd 最終 signal 9 是控制器保留計數器後終止監督程序的收尾記錄，並非 builder OOM。 |

驗證逐頁核對 source 的 title／正文／Space／附件；SQLite integrity check、100k pages 與 100k `pf_map` 雙向完整性、100k fragment 的 pageId／title／Space 均通過，再為每個產物記錄 SHA-256。這不是以「有輸出檔」代替完整性，也還不是搜尋答案正確性驗證。[原始驗證](../evidence/pagefind-gate-20261116/g1-verification.json)／[限制與退出](../evidence/pagefind-gate-20261116/g1-control/result.json)／[逐次量測](../evidence/pagefind-gate-20261116/g1-control/metrics.ndjson)。

**252 MB 不是純搜尋索引**

| 產物 | 檔案數 | Logical bytes |
|---|---:|---:|
| Pagefind bundle：索引分片、fragment、JS/WASM 等 | 101,569 | 97,747,059（93.219 MiB） |
| `data.sqlite`：正文、metadata／附件與 pageId 映射 | 1 | 154,439,680（147.285 MiB） |
| manifest | 1 | 18,048 |
| 合計 | **101,571** | **252,204,787（240.521 MiB）** |

逐檔稽核的 allocated 為 **608,612,352 bytes（580.418 MiB）**；控制器收尾為 **613,355,520 bytes（584.941 MiB）**，後者另計子目錄配置空間，口徑不同。不可拿 logical 大小直接當磁碟配置；十萬多個小檔也會影響打包、解包、校驗及同步工作。[完整檔案清單](../evidence/pagefind-gate-20261116/artifact-inventory.json.gz)。

**決策意義與成本仍有哪些未知**

新增的工程責任包括：程序樹硬限制／外部逾時及清理 controller、來源與逐檔稽核，以及 Pagefind fragment→可信 pageId 映射整合。映射仍使用 SQLite，且解析 Pagefind 1.6.0 私有 fragment 格式；升級需重驗。以上量到的是集中建置及驗證的運行成本，**實際 DevOps 工時、長期維護費用與每站 reader 成本仍未知**。

舊實驗是在 6 GiB 程序樹 RSS 軟預算停止；本輪是 12 GiB cgroup 硬限制，計帳方式及 Node 版本也不同。不能把兩者作等同比率比較，或將成功只歸因於增加 RAM；本輪更沒有測得最低所需記憶體。尚不啟動百萬 Pagefind、reader 壓測或與 A／B 的成本排名。

**G2：一題逾時，依約停止；不是 32 題全失敗**

實際使用 Next production server，整組包含程式／產物 hash、Next build、小 fixture build、服務與 runner，固定 4 CPU quota／4 GiB／swap 0／15 分鐘。Next build 與小 fixture build 已完成，server 已回報 ready。唯一送出的 API 查詢：

```text
user=huge, q=commonterm, page=1, pageSize=10, engine=pagefind
來源 oracle：可讀 Space 有 50,000 頁，全部符合；應回 total=50,000、10筆授權結果。
實際：5,003.314 ms 時 fetch TimeoutError，尚未取得 HTTP response。
```

這是這個新 server 程序的第一個查詢；檔案在前置完整性檢查中已讀取，因此不能稱 OS 磁碟快取也冷。5 秒是本次有界實驗截止，**不是公司已接受的正式搜尋 SLO**。冷初始化、索引資產載入、Pagefind 查詢、50k 結果映射／計數及 Next 回應處理尚未逐階段定位；不能說是哪一項造成，也不能推論暖查詢必然同樣慢。

控制器 reason=`QUERY_TIMEOUT`，全 G2 到停止／清理約 **49.345 秒**；監測所記錄 OOM／OOM kill／CPU quota throttling 計數為 0，remainingPids／cleanupErrors 皆空。記錄到的整組 `memory.peak` 2,153,762,816 bytes（約 2.006 GiB）包含前置工作，**不是搜尋服務單獨的記憶體需求**；沒有記錄到 OOM 不等於已定位效能原因。[首題完整證據](../evidence/pagefind-gate-20261116/g2/cases/01-ms1-common-huge-page1.json)／[控制器退出](../evidence/pagefind-gate-20261116/g2/control/result.json)。

完成搜尋驗證 0 題，已嘗試 1 題；其餘 11 個 MS1 案例、20 個小型案例（含 Tags AND／PDF 抽取字／授權），以及預定的 1 個舊中文 Node 觀察均未執行。舊小型成功證據仍在，本輪沒有重驗成功，也沒有消除歷史中文 server/browser 差異。

外部 controller 在截止後終止整個 cgroup；runner 的最終 results.json 未及寫出。這不是遺漏了成功結果：逐案例 JSON 與 fsync 的 cases.ndjson、控制器紀錄均保留，結論以這些已落盤證據為準。任何事後唯讀完整性檢查只確認證據未變，不會把 G2 改為通過。

**本輪停止點與下一個有價值的問題**

沒有加 RAM、提高本輪截止、重排案例或重跑取得較好結果。下一項若繼續，應是同一筆 query、同 4 CPU／4 GiB／5 秒做單次可定位的診斷：分別記錄模組／WASM 初始化、資產請求、引擎、映射與回應階段，確認時間花在哪裡。診斷若另需較長觀察窗，必須另列新卡；不能把診斷窗口放寬包裝為原 5 秒契約通過。先定位，再決定暖機、adapter 修正、資源或方案是否值得投入。

目前新增的是實驗控制器、獨立 oracle、原 builder 外部稽核、12頁 Tags adapter／映射及 Next harness；其實驗程式量不等於正式維運工時。小 fixture 採 JSON 映射，十萬頁仍為 SQLite 映射；不能宣稱十萬頁已移除 SQLite。正式 ReBAC、遠端正文／附件 C 整合、版本更新、Web／consumer 干擾及多站總成本仍未驗。

[Reviewer 結果審查](PAGEFIND_GATE_POSTREVIEW_20261116.md)確認 G1 通過、G2 停止與限制；事後獨立核對 10,469 凍結檔及 101,571 產物的 bytes/SHA/清單均相符，見[保全 receipt](../evidence/pagefind-gate-20261116/g2/reviewer-poststop-preservation.json)。Agent token／帳務成本未取得可靠數字，不估算；上述耗時為可觀察的實驗 runtime，不是團隊人力估價。
