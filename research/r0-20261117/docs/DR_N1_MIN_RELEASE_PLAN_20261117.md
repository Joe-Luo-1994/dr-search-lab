# 最小發布實驗設計卡 R0（待執行授權）

2026-11-17。僅設計及環境盤點，不啟動 cluster、不安裝工具、不產製 release、不執行實驗。使用者要求保留 2 Rust search＋2 Node metadata workers。此卡取代「直接擴充應用內熱切版」的下一步假設，並不取消原始證據。

## 決策與成功範圍

問題：以不可變 MinIO release、Pod 啟動驗證、平台滾動替換，能否完成可診斷、可恢復的資料更新，避免自行維護雙 pool／active pointer／舊 pool 回收？

成功只代表本地合成發布路徑可行，不代表正式 Kubernetes 平台可沿用、百萬正文已備援、ReBAC 正確、consumer 接受重新搜尋、最大容量或 A 的維運成本被打敗。沒有可用 Kubernetes 時停止完整實驗；installer-only 必須另標範圍，不偷換成 rollout 通過。

## 固定變因與允許工程

- 固定 N1 查詢 E 契約、2＋2 worker、既有 queue／timeout／故障策略、完整 SQLite metadata 與 Tantivy schema。沿用已凍結來源並保存 hash；不改 1＋1、不瘦身 metadata、不新增自動 worker 重啟框架、不做熱切版。
- 應用 Pod 的 Next＋所有 child 合計預算沿用 4 CPU／8 GiB，不能每個 child 各配一份；MinIO 沿用獨立 4 CPU／4 GiB 上限假設。兩個 app Pod 的更新期上限為 8 CPU／16 GiB，另加 MinIO、平台與負載產生器。這些是限制而非保證需求；CPU requests／limits、記憶體與 ephemeral storage requests／limits 須在實際 cluster allocatable 盤點後凍結，未凍結不跑。
- 單 Deployment、replicas=1、maxSurge=1、maxUnavailable=0 作候選；每個 Pod 固定 app image digest＋release manifest digest，獨立空 emptyDir。不要修改全域 context；所有操作明確指定經核對的本地 context 與專用 namespace。
- 允許的最小未來實作：產物 installer／validator、部署 manifest、startup/readiness 與終止處理、錯誤可觀測性、測試腳本。逐筆記錄新增責任；若需要跨版路由／supervisor／權限產品化則停止擴張，回報決策。
- 現行 status 即使 fatal 也可能 HTTP200，不能直接作 readiness。驗證 release／reader-ready 後才可接流量；fatal 必須不 Ready。不把暫時 MinIO／ReBAC 依賴故障直接變成無限重啟策略。startup 允許安裝時間，liveness 與健康語意須在實作審查凍結。

## 開始前硬性前提

原碼差距：`g3a/preloaded.mjs:12` 目前硬限 snapshotId=v1，現成 runtime 不能直接載 V2。後續允許最小 release ID 參數化，保留 hash／source lineage／schema 檢查；builder、manifest、reader、loader 的 V1 假設需一併盤點。不得只刪掉驗證使 V2 通過。此項列入新增工程成本與實作審查，本輪不修改程式。

1. 取得後續實作／啟動授權；確認專用本地 K8s context、namespace、可清理資源清單，不使用公司／其他專案 context。
2. K8s nodes Ready、可排程容量、容器 runtime／image 可用、同網路可讀獨立 MinIO、監測指標可取得。無此條件不進 rollout；不得為了測試停止其他專案。
3. image 與 release 完整可重建；固定 Node/ICU、Rust/Tantivy、schema／protocol 相容資訊。MinIO 憑證不寫進公開證據。全部使用合成內容／身份。
4. V1/V2 manifest 必須列 index、metadata、對應正文／附件的 key、bytes、hash 及來源綁定；異地完整再發布不可變 manifest。V1 不被 V2/V3 覆寫或 GC。
5. fixture 與 oracle 先凍結：百萬索引沿用 N1 規模；遠端正文仍只覆蓋指定有限集合（原 N1 256 頁），讀取範圍列清單，不宣稱全量正文。V2 在選定頁面改唯一 query token/title/body/tag，另改一筆附件 bytes/hash；搜尋 E、指定頁閱讀與附件 oracle 能分辨 V1/V2。
6. 正式時效／可用性 SLO 未定。以下時間只是研究護欄，不冒充產品驗收：單階段最長 15 分鐘、整次開始到清理最長 60 分鐘、每請求截止 4 秒；如預檢顯示不足，先改版設計並審查，不在執行途中放寬。

## 階段、驗收及停止

| 階段 | 操作（未執行） | 必須觀察到的證據 | 停止條件 |
|---|---|---|---|
| P0 預檢 | 只讀盤點容量／工具／來源，審查 installer 與 probes | 明確 context/namespace、資源預算、hash、oracle、清理與硬截止可用 | context 不明、容量不足、無指標、來源不一致：不啟動 |
| P1 冷啟動 V1 | 空本地 volume 下載驗證啟動 | Pod UID/volume 新建、下載量及分段耗時、hash、所有 reader 版本；Ready 前不接流量；經 Service 搜尋／讀頁／下載符合 V1 | 任一混版、錯誤內容／授權 fixture 洩漏、啟動失敗：保留證據並停止 |
| P2 發布 V2 | 單次中央 build／完整上傳；只更新 release digest 觸發替換 | 新 Pod 冷安裝，Service 流量由 V1/V2 到僅 V2；V2 oracle 成立；舊 Pod 退場與程序清理；持續有限混載記錄 | 未 Ready 先接流量、內容 hash／版本錯、超時限、資源壓力危及主機、反覆人工修復：停止 |
| P3 拒絕壞 V3 | 以獨立新 key 發布一份明確 hash 不符的合成壞包，不修改 V2 | V3 不 Ready，錯誤標明 release/檔案/原因；V2 經 Service 三種操作連續可用；部署失敗可辨識 | 壞版接流量、舊版意外退場、混版或觀測缺口：停止；不自動重試其他故障變體 |
| P4 實際回滾 | 明確重新指定已保存的 V1 release digest（app 不變） | 重新下載／驗證／Ready，經 Service 的查詢／正文／附件符合 V1；紀錄耗時及操作步驟 | 只有 deployment 成功但資料不符、依賴產物缺失：不通過 |
| P5 清理 | 專用資源清單清理，保留原始證據與產物 | 無本輪 Pod/job/port-forward/loader 遺留，其他專案未變 | 清理不完整即標未結案，不隱藏失敗 |

每階段先通過才往下；失敗先保存原始資料，不為了綠燈連續改 fixture 或加資源。P3 的預期 hash 拒絕不是實驗失敗；無法拒絕或損害 V2 才是失敗。

## 有限混載與跨版體驗

不是最大 RPS 測試：單獨 loader 固定每秒各 1 次 search、page、media，獨立排程、4 秒截止、最多 12 個在途；超過上限記 missed，不補發掩蓋。P1 穩定觀察 60 秒；P2/P3/P4 全程觀察，成功就緒後各再 60 秒。loader 不放在 app 配額內，另記資源。驗證 body/hash，不以 200 代替正確性。

結果逐請求記 scheduledAt、實際發送、完成、release、Pod（以測試可觀測資訊取得）、status、內容完整性；保留固定分母、錯誤率、最長連續失敗區間、missed 與延遲。任何 missed 都使相關負載窗口不足以判定連續服務，不拿當期低延遲作通過證據。P1 穩態及 P3 保留 V2 需零非預期錯誤；P2/P4 紀錄中斷，若有非版本錯誤則機制可部分成立，但服務保留驗收未過。

額外固定一筆 V1 搜尋 URL，於確認僅 V2 服務後讀取，必須明確 VERSION_MISMATCH，不靜默替換正文；再搜尋 V2 並讀取成功。混版期間可能重複 mismatch，分開統計，不無限重試；UI／consumer 是否接受仍待決策。當下只驗 API 契約，不宣稱已完成友善 UI。

## Reviewer 修訂：下列明確規則優先於上方簡寫

依 [獨立審查](DR_N1_MIN_RELEASE_REVIEW_20261117.md) 修正五項歧義：

1. release 參數化必須驗證要求版本等於實際 manifest／reader 版本；原 frozen 原碼保留，新 adapter 另記 diff/hash。不是原 runtime 完全不變。
2. P3 以 installer 出現預期 hash 拒絕、V3 未 Ready 作觀察起點，繼續驗 V2 60 秒；不等待 V3 Ready。凍結 progressDeadlineSeconds=120 作研究設定，需在該期限後60秒內取得 ProgressDeadlineExceeded，否則標示部署失敗可觀測性未過並停止。平台版本及設定是否支援在 P0 核對，不能把只看 installer 失敗當部署告警驗收。
3. 混載的正常讀取 lane 使用事先固定的 page/media IDs 與版本表：P1 固定 V1；P2 全部就緒 V2 前要求 V1，之後要求 V2；P3 固定 V2；P4 在全部就緒 V1 前要求 V2，之後要求 V1。原則以各階段目標明列：P2 切換前 V1、切換後 V2；P3 始終 V2。每個版本各自有凍結 bytes/hash oracle，不從回應動態改期待。search 可回 V1 或 V2，但只能是該階段允許的版本且符合其凍結 oracle。page/media 若所到 Pod 不同版只容許明確409；額外固定舊 URL 是 transition probe，與正常 lane 分開統計。記錄要求版本與實際版本（透過測試 response header／可關聯 log），無法取得即觀測缺口。合法新舊 Pod 共存不叫內容混版；同一成功回應的 metadata／body／media 版本矛盾才屬立即停止。P1、P3 穩態不容許409。
4. 任一階段只有「機制部分成立、服務保留未過」，仍停止後續階段並清理，不降低驗收繼續。漏發窗口同樣不通過。預期 transition 的409單獨報告，不當完整透明體驗成功。
5. 16 GiB不是全程 app 絕對峰值，需計入 terminating Pod。P4 前先回收壞 V3、確認只剩健康 V2 與無殘留工作再回滾；清理失敗即停止，不偷偷刪掉健康 V2。資源觀察涵蓋本輪所有 Pod。

研究時限澄清：V2 build／上傳列入 P2 的15分鐘。若預檢顯示無法容納，先修訂設計／預算再核准，不在跑到一半加時。60分鐘總預算預留最後10分鐘清理，50分鐘到即停止新增工作並清理；超時仍須完成安全清理，報告超時而非遺留服務。壞hash僅驗一種拒絕路徑，不宣稱所有壞包皆已驗證。

## 成本紀錄項目

Reviewer 複核補充：P3完成後先把 Deployment desired release 恢復為目前健康 V2，取消失敗 rollout，等 V3 全退場、V2 穩定且無殘留工作，再開始 P4 的 V2→V1 回滾計時。不能只刪 V3 Pod，否則 controller 會重建。此取消步驟與耗時獨立列帳並計入總時限；失敗即停止。以上五項及補充已修正，設計可作實作基準，環境與執行授權仍未滿足。

記錄下載／hash／reader-ready 各段時間，Pod 與整組 CPU／memory／ephemeral disk 峰值、網路 bytes，平台／MinIO／loader 分開。不以 limits 當實際使用量。凍結機器與 K8s 版本、資源設定，保存事件、probe、installer、release receipt、逐請求紀錄。

維運記帳：正常更新與回滾的命令／人工介入、診斷步驟、需新增的狀態及例外分支、哪些可沿用公司平台但未確認、誰要負責。新增行數和一次順利運行不換算成每月人日。成功後停止，不自動擴 RPS、瘦身 SQLite 或導入正式資料；若人工修復多，先評估成本是否值得，而非立即打造平台。

## 本機條件盤點（2026-11-17，唯讀）

- Windows PATH 有 kubectl v1.34.1、Docker client 29.1.3、WSL；未找到 kind/minikube/k3d（只代表 Windows PATH，未搜索或啟動 WSL 內工具）。
- kubectl current-context 未設定、get-contexts 無項目，因此沒有可驗證的現成 cluster 入口；沒有對未知 endpoint 發出請求。
- Docker PUBLIC-HOST engine named pipe 不存在，Server=null；WSL 唯讀列表顯示 Ubuntu、docker-desktop 都 Stopped，版本 2。未啟動。
- 主機可見實體 RAM 33,289,368 KiB（約31.75 GiB），當時可用16,768,788 KiB（約15.99 GiB）；C 槽可用368,099,332,096 bytes（約342.82 GiB）。瞬時數值不是 K8s allocatable，磁碟空間也不是 WSL 虛擬磁碟內可用量。
- 初次 sandbox 的 WSL/CIM 讀取被拒，核准唯讀升級後取得上述狀態；未變更系統。

**結論：具備部分工具，但目前不具備可直接開始 rollout 實驗的已驗證條件。** 雙 app 上限16 GiB 再加 MinIO4 GiB及平台已高於當時空閒 RAM；不代表必然 OOM，但不能承諾保留全部上限的安全餘裕。後續若核准建環境，需先確認 RAM／WSL 配額及實際排程預算，不擅自降 app 資源而沿用原容量結論。
