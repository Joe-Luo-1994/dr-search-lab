# R 逾時診斷與合作方式試行 — 2026-11-15

這輪把「R 的 common-small 為何逾時」從只有整組請求數，縮小到可觀測的計數與排名階段：完整遠端搜尋在計數約3.49秒後開始排名，於整體4.8秒期限被中止，尚未進入 target 的正文讀取或highlight。這是一次10k合成資料、直接worker IPC的診斷；不是原HTTP smoke的等價重播，也不是完整根因或正式效能結論。

**本輪診斷完成；R完整搜尋仍不符合本卡期限。百萬頁未執行，未調高deadline。** 六組皆先通過相同七步prefix；診斷過程沒有來源／物件變更或資源護欄失敗，本輪程序與連接埠已釋放。

## 實際證據與意義

| 預定cell | target工作耗時 | 觀察與界線 |
|---|---:|---|
| L完整 | 11.12ms | 計數8.21ms、排名1.15ms，完整輸出符合oracle |
| R完整 | 4800.32ms，deadline | 計數3488.81ms完成；排名有start無end，沒有完整排名時間 |
| L只計數 | 6.28ms | 正確回傳6個可見命中 |
| R只計數 | 3387.95ms | 正確回傳6個可見命中；3313次proxy請求 |
| L只排名 | 6.54ms | 有序rowid/score符合L完整投影與獨立語料檢查 |
| R只排名 | 3335.82ms | 有序結果正確；3316次proxy請求 |

表中是parent量到的單次worker工作時間，含IPC與量測擾動。只排名省略target計數的快取暖身，**不能把兩個隔離時間相加，也不能用它們各自通過來改判完整搜尋**。L完整讀的是已下載的本地副本，11.12ms不包含整份下載或DR恢復。

R完整的target內有4586次proxy請求：以parent在請求開始時觀察的phase分類，3313次在count、1273次在rank；4578次為206，另8次200，共觀察10790352bytes。count與rank有1249組相同物件path＋Range再次被請求。沒有記錄到proxy錯誤或未完成response；這不代表沒有延遲，也不代表worker完成了被中止的rank。

本地EXPLAIN QUERY PLAN顯示兩條SQL都走FTS虛擬索引掃描，再以rowid查pages；rank另外使用暫存B-tree排序。這與大量遠端讀取同時出現，支持優先調查「Space篩選所需讀取、count/rank重讀及快取互動」。**目前未證明SQLite cache、Litestream VFS cache、LTX讀取布局、網路／proxy或CPU各自貢獻，也沒有把Range數換算成SQLite實體頁數。** Remote計畫未另測；phase歸屬受IPC送達時間影響。

## 品質、保全與審查狀態

- 資料固定為既有10000頁／22724608bytes SQLite；來源、SQL、oracle及工具共17項凍結hash執行前後相符。完整新release的raw DB、LTX與附件物件前後一致；原始Windows與接回的5501個原檔也通過保全核對。
- 共48個預定工作，11441對proxy start/end紀錄；六組prefix全通過。原始失敗與其他歷史結果未改寫。只執行一次，沒有重跑到成功。
- 這次執行約14.04秒；500ms取樣合計RSS峰值1082736640bytes（約1.01GiB）、本輪runtime＋evidence峰值193998848bytes（約185MiB）。包含本輪MinIO／reader／runner；不含OS page cache，不是整機資源或容量下限。取樣護欄不是硬配額。
- 非作者Sol agent完成設計與執行前程式審查，抓到rank-only混入後處理、同步log干擾、MinIO意外退出歸類三項問題。實作者修正後，主agent核對修正與hash才執行。
- **獨立的執行後結果審查未完成：reviewer遇平台用量上限。** 主agent已另由原始jobs/phases/proxy、前後物件及來源hash核對；這是主agent自查，不能代稱獨立結案審查或對口接受。不透過重開agent規避限制。
- 正式consumer契約、GM/ReBAC、公司MinIO、真實資料分布、網路及RTO仍未驗證。本輪不增加產品採用承諾。

本輪新增儀器程式與證據整理的維護由研究準備者承擔；沒有修改consumer或產品API，也未為公司Infra新增常駐服務。量到的本機暫存與RSS只是這次診斷成本，不能當作DR方案總維運成本。是否值得長期保留這套診斷工具，仍看後續使用頻率。

## 合作方式試行觀察

兩個Luna/high子任務只做程式路徑與舊證據盤點，使用精簡的新任務脈絡；一個Sol/high實作，另一個Sol/high審查，主agent整合與執行。模型名稱是請求設定，未取得實際計費或backend metadata。

具體收益是：Luna確認舊紀錄缺乏phase歸屬，避免錯把整組請求數歸因單一SQL；非作者審查在量測前找到三個實質問題。主agent也修正了一個假警報：舊oracle hash指向產生器程式，不能拿來與產出JSON hash直接比較。實作者曾遇寫入工具截斷新草稿，先核對舊凍結hash完成逐位元還原後再改，未影響原檔或實驗結果。

成本尚不能宣稱較省：沒有完整token／cache／reasoning用量或金額，也沒有同任務單agent對照。實作者回報初稿約11分鐘、13次shell／語法或hash檢查；其後審查與修正另有成本。執行14秒不等於整個研究只花14秒，最後reviewer用量限制也不能據此歸因為本輪單獨造成。

下輪可直接重用本輪程式統計，避免模型重新逐筆讀log；簡短查核不強制拆成兩個agent。審查繼續聚焦可影響結論的缺口，不對同一份成果無限加輪。這些只是試行觀察，**沒有修改永久AGENTS.md、Skills或全域模型設定**。

## 下一個決策與停止理由

本輪已回答「完整搜尋停在哪裡、重讀是否存在」，因此停止新增量測。下一輪先提出一張小卡：保持SQL／來源／期限不變，只改一項reader快取設定，觀察完整搜尋的rank重讀是否下降及實際RSS代價；先查所選版本設定的語意，再凍結對照，不直接套用優化。

如果重讀下降且完整搜尋改善，只支持快取互動的局部解釋；首段仍需約數千次請求的成本須另外處理。如果無改善，再檢查metadata／Space過濾布局，不同時改cache與SQL。不要先跳到百萬頁或引入新搜尋引擎。獨立結案審查缺口保留，正式採用仍須完整證據與對口接受。

## 證據入口

- [實驗卡](../.lab/e1-r-diagnostic-20261115/evidence/CARD.md)
- [原始結果](../.lab/e1-r-diagnostic-20261115/evidence/result.json)、[可重算摘要](../.lab/e1-r-diagnostic-20261115/summary.json)、[主agent原始紀錄核對](../.lab/e1-r-diagnostic-20261115/POSTRUN_AUDIT.json)
- [設計與程式審查紀錄](../.lab/e1-r-diagnostic-20261115/DESIGN_REVIEW.md)、[配工與成本界線](../.lab/e1-r-diagnostic-20261115/WORKFLOW_TRIAL.md)
- WSL原始執行目錄：`/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo`；本輪script/evidence/runtime分別在 `scripts/e1-r-diagnostic-20261115`、`evidence/e1-r-diagnostic-20261115`、`.lab/e1-r-diagnostic-20261115`。禁止直接重跑此single-run入口；新卡需新保存目錄。
