# 遠端內容執行前審查

2026-11-15。**最終preflight通過：可按現有freeze單次執行R1–R3的17組案例。** 靜態finding皆closed，準備產物／發布讀回已獨立離線核對；這不是功能實驗通過或正式部署批准。以下保留審查歷史，最新產物裁定見文末。reviewer未啟服務、build或查詢。

| 必改 | 影響與最小修正 |
| --- | --- |
| 停止訊號未覆蓋所有操作 | run中的minio／health／resource缺共用signal或after ensure；start缺spawn前／ready後ensure，browser launch後亦缺。300秒或Web30秒截止仍可能啟動／等待detach Linux MinIO及繼續UI。正常操作需統一停止檢查／取消；cleanup保留不受已abort訊號的專用stop，核本輪Linux PID確實停止。 |
| 成功鏈斷言少於oracle | chain尚未完整核page canonical欄位、media-list snapshot／capture／pageId、media descriptor及PDF snapshot header；R1-06重新search而非重播已存真V1 URLs。補現有response斷言並使用oldLinks，不新增搜尋矩陣。 |
| 同長反例未鎖定指定object | R1-02僅看IO一筆GET200／199bytes，可把其他同長錯誤誤計為指定反例。核actual key為a-pdf-near獨立descriptor、response SHA為oracle指定near hash；S3 IO保存responseSha256足夠，無需額外HTTP或憑證log。 |

正向靜態觀察：S3回應完整收集且有實際bytes上限，getRemoteObject在交付前檢長度／SHA；publisher對每object PUT後GET讀回，normal manifest／commit最後；installer只接受宣告本地檔案；故障目標限本輪MinIO binary／store的PID。這些不是實測通過，也不代表正式IAM或發布原子性。

第一批時尚待api／serve／schema／UI及R3-03原因核對，現已完成靜態部分（見下）；build前input收據、build outputs、環境／private config保全、published物件閉包及freeze仍待產物複核。環境與產品有缺口時停止，未把準備成功當正式通過。

## 定向複核與準備裁定

上述第一批finding保留歷史，最新狀態如下：

- 成功鏈及同長反例兩項closed：已補canonical／版本／media descriptor／PDF header，R1-06重播真oldLinks，wrong-v2核near精確key／SHA；本地cache事後比對artifact，正文／PDF不落入安裝目錄。
- 取消項主要修正到位：MinIO／health／resource／start與browser皆接共用abort及前後檢查；cleanup不受已abort訊號限制，Linux helper可找回本輪binary＋store的服務PID。**唯一剩餘漏點是R2-06直接匿名s3 GET：須傳abort.signal並在每次前後ensure。** 不增加案例，補完才sourcefreeze。
- reader／schema符合本卡：啟用前嚴核manifest schema、搜尋文字格式、canonical結構與SQLite身份；遠端正文須schema1且snapshotId／pageId吻合。body／PDF共用getRemoteObject的觀察bytes上限、長度與SHA檢查後交付；readPage／download沒有從本地搜尋文字fallback的分支。
- R3-03 valid `v2 3166 fresh`先檢release目錄，尚未讀config/build或bind socket；runner核ENOENT且path含`caches/fresh/v2`、排除Usage、無ready／listener，足以區分空cache原因。
- Prepare只寫新路徑且原E2 source先驗hash；新schema與遠端物件可離線對oracle核實。build有300秒watchdog、前後inputs及outputs收據；formal freeze核原保護檔／source／receipt outputs。Publisher完整source物件PUT／GET/hash後發布normal commit，wrong-v2刻意例外有標示。UI具正文／PDF不可用訊息、顯式retry及409重搜；實際畫面／request結果待正式驗。

補上述取消漏點後，主agent可執行一次sourcefreeze、prepare、audit-prepared、build、獨立MinIO setup及publish；這些是準備與發布讀回，不算17案例結果。正式前仍須核實際source／body descriptors／PDF、build receipt、MinIO binary／store／private配置保全、發布IO閉包及final freeze，並取得本審查的產物裁定。尚未正式HTTP，不允許將準備讀回冒充功能pass。

## 最終產物裁定

匿名GET已傳共用abort及5秒期限，每次前後ensure，最後取消缺口closed。現runner明確列17組oracle順序，錯版本／撤權／unknown路徑檢查無object GET；同長反例鎖定near key與實際SHA；空cache檢缺release原因而非參數／端口假失敗。沿原一次執行與停止規則，不追加矩陣。

獨立重算結果：

- formal freeze **460檔**及source freeze **27檔**皆符現檔，包含E1／E2原252保護檔、新卡／oracle／runbook與產物。source-freeze摘要亦符formal記錄。
- 唯一build收據的**28 inputs／88 outputs**全符現檔；未要求重build。主agent記一次build13.741秒，並保留stdout／stderr。
- 新來源hash對獨立oracle相符。由來源逐頁重算**75個正文JSON**的內容、key、bytes及SHA，另核**4個PDF**；合計79物件、17,590bytes。正常V1／V2無本地page.body／PDF交付檔，搜尋全文仍列帳。
- 逐一對照publication-io **183筆**：79來源物件皆有先PUT成功、後GET200、實際bytes／SHA吻合；全部正常release commit在內容讀回後。兩normal的manifest／索引／search-text讀回相符。wrong-v2 commit標objectReadbackComplete=false，與V2只有a-pdf descriptor key不同；它指向near真199bytes物件而保留a-pdf不同expected SHA，未污染正常版本。
- 另唯讀重算保全MinIO binary SHA為`086a31b97f28ee6ed16e938e449f1c07baa6f8f39549ac314251e543af95c50d`，符合setup記錄；版本輸出為DEVELOPMENT.GOGET／Go1.24.2，不能冒稱正式發行版部署證據。檢查時正式result.json尚不存在。

runbook明列root研究credential只用隔離store、非正式IAM；installer依本地trusted publication receipt pin manifest，未證災後receipt發現／遠端commit恢復或跨區發布交易。這些仍是採用／維運缺口，不阻塞本輪已限定的遠端交付、授權接縫與依賴故障實驗。憑證內容未讀出或寫入本審查。

依據：`evidence/v1-remote-content-20261115/{source-freeze.json,freeze.json,prepared-audit.json,publication-io.jsonl,minio-setup.json}`及runtime build／publication receipts。正式結果仍須另行獨立審查；失敗保留，不因已取得準備讀回就降低必要門檻。
