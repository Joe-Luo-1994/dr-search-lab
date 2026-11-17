# R0 本機環境預檢：容量前提待決策

## WSL minikube 環境 smoke 已完成（不是 R0 實驗）

使用者提示後啟動Ubuntu確認：minikube1.34.0、kubectl與Docker皆存在。舊minikube profile K8s1.31.0／3CPU／6GB為Stopped，既有其他容器全停止，未啟動。WSL啟動帶起Docker/containerd及openresty等既有系統服務，未自行停用不明服務。

依授權正常關閉Edge及VS Code主視窗，之後程序查詢未見兩者；未強殺，不動Codex/ChatGPT工具。以 `minikube start -p dr-search-r0 --driver=docker --cpus=4 --memory=6144 --kubernetes-version=v1.31.0 --keep-context` 建立隔離profile，Node Ready、系統pods全Running，原current-context仍minikube。此舊版只作現有工具鏈的本地smoke，不宣稱正式平台版本相容。

重要實測：Node allocatable回報28CPU與20478008Ki memory，但外層Docker memory=6442450944（6GiB）。--cpus=4並未形成可觀察的外層硬限：nanoCpus=0、cpuQuota=0、cpuPeriod=0、cpuset空；memorySwap=12884901888，也不符合正式實驗swap0期待。空載Docker約682.6MiB，Windowsfree13.74GiB；不能用空載或allocatable推論原R0峰值足夠。

Reviewer判定環境smoke通過、原實驗容量門未過。已 `minikube -p dr-search-r0 stop` 保存profile；docker ps為空、current-context保持minikube。未部署研究app／MinIO、未改runtime。正式測試前須解資源預算、外層CPU與swap護欄；WSL仍保持啟動，沒有全域shutdown以免影響其他工作。

## 使用者授權停用不需要服務後的盤點

使用者選擇本機，授權先停止不需要的服務。逐程序辨認發現多數 Node/node_repl 為 Codex 工具，不能視為閒置實驗；未停止它們。MySQL80 在查詢時無3306/33060 established TCP連線，嘗試透過 Stop-Service 正常停止，但 Windows 拒絕開啟服務控制權限；核對仍 Running/Automatic，未強殺、未變更開機設定。此為 OS 權限錯誤，不是 auto-review 拒絕。若之後成功停止，恢復指令為 Start-Service MySQL80。

主要 working set 分組約 ChatGPT2.46GB、Edge2.17GB、Code1.96GB、Notion0.96GB（共享頁可能重複，不能相加當可回收量）。實際空閒RAM再測15.93GiB。可見Edge研究分頁與VS Code本專案文件；未關閉以免未存工作。已詢問可正常關閉哪些桌面App，保留Codex/ChatGPT及儲存提示。尚未啟動Docker/K8s或改runtime。

使用者已授權準備隔離 Kubernetes 環境、最小實作及 reviewer 通過後實驗，但明定資源不足或設計變更先討論。此限制優先於原設計卡的未授權歷史狀態。

本輪僅唯讀盤點，未啟動 Docker／WSL／cluster、未安裝工具、未改 runtime、未停止其他專案。

## 實測

- 主機 RAM 33,289,368 KiB，當時可用16,815,556 KiB（約16.04GiB）；20實體core／28logical；C磁碟368,106,979,328 bytes可用。
- 現存 `.wslconfig` 設定 memory=20GB；未改設定。Ubuntu 與 docker-desktop 都Stopped。
- 兩個mysqld與多個node程序存在，至少一個MySQL於3306／33060監聽。未讀取敏感命令列或改動它們；這是既有工作存在證據，不是其健康或負載驗收。
- 先前 kubectl context空、Docker engine無可連pipe；沒有現成可用cluster的證據。

## 判斷

原設計雙app的合計memory limits=16GiB、MinIO=4GiB，還未含控制平面、runtime、loader、terminating pods與host餘裕。20GB的WSL上限無法為所有上限同時使用提供這些餘裕；Windows當時可用約16GiB也不足以據此保證其他專案不受壓力。

limits不是實用量，也不是已凍結的requests；因此不能說硬體必然跑不了。但尚不能通過「資源足且不影響其他專案」前提。不提高全域WSL上限、不默默下調limits、不用swap掩蓋限制。

## 需要討論的兩條路

1. 本機有界資源修訂：維持app4CPU/8GiB上限與2＋2，另行同意評估MinIO較小上限、實測工作集後制定requests／主機餘裕／停止門檻。是否能容納需再預檢，不預先保證；MinIO配置變更需確認不成瓶頸，不能無條件套用原N1比較。
2. 改用有足夠空閒RAM的獨立測試主機，保留原配額與更充分餘裕；仍須核環境與資源，不以硬體規格取代預檢。

暫停依賴容量通過的環境啟動／實作，先取得路線決策。沒有清理需求，因未啟動任何測試資源。
