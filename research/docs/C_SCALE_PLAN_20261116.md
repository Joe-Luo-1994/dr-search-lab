# K5：用合理擴容換取少客製維護

2026-11-16，使用者已授權設計並執行擴容。主目標是 DevOps 維運負擔，不是最低硬體。此卡驗證現有 C 是否只需固定部署配置即可通過必要工作點；不量化正式月工時、不比較 A/B。

## 固定與配置

- 沿用 K2 frozen 百萬頁 V1/V2、Next build、SQL、queue16、admission query4s、pool ready30s、update150s、語意／授權／版本規則。原始資料與程式不可覆寫。
- R1：reader 全服務4CPU／8GiB／4workers；MinIO4CPU／4GiB。R2僅在R1有資源限制證據時：8CPU／12GiB／8workers。兩者swap0；同reader cgroup包住Next、新舊pool、安裝與內容代理。worker數為新副本唯一產品邏輯設定改動，預先固定，是部署配置比較而非單變因因果。
- 本機WSL 20,969,484,288 bytes RAM、28CPU、約927GB磁碟空間；不改WSL上限。R2總16GiB預算，保留約3.5GiB給host／generator；無餘裕不得執行。每5秒監測host MemAvailable，低於1.5GiB停止；新增目錄上限24GiB，磁碟free低20GiB停止。MinIO原資料沿用，不複製大量原檔。
- 新runtime `.lab/c-scale-20261116/r1`、必要時`r2`；新ports3178/19680/19681，獨立unit與cache。原K2/K3/K4證據不改。每attempt輸出不覆寫；輸入事前／事後hash及實際limits必須讀回。

## 工作點與門檻

1. Fresh install V1與ready；冷啟動另記，不稱host cache cold。先驗內容／拒絕契約；正式輪不額外預跑九個昂貴query，主負載每次搜尋依獨立source oracle驗結果，各shape都覆蓋。避免新增不必要預熱，但內容前置檢查仍會暖cache。
2. reading-only SSR1/s 30秒：P95<=500ms、失敗<=1%。
3. Web九query輪替SSR→search，2/s再4/s，各30秒；獨立reading1/s。Web搜尋P95<=2s；reading<=max(2×合格baseline,500ms)；每lane失敗<=1%。filters／身份為HTTP任務，既有UI只有keyword。
4. Web4/s＋reading1/s不變，consumer九query1/s再2/s，各30秒；consumerP95<=2s、失敗<=1%。首失敗停止升階，不偷降載宣稱同目標合格。
5. 同上加bulk下載2/s，30秒；維持相同背景做V1→V2更新180秒，第5秒觸發。真下載／校驗／雙pool／啟用；請求須與真索引下載窗重疊，並在第155秒前啟用、至少20秒啟用後V2觀察；所有lane門檻仍成立。409記未完成，不能當成功。
6. 結束驗輸入hash、installed DB、服務與ports清理。全runner900秒與drain16秒；錯資料／權限立即停；OOM／timeout保留原錯誤。

更新另需retired-drained(v1)事件、舊V1 worker PIDs已退出reader cgroup、新pool數及歸屬符合preset。每lane均需V1/V2成功及啟用20秒後新送出的V2成功。無成功更新receipt時，重疊量記未知而不是0，必要時從events離線重算；沒有成功receipt不得判更新合格。未送取消不納延遲分布，仍保留在未完成分母。

所有服務在同主機串行。R1失敗後先分析CPU、queue、memory events、worker、內容槽與更新事件；非資源問題不升R2。R1全部合格就停止，不為找最大容量追加配置。R2仍失敗則交回架構／隔離／更新流程選擇，不自動改SQL、放鬆deadline或增至16GiB。

Controller從fresh-ready下載開始及load期間獨立每5秒監控host／disk；觸限或監測例外直接停本輪units，不只依靠harness讀flag。load外層960秒subprocess deadline，finally清理。Web-search SSR固定兩版均space0且有正文的p000002，同搜尋身份；reading all固定p000001，另驗V2移動後的拒絕。此變更避免將p1合法撤權混成容量故障，也使本輪與K3不是純資源因果A/B。

## 可沿用與不可推論

K3 keyword browser smoke可沿用同Next build及未變頁面；新worker preset與HTTP負載需重驗。不以歷史K3跨日延遲判純擴容倍數；本輪找到可行工作點即可，沒有勝負排行需要不重跑舊基線。

只有256正文hotset／8media；九query等權與重複語料，非正式工作量；新PDF-only品質仍未補；正式ReBAC仍mock。更新錯誤／資源失敗不以重跑掩蓋。短窗可行不等於長期可靠、正式RTO或人工維護少。

## 維運記帳

記部署設定改動、新增程式／工具責任、啟動／更新需人工介入次數及原因、待自動化項目。Agent準備／排錯與系統等待分開，無可信人時計量就標未知。自動下載／更新成功證明該流程可自動執行，不證明排程、告警、升級、回滾與非作者操作已完成。
