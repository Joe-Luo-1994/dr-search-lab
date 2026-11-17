# R0 修訂：以可量測的停機換取單 Pod 更新

使用者於雙 Pod 預檢觸發資源護欄後，選擇「先停舊 Pod、再啟新 Pod；量測短暫中斷」。此文件取代原卡的滾動共存驗收，其餘來源完整性、2＋2 worker、E 搜尋契約與資源護欄不變。

## 要回答的問題

固定版本 Pod 能否在單一 reader 的資源預算內完成冷啟動、更新、拒絕壞包及恢復舊版本？需要多久中斷，以及哪些發布與復原責任仍由團隊維護？不驗最大 RPS，不宣稱總維運成本優於 A。

已確認舊方案：20261117-094213 單 Pod 啟動至 rollout ready 23.48 秒；30 秒內 search/page/media 各30次，90/90通過，最高12.47ms。第二個 Pod 安裝階段 Windows available 降到5.17GiB，低於6GiB；監控停止專用cluster。未取得雙 Pod 完成證據。最後cluster memory.current為8.60GiB、oom/swap為0，但memory.events max有增加；沒有分層記憶體資料，不能歸因於某服務或把全部用量當不可回收工作集。

## 改變與代價

- Deployment 改 Recreate，必須確認舊 Pod 已退場才安裝新版。每次更新都可能中斷，壞版也會使服務不可用，直到操作員指回保存的良好 release。
- V2中央build先在cluster停止時獨立完成，4CPU/4GiB/swap0、最多15分鐘，另計時間與成本。不聲稱中央build與本站服務共用本機時可同時運行。
- P2計完整發布、切版、恢復後60秒；P3計壞包拒絕、部署失敗可辨識、指回V2與恢復60秒；P4回V1並驗60秒。每階段15分鐘、正式全程60分鐘（50分鐘停止新增工作，10分鐘清理）。
- 仍每秒各1次search/page/media、4秒截止、最多12在途；預期停機期間的HTTP失敗／連線錯誤計為失敗及中斷，不改成成功。200必須符合凍結oracle；錯誤內容立即停止。恢復穩態60秒需零錯與零漏發。
- V1/V2唯一query、title/body、AND tags、附件hash及舊URL409分開驗。合成正文僅256頁、附件8筆，基本負載附件為64KiB；不作8MiB下載壓力或百萬遠端正文結論。
- 外層cluster12CPU/12GiB、app4CPU/8GiB、MinIO2CPU/2GiB，Windows start14GiB/floor6GiB、cluster10GiB停止點及無swap規則不變。Recreate不保證一定通過；再次觸線即停止討論。

## 清理與安全

上輪controller已停止、profile已停止，尚不能聲稱namespace已刪除。先保全停止容器的Pod logs與profile外fixture/image/證據，再刪除重建唯一專用profile dr-search-r0，避免復活兩個reader。不碰既有minikube與其他專案容器。這是本機實驗復原成本，不列為產品每次更新的必需流程。

Reviewer設計同意不等於實作或正式實驗通過；後續仍審程式、資源前提與原始結果。正式MinIO耐久性、ReBAC、DNS切換、consumer接受停機與版本409，以及公司平台可重用量仍未知。

## 100845之後的環境候選

使用者另授權memory.high單次診斷。100845在專用Docker node host cgroup明設high6GiB、hard12GiB/swap0/12CPU不變，單Pod冷啟動21.45秒、60秒180/180低頻操作通過；host最低6.50GiB，cluster最大取樣6.00GiB，local high2667次、local max0、階層max6812次，無OOM/swap。namespace正常清理、cluster及controller停止。

若reviewer放行，下一次正式使用明確的recreate-high stage，每次啟動重新寫入並讀回high6，不依賴前次設定留存。仍只有一個reader、2＋2、原hard limits與hostfloor；其餘P1–P4及停止條件不變。不以此次單次結果證明high造成全部改善，也不將此WSL環境策略當正式平台必需設定。50分鐘硬unit停止路徑未證優雅namespace清理，發生時必須分開報停止與清理結果。
