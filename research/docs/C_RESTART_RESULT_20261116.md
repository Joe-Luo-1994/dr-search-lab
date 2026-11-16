# O1：核准版本啟動，有限結案

入口：[手機報告](C_RESTART_RESULT_20261116.html)／[獨立審查](C_RESTART_POSTREVIEW_20261116.md)。本輪停止，沒有追加壓測。主問題是減少重啟時的人工作業，不是再測容量。

六案例符合預期：首次 V1、同快取升 V2、空快取 V2、V2 快取重用、壞 manifest pin 有快取、壞 pin 空快取。四正常啟動各有新 reader 與八 workers；兩反例 503，不 ready，cache 與 active 不變。重用仍驗整個 DB，只省 DB GET，未省 approved／manifest GET。

629 frozen inputs 無變化（含 K5 80），所有本輪服務停止、port 無 listener。Next 主動停止留下 exit 143／unit failed 紀錄，沒有抹成 exit 0。有效 V2 指標已恢復；原壞指標證據保留。

## 維運責任帳

| 工作 | 本輪具體實作 | 後續責任 |
|---|---|---|
| 找到應啟動版本 | 固定遠端 approved key，pin manifest hash，不依本地 catalog | publisher 權限、核准政策與錯誤處置 |
| 發布完整版本 | publisher 逐物件 GET／PUT／GET，manifest 驗證後，最後批准 | 既有 producer pipeline 整合、跨區完成條件；未驗多 writer |
| 準備本地 DB | bootstrap 驗證 schema/key/hash、下載 staging、不可變版本目錄 | 格式升級、壞檔診斷、磁碟與殘留 staging 管理 |
| 重用快取 | 完整 hash 驗證，不盲信 active | 大索引啟動掃描成本仍需納入，這次小資料無容量結論 |
| 宣告可用 | Pool.start 檢查 SQLite 身份與 quick_check 後 commitActive，再 ready | 正式 readiness、失敗重試／重啟、告警 |
| 同時持續服務與更新 | 本輪 startup-only，熱更新明確 404 | O1 與 K5 尚未整合；不得拼成已完成系統 |
| 人工成本 | 重啟不需人工給版本路徑；實驗由 controller 觸發 | 非作者交接、月事件頻率、人時與完整 A 比較仍未知 |

新增 `scripts/c-restart-20261116/bootstrap.mjs`、`publisher.mjs`、`environment.py`。隔離 service 改啟動鏈與停用更新入口，storage 加 client key/method 記錄；pool/worker 與 Next build 沿用。沒有新增常駐服務種類，不代表沒有新程式維護責任。實驗 controller 的故障注入、hash 與證據匯出，不等於每次正式操作需全部由人執行。

## 邊界與下一個決策

Linux WSL、真本機 MinIO、1,000／1,001 合成頁，DB 3,256,320／3,268,608 bytes。控制器本輪 5.60 秒不含 freeze hash；不作 RTO、效能提升或百萬頁啟動推論。Reader 8 CPU／12 GiB、MinIO 4 CPU／4 GiB 是實際上限，但此低頻驗證不證其容量。K5 容量結論仍只屬原凍結 runtime。

共用研究 root credentials、單 publisher、獨立 cache writer。尚未證正式 IAM、Kubernetes 重建、熱更新整合、連續 V3／GC／rollback／fatal 復原、正式 ReBAC、搜尋品質與 consumer 契約。正向 search body 未全存，依凍結 controller 當場斷言；reviewer 沒有離線重算全部欄位。

現採保守政策：新程序遇無效核准指標即不服務，即使有好 cache。本次只實驗 manifest pin mismatch，不能泛稱所有故障都已驗。修復指標後失敗程序不會因本輪證據而被視作可自行恢復；重試／重啟／告警未完成。下一步先決定等待修復或容許受控舊版服務，再選最小整合驗證。現在不擴展故障矩陣。

證據：`evidence/c-restart-20261116/`，native runtime `.lab/c-restart-20261116`。未提交、未推送；原服務與資料不刪除。
