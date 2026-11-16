# K5：擴容對維運責任的影響

本表隨本輪實際執行更新；開始時僅記已完成的實作與仍需承擔的責任。不是正式團隊人時估價。

| 項目 | 本輪具體變化 | 人工作業／可交接性 |
|---|---|---|
| 部署種類 | 維持 Next＋本地SQLite，沒有新增常駐搜尋服務；MinIO及ReBAC依賴不變 | 只是容量配置改變，未驗公司deployment模板 |
| CPU／RAM | 第一階4CPU8GiB，條件式第二階8CPU12GiB | 控制程式可套用固定preset；目前需人選擇，沒有自動擴縮 |
| worker數 | 新隔離副本將硬編碼2改為4或8；原SQL／queue／deadline不變 | 本輪只改一處pool建立數量，產品化仍須受驗證的部署參數及監控；不能稱已零程式變更 |
| 建置與資料準備 | 沿用Next build、百萬V1/V2、MinIO物件；未重建索引 | 正常producer建置、排程發布的維護責任沒有因擴容消失 |
| 冷啟動 | 使用既有自動下載、hash校驗、pool檢查；實測結果待填 | 啟動由controller觸發，未驗正式Kubernetes重排程 |
| 更新 | 使用既有admin API觸發，服務端下載、校驗、啟用與舊pool回收 | 成功不代表每日排程、告警、回滾及舊檔GC已完成 |
| 實驗新增工具 | 一個隔離環境controller及合併Web／consumer／更新runner | 研究工具，不直接列為正式常駐deployment；維護／轉交仍需明示 |
| 安全護欄 | 每5秒host／disk外層監測，worker歸屬核對，操作及總時限、finally停止 | 這是本機實驗保護；不是已部署的公司告警與值班流程 |

本輪所有設定、觸發與收尾由agent代為操作；若需修碼、手動介入會保留原因。執行等待時間可由receipt量測；可靠的active hands-on人時、公司事件頻率、月／年工時及正式成本目前未知。即使此配置通過，也只支持「不新增搜尋服務的可行部署候選」，後續應驗runbook能否由非作者操作。

## R1 已觀察結果

4CPU／8GiB／4workers：ready約10.065秒；正式runner約366.64秒。前六階通過，更新能自動下載／校驗／啟用／退役舊worker；下載到啟用56.236秒，啟用後舊pool約2.640秒退出。過程沒有人工修碼或手動修復服務，但更新階Web與reading未達原門檻，5個任務被拒絕。因此不判整體合格。

R1負載開始後的觸發與清理由既有controller完成；觀察使用唯讀檢查，未調整正在跑的CPU、RAM、query、queue或content slots。後續進R2是事前條件式配置選擇，不是故障後靜默重跑或改分母。

仍需明示：本原型只演練V1→V2，API限制更新到V2；多次每日產新版、V3以後的生命週期、舊DB檔GC及回滾流程尚未完成。舊worker釋放不等於舊索引檔已清理。這些都屬正式化時的開發／維運責任，不能用一次成功切版抵銷。

程式盤點另見：worker異常會讓pool進入fatal，現PoC沒有自動重建健康pool的完整機制；是否由Kubernetes readiness/liveness與重啟流程接手，尚未實測或配置。本輪沒有注入worker故障，因此這是code inspection得到的待補維運責任，不是已發生的新實驗故障。

Reviewer補充核對：PoC的init固定安裝V1；尚未接通最新版發現、重啟恢復到已發布最新版。這是固定V1/V2容量實驗的實作範圍，不能當作每日多版本生產環境的復原方案。後續操作驗證需優先處理，不能只依一次正常更新就認為restart可交接。

## R2 已觀察結果

8CPU／12GiB／8workers：ready約17.356秒，正式runner約366.33秒。七階通過，2,550預定任務全部完成；更新階1,620任務全完成。V2下載49.420秒、下載到啟用54.607秒、舊worker約1.091秒退出；不需負載中調參、重啟或手動修復。這仍由admin-triggered測試流程執行，沒有新增正式排程或告警。

R2的操作與R1相同，只有預先選擇另一preset，沒有增加常駐deployment種類。更新階平均CPU約3.65核，觀測RAM峰值約6.45GiB、無CPU節流／memory.max／OOM，queue觀測0。測試是WSL的cgroup上限，未驗Kubernetes requests／節點安排；未證12GiB為必要或最低資源。R1／R2宿主cache及MinIO壓力有差異，不宣稱單純CPU因果或資源越多啟動越快。

兩輪最後都由controller停止自身units；Next退出143是收尾SIGTERM結果，未作負載錯誤。各80凍結檔與兩版installed DB雜湊相符、相關ports皆關閉。保留兩輪全部資料與失敗，不繼續第三階。
