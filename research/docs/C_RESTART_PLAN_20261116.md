# O1：重啟時恢復已核准版本

目標是降低「新Pod起來後要人手指定／修正版本」的工作。本輪只驗啟動接縫，重用1,000頁fixture，不做容量或效能優勝比較、不改K5凍結程式／索引。

## 契約

- 遠端固定`control/approved.json`代表核准啟動目標；含releaseId與manifest key/bytes/SHA。單次啟動讀一次並pin，manifest再pin SQLite及正文／附件；本地active.json代表已驗可用版本。manifest及DB metadata身分須一致。
- 發布順序：所有不可變版本物件PUT/GET核hash；manifest也GET核hash；最後才寫／讀回approved。單writer假設；同release內容不同須拒絕，不以字典排序找最新。
- 固定受信任loopback endpoint、獨立private bucket。原型publisher／reader使用同一組測試憑證，正式IAM分權、跨區發布及簽章未驗；fresh reader設定不帶本機publication receipt或版本descriptor catalog。
- 啟動時approved不可用／損壞：不ready、明確失敗、不偷偷fallback到cache；保留原active。這是研究工作假設，正式stale-serving政策待決策。
- 使用K5 R2凍結Next build與8worker pool的新隔離副本，僅新增bootstrap＋更換init及關閉舊hot-update路由。本輪沒有宣稱與原update API／自動輪詢整合。
- 私有單Pod cache、順序啟動，沒有共用PVC併發writer。下載沿既有stream hash／fsync方法，unique staging，完整校驗後才commit active；reuse前仍hash本地DB。
- 新storage副本只加method/key呼叫紀錄（不記憑證），以分辨啟動讀approved／manifest與是否GET DB；這是client instrument，不是MinIO server audit。本輪不將有此紀錄的延遲拿來對比K5容量。

## 案例

0. 原K2小fixture完整發布V1/V2，但approved先V1；首次啟動V1建立原cache。只作本輪前置，不重跑已知原hardcoded V1反例。
1. 停原程序，approved推到V2；同cache重啟，新PID應ready V2，V1檔與證據保留。
2. 真空cache、新程序只依remote approved恢復V2；搜尋、正文、SSR、附件與Space／Tags變更必須正確。
3. 再重啟同V2 cache，驗新helper的reuse分支及本地完整hash；不以有receipt就免驗。只記實際分支，不把耗時差當效能證據。
4. approved的manifest SHA故意損壞；有V2 cache的新程序必須503、不ready、不fallback，active bytes不變。
5. 同壞指標、空cache的新程序同樣不得ready或創造active。此為同一反例的低成本分支，不展開故障矩陣。

每次正向就緒都核新PID、8worker在reader cgroup、snapshot、已改page的正文／tags、受限身份及media hash。測量是新程序與本機目錄，非真正Kubernetes節點／網路故障。

只有四個低頻判別搜尋（p3、V2正文新詞、p2雙tags、p1受限身份），不跑九query負載。負向結束後將隔離bucket的approved恢復有效V2並讀回，原壞指標receipt與拒絕證據保留。

## 護欄與保全

新`.lab/c-restart-20261116`、新MinIO資料目錄與bucket；ports3180/19700/19701；只停自身units。Reader上限沿8CPU12GiB、MinIO4CPU4GiB/swap0，但小fixture低頻功能驗證不重證K5容量。啟動前核host餘裕；controller每5秒監測available低1.5GiB／free低20GiB／新目錄超2GiB即停；單readiness60秒、整輪controller最多600秒、finally清理。不得把預期負向503算成正向服務成功。

正式前核K5八十檔未變，凍結新sources／小fixture manifest DB與物件hash、Node／MinIO與Next server build；正式後核對、保存失敗與cleanup。沒有新fixture建置、沒有公開上傳或push。

## 維運成本要留下什麼

具體記錄新增bootstrap、approved發布者、immutable檢查與identity／active兩類本地記錄；哪些沿用helper、哪些只是沿用設計。成功僅表示這個啟動流程可自動完成，仍未證連續V3、GC、rollback、排程／告警、worker fatal復原及非作者工時。批准指標壞時拒絕服務的可用性代價必須呈現。
