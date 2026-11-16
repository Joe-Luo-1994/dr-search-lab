# K2 百萬頁：consumer 對 Web 的干擾（設計卡，待 reviewer gate）

使用者2026-11-16授權：往百萬頁驗證，先review設計，聚焦consumer搜尋對Web、下載與更新競爭。MinIO維持合理餘裕且記成本；若原配置撐不住，由結果選最多一個最值得驗證的備案。主要V4/V8，非A/B成本比較。K1凍結與原始證據不改。

## 配置及來源

K2新目錄`c-million-20261116`，Linux WSL2 Node22.18/Next16.4.5。原候選reader 2CPU/1GiB/swap0、2個共享workers、queue16、query4秒硬期限、worker SQLite cache8MiB；更新的新舊worker、下載hash、SSR均進同cgroup。MinIO改4CPU/4GiB/swap0且Go heap軟靶1GiB，獨立19640/19641，reader3174；配額不是獨占CPU/磁碟/網路。builder/publisher/generator分開記資源。MinIO僅是測試依賴，不能因加配額就稱它絕無瓶頸；以CPU/throttle/memory事件、取件耗時與傳輸觀察判讀。

唯一正式資料1000000/1000001兩版，K1相同source規則與schema、100Spaces半數在space0、9個queryshape、exacttotal/Top10/精確prefix snippet；256頁remote熱正文及8附件64KiB/2MiB/8MiB。未發布長尾正文明確503，不作百萬全文交付驗收；PDF詞是正文與附件共有marker，非PDF-only新builder品質證據。改用source純函式按returned ID重建預期/eligibility，builder只存querytotal與熱集oracle，避免工具全百萬metadata巨大JSON；預期不得從SQL生成。小1000資料只preflight。正式實際artifact大小/hash決定資源與傳輸量，不用十倍估值當證據。

publish PUT及GET校驗、安裝皆stream，保留完整hash；不是去掉驗證。單次更新下載100秒＋完整pool-start/quick_check30秒，外層150秒共用deadline；phase180秒，第5秒啟動，最遲155秒完成且至少20秒V2服務觀察。下載控制最高64MiB/s，明示應用節流非WAN。初始安裝另量、不叫RTO。新舊DB兩份加staging投影磁碟40GiB護欄、free至少20GiB，5秒檢查，觸界終止。

## Web 是真 SSR 與完整合成任務

新增Next Pages SSR `/docs/{pageId}`，每次getServerSideProps走同身份／page metadata／MinIO正文與版本pin，再render escaped title/body/search表單／頁面連結；Cache-Control no-store。與consumer同pool/預算，不能走資料預載旁路。保留256頁熱集/1–8KiB合成正文，非公司editor/正式SSR成本代表。

每秒1個open-loop Web journey：SSR HTML→搜尋→已發布頁正文；journey內步驟序列，journey彼此重疊。記每步與整鏈排程/送出/完成、metadata/body/title/snapshot、source hash、失敗與409。每步5秒/整鏈15秒；固定Web rate不隨consumer變少。另在正式前執行一次真browser可點任務smoke（不計容量），正式HTTP SSR不是browser渲染/互動SLO。

## 固定到達與相互干擾

1. Web-only baseline30秒，1journey/s（每journey約3HTTP）。
2. 保持Web1/s，consumer獨立open-loop [1,2,4,8,16] search/s，每階30秒；9查詢等輪替，分query記錄。
3. 取兩邊都合格最高consumer率，再額外bulk下載2/s、30秒（8附件輪替，與Web共用4個內容slot）。若低階已失敗，依stop規則不假做後續通過。
4. 若下載混合仍合格，同負載加真V2更新180秒。舊鏈409保留為needs-research、不列成功；正常階不能把409當成功遮掩。更新期另列真正任務成功率與重搜需求。

Web研究門檻：整鏈含排程P95≤3秒且≤max(2×Web-only baseline P95,500ms)，失敗≤1%。Consumer自身P95≤2秒、失敗≤1%。這些是事前研究假設而非公司SLO；低樣本與短窗須明示。各lane offered/sent/completed/missed/timeout/rejected分列，不以consumer多數快速回應稀釋Web。generator落後>250ms或漏送使該階無效。warmup只必要契約/指定小量，不調試到快取命中才開始；暖/冷狀態明示。

每500ms reader cgroup，MinIO每2秒；每秒status保Next event-loop delay及pool queue/run統計、PID與版本事件。queue wait、worker執行、Next主程序延遲、SSR及下載分開看，避免直接將所有慢歸於SQLite。沒有block I/O時明示缺值，不能拿logical bytes代替。

## 停止及備案規則

資料錯／越權／混版立即品質停止；OOM／worker非預期退出／磁碟guard停止整輪。單SQL4秒硬逾時會真kill，記capacity stop而非錯資料；不能只reject parent而SQL繼續。Web或consumer門檻不合停止升階；若已知產品無法服務不持續壓其他階。全程sharedabort、每階最大16秒drain、總負載900秒watchdog，controller finally停自有units。保留raw/version/資源與所有未跑phase。

正式只K2原配置一次。若失敗，先由reviewer依原因選一個單變因備案：例如全局CPU飽和/單查詢受限時增加reader資源；consumer搶pool時隔離admission；更新cache／worker重疊時調整更新方式或記憶體。備案先新卡寫明變更/額外成本，保留原配置失敗；不默改exacttotal、查詢、資料或Web rate。不預定一定用掉額度，也不為達通過反覆補跑。儀器錯最多一次reviewed修補，與容量/正確性失敗分開。

## 成本與交付

分開記新source oracle、stream publisher、SSR整合、pool/eventloop量測、獨立lane runner、版本長期限與磁碟擴大責任；實際builder/publisher資源、每reader容量與更新bytes、MinIO4CPU4GiB額外研究預算、操作修補及未知公司人時/token金額。正式報告按Web是否被拖慢→原因→值得備案與成本展開，不用整體QPS掩蓋任務失敗。

## Reviewer 設計修訂（freeze 前）

Web query profile改為rare／published-marker輪替，必須跟隨該次search返回的第一個已發布hit與snapshotId閱讀；不另讀固定頁湊成功鏈。consumer仍9形輪替。因此Web代表已知文件的搜尋閱讀，不能宣稱Web所有廣泛查詢形都量過。SSR每次要明示合成identity header，missing／unknown均拒絕，browser smoke也以明示mock header操作。更新409為未完成旅程，納fulfilled/offered的失敗分母，不視為資料品質錯。

Bulk獨立門檻：完整bytes/hash驗證、5秒deadline、含排程P95≤2秒、失敗≤1%；不合則不進update。generator各lane最多64在途，Web整鏈15秒，phase最多16秒drain；資源限制與每lane護欄不混為服務容量。

Pool 4秒從admission計，包含排隊與worker執行；超時會kill執行中的child，fatal保queueMs/runMs/op/lane。不能把所有timeout都稱為「單SQL跑了4秒」。metadata與SSR走同pool，這正是本輪需要量的競爭。
