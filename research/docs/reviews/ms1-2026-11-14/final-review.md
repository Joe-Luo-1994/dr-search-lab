# MS1 獨立審查：百萬總頁量的可行範圍與停止邊界

2026-11-14；審核組與實作組分離。標準MS1-v1、corpus及HTTP harness hash全程未變。小型A由審核組直接呼叫真Next；容量B由實作runner執行凍結的獨立client，審核組逐項核對原始trace、監測與產物，並另外唯讀核實rowcount／Space分布／原文樣本。不是公司consumer、GM或DevOps的正式接受。

## 裁定

**本輪已實際建立並核實SQLite百萬頁產物，但沒有任何候選通過完整的百萬頁MS1工作集。** 兩個不同邊界必須分開：SQLite百萬頁深分頁超時；Pagefind在十萬頁建置時超出預設6GiB程序樹RSS預算，尚未取得該量級可查詢bundle。不能據此說Pagefind reader最大只能1萬，或SQLite已正式滿足百萬頁DR。

| 候選／N | 建置觀察 | API工作集 | 主要裁定 |
|---|---|---|---|
| SQLite／60 | 完成 | A 18/18、32 HTTP | 多Space語意限定通過 |
| Pagefind／60 | 完成 | A 18/18、32 HTTP | 多Space語意限定通過 |
| SQLite／10k | 1.006s；sampled tree RSS77.66MiB | 20任務／102 HTTP；80混合0fail，P95 11.73ms | 此短工作集通過 |
| Pagefind／10k | 12.348s；sampled tree RSS957.99MiB | 20任務／102 HTTP；80混合0fail，P95 120.73ms | 此短工作集通過 |
| SQLite／100k | 9.794s；sampled tree RSS111.08MiB | 20任務／102 HTTP；80混合0fail，P95 46.72ms | 此短工作集通過 |
| Pagefind／100k | 102.855s時tree RSS6,505,082,880bytes超6GiB護欄 | 未產生有效bundle，未跑reader | 建置預算不符合；停止更大N，非reader失敗 |
| SQLite／1M | 105.229s；sampled tree RSS132.84MiB；產物2,133,084,634bytes | B01–B13通過；B14全站commonterm第100,000頁於5,008.91ms timeout | 完整工作集不符合；後續與混合組未執行 |

混合為4個closed-loop client各20操作，SQLite10k窗口0.154s、Pagefind10k0.933s、SQLite100k0.446s。數據太短且語料合成，不能當穩態QPS／SLA、30分鐘RP0或公司併發驗收。工作集包括小Space常見詞、大Space稀有詞、全站中文及正文／附件，不代表任意廣泛查詢併發。全部錯誤／timeout均保留，沒有只報成功樣本P95。

## 百萬頁不是由manifest宣告

獨立audit確認SQLite的pages及FTS各有 **1,000,000** 筆；實際Space histogram符合s0000持有500,000頁、其餘999個Space分攤後半；9個邊界／標記頁的原title/content/附件符合固定generator。來源合成JSONL約1.232GB、正文約1.100GB，平均正文約1.1KB且1%約8KB長尾。不是公司真實文字／大小／語言分布或相關性判定。

PF10k獨立確認pages/mapping各10,000、entry zh page_count10,000；PF100k雖有100,000正文rows，但mapping0、沒有成功manifest/bundle，只是保留的partial build。不得用其rowcount宣稱Pagefind十萬查詢成功。

產物大小含成本口徑差異：PF10k logical26,069,408bytes，本機allocated61,480,960bytes、10,175檔；SQLite1M logical2,133,084,634bytes、2檔。本機檔案配置不等於MinIO計費或物件內部開銷，不能直接外推。

## SQLite 1M：已證明的範圍及不能跳過的反例

13項成功請求皆經真Next HTTP、保留exact total及每個hit的正文／授權檢查。例：

- small/commonterm：可見1個Space、501頁，觀察約43ms。
- many/commonterm：100個Space、50,100頁，約198ms。
- huge/commonterm：1個大Space、500,000頁，約786ms。
- all/commonterm首頁：1,000個Space、1,000,000頁，約1,157ms。
- 稀有詞、二字中文、技術碼及無結果按公式吻合。

以上都是各情境單樣本，不是P95。之後all/commonterm page=100000/pageSize=10超5秒中止，並未改timeout、降低total或取消深分頁oracle來求過。server同步SQLite工作在client abort後仍阻塞，TERM grace後須KILL，runtime exit=-9；這是共享Next event loop及取消／排障成本，不應只看低RSS。

靜態EXPLAIN（沒有重跑失敗查詢）顯示 `USE TEMP B-TREE FOR ORDER BY`，bytecode會將p.content納入排序record。下一個有界實驗可先測「只對ID/score排序及分頁，再取正文」，或討論consumer是否需要極深offset；這是待驗證改善，不是本輪已修好。不得直接把深分頁改成加分項。Exact total與排序語意仍要保留或由對口接受新級別。

SQLite1M reader sampled RSS約100.59MiB不代表100MiB pod足夠：全cgroup memory.current在該窗口峰值約7.09GB，可能含OS cache、暫存與其他工作，不能全歸本reader；相反也不能忽略。PRAGMA temp_store=FILE的artifact外暫存峰值未完整分攤量測，free-disk guard保有全盤4GiB底線，但產物logical bytes不是全部執行磁碟成本。

## Pagefind：建置與DR服務分開決策

100k ingest已到100,000，之後write階段RSS擴張觸發護欄；peak由native程序約6.384GB及Node約121MB組成，最大RSS採樣間隔0.258s。6GiB為採樣軟停止，發生少量overshoot並非違規擅加資源。reaped kernel MaxRSS僅反映Node、不含被group-kill原生子程序，不能以它覆蓋live tree峰值；CPU亦保留live-tree與reaped的口徑差異。

Root builder已不存在；原生子程序為Z/PPID1/RSS0，已不執行、等待宿主reap。Partial資料未刪。依標準不重配RAM重跑，也不啟動Pagefind1M。

這個結果是「此語料／設定／版本在6GiB建置預算內未完成100k」，不是「Pagefind查詢無法達到100k或1M」。若建置可在原站／備份管線以較大臨時資源執行，成本與DR常駐資源分屬不同對口；是否值得，需要另一張有界實驗卡及預算，不能本輪偷加RAM。獨立搜尋服務是否必要仍未定。

## 新實作責任與持續限制

- 原文與映射改存可丟棄本地SQLite、按頁回讀，減少全JSON常駐；本輪仍未接MinIO下載／切版／重建與正式備份。
- SQLite COUNT/LIMIT在SQL內，授權Space predicate在全文查詢；all-space shortcut僅適用固定1000-Space合成universe。正式動態Space集合須維持同一前提或另驗。
- Pagefind映射直接解析1.6.0 gzip fragment／pagefind_dcd內部格式，新增版本耦合。Runtime每命中仍查SQLite map、檢查scope／去重；不是全部工作都O(pageSize)。
- journal/synchronous OFF只適用可丟棄離線build；path+size inventory不是byte hash封存或發布原子性。fresh-process也不是OS冷cache。
- 身份由mock header映射Space集合；已驗聯集、交集、空集合、unknown及交錯使用者，但正式授權服務、同身份即時撤權／集合更新、撤權時效與生產身份驗證仍未知。
- 無正式highlight、consumer接受、真實MinIO、長時間負載、完整DR故障域／RTO/RPO或同語料ES總成本比較。不能從本輪宣稱任一方案全產品過關或總維運成本已更低。

## 下一個決定

不自動擴大本輪或增加資源。優先可選：

1. SQLite針對已定位的正文參與深分頁排序及同步取消成本做一次有界修正，重播同標準；成功後才補1M混合負載。
2. Pagefind先確認建置工作在哪裡、能有多少臨時RAM與時間，才決定是否值得申請另一個配置實驗；reader成本需取得bundle後另測。
3. 與核心consumer確認極深分頁、exact total及highlight的必要程度，對口接受前不修改共同承諾；正式需求可與上述研究平行。

本輪失敗具體縮小了未知：一個是可重現的query實作／取消邊界，一個是build資源邊界。兩者都有後續決策價值，不是透過改門檻消掉的失敗。

## 可追溯證據

- `evidence/ms1-2026-11-14/reviewer/`：凍結hash、兩候選N60 A原始結果、artifact-audit.json、sqlite-deep-plan.json。
- `evidence/ms1-2026-11-14/implementation/`：各stage build/runtime監測、capacity逐請求trace、stage停止、source/provenance及cleanup。
- `scripts/ms1-review/`：固定generator、獨立HTTP harness、唯讀產物audit。
