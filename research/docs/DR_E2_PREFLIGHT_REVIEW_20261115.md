# E2 執行前定向複核

2026-11-15。裁定：**三項修正 closed，可按凍結卡單次執行 G1–G3。** 本次只讀程式、修補差異與本機檔案雜湊；未啟服務或發 HTTP，亦不代表實驗通過。G4仍須新非作者僅依凍結runbook第4節接手，另作結果判定。

| 原缺口 | 複核結果 |
| --- | --- |
| 180秒及Web30秒只計時，可能繼續操作 | 共用AbortController／stopFor已中止command、resource、fetch，start前後及輪詢查停止狀態；browser建立後亦查，Web timer關閉browser及本輪children。後續操作不得越過ensure。期限機制為靜態核對，未另做超時演練。 |
| 交付metadata與移Space正文未核 | 8組查詢逐hit比對凍結來源Space／Tags／title；moved-b正文與V1來源相同、Tags對V2來源。獨立oracle既有total／IDs與版本檢查保留。 |
| runbook回退可能擴範圍 | 第5節明列本輪不執行、尚未驗證，不是本次能力；非作者只執行第4節。 |

已獨立重算：原freeze及freeze-r2各132檔，僅run.mjs與runbook兩檔不同，其餘130檔一致；目前132檔全符新freeze。兩份preflight-original原件符合舊freeze；E1的120檔全符原freeze-r2。Build receipt的28項inputs／88項outputs全符現檔，產品／fixture／build未因這次harness修補改動，無需重build。檢查時正式result.json尚不存在；準備完成與正式執行分開。

依據：`evidence/v1-e2-20261115/preflight-repair.patch`、`preflight-repair.json`、`freeze.json`、`freeze-r2.json`、`preflight-original/`及`.lab/v1-e2-20261115/build-receipt.json`。保留原source-freeze／freeze；這是首次正式執行前修補，並非結果失敗後重跑。

沿用原四關邊界與停止規則：任一必要項失敗保留並停，不改oracle救分；收尾另核本輪PID停止及檔案保全。G4只證單機來源角色不可達下的agent操作，不證雙機房隔離或真人接手。即使四關成功，也不能據此宣稱C優於A／B、正式consumer接受、公司ReBAC／MinIO整合或成本勝出。
