# 第一版候選的能力與成本：三回合本機驗證

2026-11-15。**三回合已完成，依授權停止新增實驗。** 這輪支持把「完整下載可重建 SQLite 副本，再本地查詢」當作 SQLite 第一版的具體候選；還沒有證明全部基本需求完成、正式可採用，或總維運成本低於 ES。結果來自合成資料及本機 Node HTTP harness，不是正式 Next／consumer／ReBAC／使用者驗收。

## 先看可以拿去討論什麼

這份百萬頁 artifact 約 **2.13GB**，含索引、title與合成正文。本機完整下載後，可完成這份固定工作集的搜尋、閱讀與小附件下載。下載限速20MiB/s時，從空副本到第一條完整鏈約 **107.52秒**；已有副本提供查詢時，可同時下載另一完整副本，受測查詢仍正確。代價不是零：每 reader 約2.13GB，替換時保留兩份約4.27GB，還有下載流量、校驗、發布、切換與清理責任。

**沒有再繼續調 R 或引入 H。** R 的快取反例仍保留；L 的有限結果已足以把下一個問題轉成「這些能力與成本對第一版是否足夠，以及還缺哪些基本流程」。若後續確認不能提供這些磁碟／傳輸資源，再重開其他讀取路線。

## 每回合結果如何決定下一步

| 回合與問題 | 實際結果 | 因此採取的下一步 |
|---|---|---|
| 1 無節流：百萬 L 能否完成基本合成鏈及查詢？ | 39 HTTP符合預期；空副本→第一鏈4.19秒；37次搜尋最慢761.31ms | 功能未遇阻礙；改量網路傳輸成本，不調SQL |
| 2 只限速20MiB/s：完整下載要等多久？ | 39 HTTP符合預期；第一鏈107.52秒，其中GET＋hash 107.47秒；搜尋最慢774.23ms | 下載主導等待；量既有服務與另一副本下載共存的成本 |
| 3 舊百萬 reader 服務時下載第二份，再換新 reader | 105 HTTP符合預期；60次查詢完整位於實際DB GET窗口；重疊搜尋最慢780.10ms；新副本與舊副本hash一致、新PID完成操作鏈 | 本輪停止；優先補第一版的功能與整合證據，而非再微調本機性能 |

三回合共183個HTTP記錄，這是預定工作數，不是183種功能或正式成功率。各輪都只跑一次，沒有失敗後改參數重跑。每次12查詢×3循序重複是事前安排；第3輪另加12×5重疊查詢。所有輪次的37/37/101搜尋觀察均無超過2秒；樣本短、負載輕，**不代表2秒P95 SLO或持續吞吐量已成立**。分布的機器可讀摘要保留 sample P95，但不作採用門檻證明。

## 第三回合的共存與替換證據

背景副本GET＋hash耗時 **107.16秒**。60次查詢採每次完成後等待1秒、最多一個在途查詢，不是固定到達負載或多人壓測。啟動查詢前先觀察到真正的DB GET；事後以proxy開始／結束時間及HTTP時間逐筆核對，60/60完全重疊，不能用「有啟動背景promise」取代這項證據。

同一輪、相同查詢的描述性對照如下。前段3個、重疊段5個觀察取中位數；比值同時受系統狀態與排程影響，未做隨機化統計因果推論。

| 查詢 | 背景下載前中位數 | 下載中中位數 | 後／前 |
|---|---:|---:|---:|
| exact | 2.60ms | 6.59ms | 2.53× |
| rare-small | 4.96ms | 8.25ms | 1.66× |
| rare-huge | 6.07ms | 7.94ms | 1.31× |
| rare-all | 6.18ms | 8.24ms | 1.33× |
| common-small | 638.02ms | 621.18ms | 0.97× |
| common-huge | 502.12ms | 499.00ms | 0.99× |
| common-all | 766.04ms | 776.19ms | 1.01× |
| page2-all | 766.60ms | 768.14ms | 1.00× |
| page2-small | 600.97ms | 625.15ms | 1.04× |
| absent | 1.44ms | 4.30ms | 2.99× |
| code-small | 137.99ms | 141.56ms | 1.03× |
| chinese-all | 90.64ms | 98.69ms | 1.09× |

不能稱背景下載「沒有影響」：exact與absent的中位數約增至2.5–3倍，但絕對時間仍約4–7ms；較重查詢也有小幅變動。這些是受控樣本觀察，沒有估計統計顯著性或真實高併發下的變化。

新副本完整校驗後才停止舊worker，再啟動使用新路徑的新PID；停止舊worker→第一條新鏈 **44.21ms**。這段沒有並行使用者請求，所以不宣稱零中斷、透明切換或已處理in-flight請求。新舊資料是同一release，沒有測新版內容、15分鐘舊連結、跨版本路由或切換失敗回滾。

## 成本要分清楚歸屬

| 項目 | 本輪觀察 | 誰承擔／仍須補什麼 |
|---|---|---|
| 每個 reader 本地DB | 2,133,065,728 bytes（約2.13GB） | Infra提供可重建磁碟；provider管理下載、驗證與ready |
| 保留舊副本＋新副本 | DB約4.27GB，不含附件與staging額外設計 | provider定義保留/回收，Infra預留重疊空間 |
| 每次完整副本流量 | 約2.13GB；20MiB/s下GET＋hash約107秒 | publisher/object store/廠區網路與reader共享；實際公司網路未知 |
| 受測reader取樣RSS峰 | 第1/2輪116.79/115.43MiB；第3輪舊87.14MiB、新83.14MiB | 只含被觀測程序，不是最低Pod記憶體 |
| Lab合計程序RSS峰 | 三輪673.24/675.47/652.53MiB | 含同機MinIO／runner／reader，不能全部歸到reader，也不能省略OS cache |
| Lab runtime＋evidence峰 | 第1/2輪約4.27/4.27GB；第3輪約6.40GB | 包含同機object store＋副本；不含另存來源、歷史實驗、備份，不是公司單Pod大小 |
| 操作與工程 | 完整artifact產製、發布完整性、child/timeout、版本／ready／告警／GC、consumer adapter | 由provider與Infra分工，沒有實測工時或TCO，不能以少ES服務直接聲稱較便宜 |

準備與測試同機WSL：28 logical CPU、約19.53GiB RAM，未設cgroup硬限制。原件檢查、上傳與前後hash會暖OS page cache；首次只指空應用副本與新程序。RSS排除OS page cache。三輪runner時間合計約404.31秒，另有來源檢查、開發、自查及證據整理；token／金額未知。本輪沒有新增subagent，也沒有更改永久協作規則。

合成正文約99%為1KiB、1%為8KiB詞彙，最大Space占50萬頁，其餘分散在999個Space。這不是公司Lexical JSON／附件分布，不能把2.13GB當成真實百萬頁容量上限。回傳total封頂為1000／gte，本輪只查前兩頁，不證明深分頁或完整遍歷。

第一鏈計時從副本完整GET開始，包含落盤、hash、新worker與搜尋→正文→附件；**不含上游抽取、source一致性、artifact建置、發布、DNS切流、登入或權限服務恢復**。20MiB/s只是應用層response節流，不是RTT／丟包／跨國網路模型。約107秒雖低於研究參考120秒，但只有約12秒餘裕，不能保證公司恢復目標；若需要較快恢復，可提出平時預熱，交換常態磁碟/同步/健康檢查成本，而非先承諾H能解決。

## 第一版候選與驗收缺口

可具體提案的方向是：主站產製一致的唯讀版本→DR MinIO保存→Next側完整下載、校驗並啟用本地SQLite→Next API提供搜尋、正文與受保護附件下載；Space權限仍由可信授權層提供，media以page metadata membership與Space判斷。這是候選設計；本輪用了受控task對應Space，沒有正式身份／GM／ReBAC整合。

| 基本任務或承諾 | 目前可說到哪裡 | 下一個驗證／討論 |
|---|---|---|
| Keyword＋Space搜尋、title、有限分頁 | 固定合成中文/英文/技術碼/無結果、small/huge/allSpace與page2已測；保留count/排名前Space predicate | 真實任務、正式ES analyzer/query與consumer欄位仍未知 |
| **多Tags全部符合** | **這套百萬harness及corpus沒有Tags；本輪完全未驗**。這是既有基本需求，不能當成可選項而消失 | 把AND Tags加入共同契約／合成oracle與完整流程，再談效能 |
| 閱讀與下載 | 合成正文比對、page→media membership及一個68-byte附件hash成立 | 真Lexical／大附件／未知權限／page移動／撤權／錯誤體驗待補；不能套用完整離線保證 |
| 初次啟用與reader替換 | 完整GET/hash、fresh PID、同版雙副本及有限查詢共存成立 | 真部署ready／多reader／流量／中斷回滾／GC與操作人接手待補 |
| 更新時操作鏈 | 本輪只有同release替換；歷史跨reader409缺口未解 | 帶透明續行與可辨識重搜/重試兩種方案，列consumer改動及實作代價 |
| 網站與consumer可實際操作 | 本輪Node HTTP harness，不是Next正式API/UI | 一條可操作的第一版任務路徑，顯示唯讀、版本/時效、限制與錯誤，再請對口試用 |

**下一步優先整合第一版的完整核心任務，尤其補回AND Tags，並以合成consumer走完搜尋→正文→下載。** 這輪已取得足以討論L儲存成本的證據，不因還能跑更多壓測就繼續延長。ES保留為較接近既有搜尋契約的備選與成本參照；H只有在完整下載等待不能接受時再驗；R暫停，不判永久不可行。

Spec可協商，但不默默放寬：等待時間、預熱成本、更新時連結行為、額外依賴故障範圍可帶選項討論；未授權內容不能交付，錯誤不能假裝無結果，必要正文不可靜默截斷。尚無需使用者立即決策的阻塞；正式Infra預算、consumer契約與權限政策需要對口接受。

## 證據與審查界線

來源沿用保全雲端DB＋WAL＋SHM，只在新副本checkpoint並轉成獨立檔；檔案SHA不同不冒充原DB。保全三檔前後hash一致。source檢查一百萬page、1,000 Space histogram、全rowid mapping、FTS常見詞總數、quick_check、14正文樣本。原builder為Node22/SQLite3.50.4，讀取為Node26.13.1/SQLite3.54.1；未重建索引，也未與雲端舊延遲作硬體無關排名。

每輪11項凍結輸入執行前後相符；完整MinIO raw DB與附件前後hash相同，所有proxy成對完整，child與19440–19443已收尾。原始結果、失敗歷史、三輪新副本都保留，沒有公開推送或刪除原檔。這是主agent原始紀錄自查，**不是獨立review或owner接受**。

- [第1輪卡](../.lab/l-adaptive-20261115/round-1-evidence/CARD.md)、[摘要](../.lab/l-adaptive-20261115/round-1-evidence/SUMMARY.json)、[原始結果](../.lab/l-adaptive-20261115/round-1-evidence/result.json)
- [第2輪卡](../.lab/l-adaptive-20261115/round-2-evidence/CARD.md)、[摘要](../.lab/l-adaptive-20261115/round-2-evidence/SUMMARY.json)、[原始結果](../.lab/l-adaptive-20261115/round-2-evidence/result.json)
- [第3輪卡](../.lab/l-adaptive-20261115/round-3-evidence/CARD.md)、[摘要](../.lab/l-adaptive-20261115/round-3-evidence/SUMMARY.json)、[原始結果](../.lab/l-adaptive-20261115/round-3-evidence/result.json)
- [來源保全與資格](../.lab/l-adaptive-20261115/source-evidence/result.json)、[邏輯檢查](../.lab/l-adaptive-20261115/source-evidence/logical-audit.json)、[實測環境](../.lab/l-adaptive-20261115/environment.json)

原生研究工作目錄仍是 `/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo`；Windows舊checkout不是最新執行程式。舊E1三候選矩陣保持未執行，本輪是另立L-only新卡。
