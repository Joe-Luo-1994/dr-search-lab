# E1 最小補驗：獨立有限結案審查

2026-11-15。**可裁定「E1合成必要任務有限結案」。** 這是整合既有原始回應、獨立離線核對及定向補驗的審查結論，不是將原凍結實驗改判通過。保留A可行基準及B/C候選；沒有淘汰C或成本勝出的依據。本輪停止，不執行E2。

## 結案依據

| 缺口 | 獨立核對結果 | 能支持的範圍 |
|---|---|---|
| 跨程序時間戳 | 正常權限Node22.21.1：parent及child各100次同程序夾測正常；100次IPC全部超出parent結束點5–6ms，ID無錯配。Sandbox另為99/100較parent開始早9–10ms，分開記錄。 | 嚴格跨程序wall-clock包含關係不是可靠不變量。沒有加入容差；底層OS/Node原因及原35筆失敗的逐筆成因未證。 |
| 當次Role變更 | 6筆原始API重新核來源投影、狀態、snapshot、no-store及單調期限：baseline正文200／搜尋1 → revoked-b正文404／搜尋0 → 恢復200／1，全部相符。 | 支持本輪合成Role撤除／恢復；不證精確授權時刻或公司ReBAC撤權SLA。 |
| 身份控制 | AX名稱「研究身份」、原exact label定位0、語意combobox唯一；清已開正文與結果、none空結果、desktop搜尋及清除均完成。 | C驗共享凍結API/UI；不增加B provider驗收或真人易用性證據。 |
| unknown錯誤 | 初始唯一alert是main外shadow中的空白Next announcer；對應unknown的503/body後，main出現權限未知訊息且沒有結果區。 | 已定位可造成原過早斷言的等待機制。原失敗瞬間DOM未保存，不捏造歷史節點。 |
| 延遲舊身份回應 | 真C 200／10 hits被暫留，切none後route.fulfill完成；browser同時記net::ERR_ABORTED，畫面仍清空。 | 只證取消／清除路徑，不稱舊response已交付應用JS，也不涵蓋所有競態。 |

r2必要搜尋／正文／PDF及Tags／Space／membership的既有子證據見[前次獨立審查](DR_E1_POSTRUN_REVIEW_20261115.md)。此次補驗未改產品、重跑該矩陣或啟動ES。主agent另核手機錯誤與desktop截圖；本reviewer核原始DOM／AX／network／斷言，沒有重啟browser。均屬agent證據。

## 原失敗與未知保留

- r1儀器啟動失敗、r2的formalPassed=false，以及首次F1的passed=false，全部維持。首次F1已有6 API＋2 UI子項成功，continuation只補剩餘4 UI；不回填原passed。
- 原服務未插樁。凍結程式await Role讀取的順序與實際撤除／恢復行為提供有限功能證據；server-local timestamp不能據此承諾client毫秒視窗審計、跨主機同步或精確讀取時間。
- Sandbox啟動／連線問題與正常權限對照保留，未改系統policy。Clock觀察否定不可靠的測試假設，沒有證明某一底層根因。
- 正式MinIO／ReBAC／身份、代表consumer、公司editor、真實語料品質、快照權限漂移接受及總維運成本仍未驗。技術碼／PDF近似頁排序差異未冒稱owner已接受。

## 保全與停止

獨立重新hash：原120檔、兩份新freeze的7檔、前次審查記錄的9份r1/r2證據digest，全部相符。Role目前為baseline；service-stop紀錄本輪C PID23416已停、remainingListeners為空。Reviewer未發HTTP、啟動服務或更動舊紀錄。

必要任務已有足夠合成證據，兩個驗證缺口已有明確的判讀界線。繼續重跑搜尋或追查OS時鐘底層原因不會實質改善目前選型決策，因此有限結案。這不是原卡全綠、部署批准或E2執行授權。

下一步僅建議E2小卡：真V1/V2的Tags／PDF membership與內容同版、舊鏈重搜／client恢復、非作者runbook操作及新增人工責任。壞版保舊只補新adapter改變的邊界，直接重用MR1/MR2，不重跑歷史全矩陣或百萬同版下載。

逐筆API／clock核對及證據hash：`evidence/v1-e1-followup-20261115/review.json`。

