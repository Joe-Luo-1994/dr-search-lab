# O1 啟動批准版本：獨立結案審查

2026-11-16。**本輪啟動接縫有限結案，沒有追加執行或修補的必要。** 六案例支持：程序重啟可以從固定遠端批准指標選取V2，舊cache不會把它拉回V1；空cache也不需要旁放本機release catalog。這不等於已完成正式Pod維運或證明長期工時下降。

審查只讀原始證據、核對凍結程式並離線重算hash／事件順序；未啟服務、HTTP或SQL。原始結果與凍結文件未修改。

## 核對結果

| 案例 | 原始證據與裁定 |
|---|---|
| 首次批准V1 | reader PID 1420，從遠端下載V1、Pool檢查後ready；建立local active |
| 同cache由V1升V2重啟 | 新PID 1503，讀approved V2並下載V2；保留原V1檔案，active改V2 |
| 空cache啟V2 | 新PID 1575、起始無cache，僅依固定approved／manifest取得V2 |
| V2 cache再次重啟 | 新PID 1647；完整重核3,268,608 bytes DB hash。startup client紀錄只有approved及manifest，DB GET為0 |
| 壞manifest pin，有cache | 503 `MANIFEST_PIN_MISMATCH`，無ready事件，active與cache全檔保持不變 |
| 同壞pin，空cache | 相同503、無ready、未建立active或release；不是回退舊版後仍算成功 |

四次正向各8個worker的cmdline／cgroup對應本輪隔離runtime。已獨立核對四個reader與32個worker PID目前均不存在；每case停止receipt為MainPID=0，最終三port無listener。Next SIGTERM後記錄143與unit failed狀態保留，與controller結束時主動停止一致，不能抹為正常exit 0。MinIO為exit 0。

已從 `http.ndjson` 重算45筆：33×200、7×404、3×409、2×503。404為受限身份不可讀或明確 `STARTUP_ONLY`；409為V1舊URL；兩503為上述反例，均符合卡。四次正文與四次附件回應的hash已另外對原fixture oracle核對。搜尋的total、snapshot等正向body未完整落盤，因此其驗收依凍結controller的當場斷言與完成證據；本審查沒有宣稱離線重新計算全部搜尋回應欄位。SSR是HTTP內容斷言，沒有新增browser／真人證據。

## 發布、選版與保全

六份public config及native私有config的欄位已核：沒有 `releases`、`artifactDir` 或本機publication receipt替代discovery；版本參數只用於driver判定預期，不傳給bootstrap選版。來源為固定endpoint／bucket／`control/approved.json`，一次啟動讀取並pin一份批准內容。

已逐key檢查publisher client序列：533個immutable key（含兩版DB、正文／附件與manifest）在首次批准前都有既存GET→PUT→GET；V1批准前另GET manifest。凍結publisher只有bytes/hash讀回一致後才完成receipt，再最後PUT／GET approved。這是client紀錄加已完成斷言的證據，不是MinIO server audit。最後 `publish-restore-v2.json` 的批准內容與原有效V2完全相同，壞pin receipt仍保留。

approved JSON重編碼SHA、manifest pin、boot-prepared、local active與ready的版本／hash一致；cache內DB與manifest實檔hash另行重算相符。負向cache保全亦已對實檔重算。Pool先驗snapshot與quick_check再commit active的順序由凍結程式及成功事件支持，未做任意中斷或斷電durability實驗。

**629個freeze輸入已由reviewer獨立重算，零差異**，包含原K5的80檔。實際reader配額8CPU／12GiB、MinIO4CPU／4GiB、swap0的readback在各case與MinIO limits檔；本輪低頻小fixture不重新證明這些配額的容量。

## 維運價值與仍需負擔的工作

可刪去的研究操作是「每次重啟人工指定本機release descriptor／版本」：批准V2後，同cache與空cache均能自行恢復V2。代價是新增並維護bootstrap批准鏈、不可變版本publisher、identity與active兩類本機紀錄、cache全檔驗證，以及批准錯誤的診斷／處置。pool／worker／下載器主要沿用；bootstrap與publisher及controller是新程式，並非零改造成本。controller含研究故障注入、證據與清理工作，不能全算正式每次操作工時，也不能全數忽略為免費。沒有量得非作者人工工時、月觸發頻率或on-call成本。

整輪controller觀測5.60秒，包含本輪發布與六個順序案例，不含freeze全檔hash時間；V1/V2 DB分別3,256,320／3,268,608 bytes，只有1000／1001頁。這個數字不是百萬頁啟動時間、RTO、SLO或正式Pod重建時間，cache reuse也不能只憑本輪時間差稱效能優勝。

研究共用root credentials、單publisher／單cache writer與本機真MinIO不代表正式IAM分權、簽章、跨區發布或Kubernetes故障。批准指標不可用／錯誤即拒絕啟動，即使已有好cache仍不服務；這是明確的可用性取捨，正式stale-serving政策尚待決定。startup-only的hot-update入口明確404，不能與原K5熱更新拼成已整合的完整發布系統。

停止本輪。V3與連續發布、hot-update／startup共用批准流程、GC與殘留staging、rollback、斷電／killfault、共享PVC競爭、告警與worker fatal復原均未驗。下一個維運決策應先選要保留的批准／stale-serving政策與整合責任，再挑一個具體操作驗證；本結果不自行授權擴展成整套維運矩陣。

證據入口：[總結果](../evidence/c-restart-20261116/result.json)、[原始HTTP](../evidence/c-restart-20261116/http.ndjson)、[publisher事件](../evidence/c-restart-20261116/publisher-events.ndjson)、[復原有效批准](../evidence/c-restart-20261116/publish-restore-v2.json)、[freeze事後核對](../evidence/c-restart-20261116/freeze-after.json)、[cleanup](../evidence/c-restart-20261116/cleanup.json)。
