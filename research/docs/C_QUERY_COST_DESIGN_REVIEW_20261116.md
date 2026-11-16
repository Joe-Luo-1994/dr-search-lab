# K4 查詢成本分項：獨立設計審查

2026-11-16。依使用者「繼續」授權，審查下一個有界診斷設計；本review只讀程式，未執行SQL或啟服務。

**設計有條件通過，可準備；正式診斷仍待新程式／watchdog／凍結與實際限額核對。** K3的workerMs只含整次查詢，不能由現有raw還原count與Top10各花多少時間。靜態程式已足以確認兩段SQL重複使用同一組filters、Top10含BM25排序且另外補tags；它不能證明哪一段最值得改。這次單程序診斷可減少一項具體未知，無須再跑Next、MinIO或Web階梯。

## 最小卡與必要條件

1. **固定輸入，不做產品改造。** 同Node22.18／SQLite3.50.2與K2 V1資料庫，readOnly、query_only、cache_size=-8192、mmap_size=0；不改DB、索引、SQL、total、排序、tags／身份、K2/K3凍結檔。新runner與evidence隔離。讀回Node／SQLite版本、snapshot、pragma與DB來源SHA；前後hash相同。不做新資料建置、ANALYZE、PRAGMA optimize、cache flush或quick_check重跑。

2. **真資源限制與真截止。** 單一活躍SQL程序採2 CPU／4GiB／swap0，讀回cgroup與PID歸屬；原worker reference與分項profile依序執行，不同時開兩個SQL程序。父controller可負責記錄與監督，須明示其資源是否計入。每query的4秒截止涵蓋normalize、count、Top10、tags與結果完成；不是各分項各給4秒。Node同步SQLite會阻塞本程序event loop，因此watchdog必須在SQL程序外，逾時真正終止child並等待退出，記原失敗且停止。reference、EQP、45筆診斷等執行階段共180秒；事前hash時間另列。OOM、錯資料或未知程序錯誤皆停止，不加RAM或放寬期限重跑。

3. **固定54次查詢，而非新的負載矩陣。** 九shape各先以原凍結worker查一次，共9次reference；保存原結果、workerMs與版本。再用原相同SQL及參數做5輪、每輪9shape，共45筆分項量測，事前固定旋轉順序並記round／position。保持原本count→Top10→逐hit補tags順序，不為求獨立數字拆到不同cache或反轉順序。五輪不是完全平衡所有位置，仍保留順序限制；不根據快慢追加樣本或挑最佳一輪。

4. **分項必須對得上原實作。** 原worker每次prepare並execute count、prepare並execute Top10；tagsStmt在程序啟動時prepare，再對每個hit執行。診斷沿用這個生命週期，分列count prepare／execute、Top10 prepare／execute、tags全部execute，另列normalize／構造、整query與未分配時間。SQL文字與bound params需保留，供核對非悄悄改寫。兩段均含FTS、JOIN與filters，不能命名為純「count成本」「排序成本」而宣稱已拆出filter／FTS／BM25各自時間。整query與分項時鐘用同程序monotonic clock；資料驗證及log序列化放量測外並另記，不把oracle運算算成產品SQL成本。

5. **正確性用兩個不同錨點。** 每筆結果核來源predicate的exact total、eligible／唯一Top10、Space／title／tags／Unicode snippet；同時完整有序hits與原worker reference一致。前者防止reference與profile共同錯誤，後者只證此候選沒有改變既有輸出，不能當獨立排名品質認證。保留查詢的identity／Space／tags條件；不得為診斷省略授權filter。合法absent空結果與0次tags執行須保留，不當異常。

6. **EQP是計畫線索，不是計時。** 九shape保存count與Top10的EXPLAIN QUERY PLAN及共同tags查詢計畫，放在45筆計時之外，明示取得時點與參數。EQP不執行正式查詢，不能由plan文字直接宣布某scan耗時占比。每個程序／connection的首次與後續狀態要記錄；若reference關閉後另開profile，前9次只可能暖宿主cache，沒有替新connection暖SQLite page cache。不得以本輪宣稱冷cache／穩態cache已受控。

## 如何判斷有沒有得到足夠線索

成功是54次查詢在界線內完成且兩個正確性錨點一致、45筆分項完整、資源／版本／前後保全可追溯；不是要求某一分項必須顯得慢。每shape報5筆、median、min／max及各分項占整query的比例，避免把5樣本的P95（實際接近最大值）當統計穩定的門檻。對幾乎零成本的rare／absent，不誇大百分比或計時雜訊。旋轉順序、cache、單程序及可能的I/O混合都會影響wall time。

如果count與Top10時間接近、跨輪波動大，或不能排除量測開銷，結論可以是「仍無單一主導項」，不強行選贏家。這不是Web併發、pool排隊、更新、MinIO或正式流量實驗；單個同步SQL程序即使給2 CPU，也不代表會用滿兩核。不可把分項時間直接換算Web QPS，或宣稱K3的閱讀延遲根因已被因果證實。

## 可省項與下一步邊界

不重跑K3、不加consumer／閱讀／下載／更新、不試不同RAM或workers、不重新驗clock／ReBAC／PDF語意。九次reference只做一次；不需每輪再雙跑原worker，不需增加warmup矩陣或長壓測。原worker與profile的有序結果比對，不取代來源oracle。45筆在本次小診斷預算內合理，無需為縮短幾秒先刪掉可能揭露順序變化的輪次。

診斷後至多提出一個下一候選設計：例如維持輸出契約的SQL改寫，或在查詢本身難以縮短時討論閱讀隔離。**不自動實作／再量負載。** Exact total仍是本輪合成契約，正式產品是否需要要另外確認；不能看見count慢就自行取消total。K2更新未完成仍保留在維運決策清單，A／B成本與正式需求未知，不因K4找到一個熱點就宣布C勝出。
