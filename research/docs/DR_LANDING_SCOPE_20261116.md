# 落地範圍補充：ES 異地索引與 C 實際交付

2026-11-16。使用者補充：目前理解 A 主要尚缺 ES index 異地移轉；即使有監控與自動化，新增 ES 仍有容量、磁碟維護、升級與事故責任。希望先釐清 C 落地要做什麼，這是團隊的重要未知。

「A 主要只剩 ES 同步」記為使用者目前理解，不替未提供的 MariaDB／MinIO 還原證據背書。上一輪將下一行動過度鎖定 A 對口資料；本補充調整為：A 證據未知不阻止盤點 C 的具體交付。仍不為補齊功能而自動實作整套故障矩陣，也不新增壓測。

## ES 可討論的基準設計（官方能力，不是公司實測）

每日同步情境可先評估 snapshot／restore。台灣 ES 建 snapshot→確保 repository 的一致完整內容可由異地取得→異地 ES restore 到新的具名 index→驗證→切查詢 alias→保留舊 index 一段時間後清理。應用持續查 `pages_current`，更新時將其從 `pages_v1` 指到 `pages_v2`。這是資料版本，不是 ES 軟體版本；既有應用若直接用實體 index 名，需調整配置或程式。

ES 支援 restore 時 rename，以及單次 aliases API 的原子 remove/add；操作需檢查錯誤與實際指向，不能僅憑 HTTP成功／acknowledged 判定。官方當前文件指出多action可部分失敗，應按實際版本設定適用的 must_exist 等前置檢查。正式 ES 版本未知，尚未實測。

snapshot repository 可用相容 S3 的 MinIO；單一 repository 只允許一個 ES cluster writer，其他以 readonly 註冊。異地不能只依賴災難時不可達的台灣儲存。可評估直接寫異地可存取repository，或另設完整一致的repository複製流程；不能把正在變動中的bucket隨意拷貝、看到新檔名就當還原可用。不要直接複製 ES node data directory 當支援的備份流程。

保留舊索引＋新名稱還原需要新舊共存空間。若等災難才還原，還原等待計入RTO；預先還原則承擔平時資源與更新工作。alias 原子切換僅限 ES，不會同時切 MariaDB 或 MinIO，跨系統資料／授權對齊仍要設計。這只是 A 的 ES 部分，亦可能供 B 使用，不能當完整 A 的驗收或工時。

官方依據（2026-11-16查閱）：[restore與rename](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/restore-snapshot)、[alias切換與錯誤](https://www.elastic.co/docs/manage-data/data-store/aliases)、[repository與MinIO](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/self-managed)、[snapshot範圍與限制](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore)。

## C 的工作拆解（初步分工，owner未正式確認）

| 工作包／主要負責角色 | 需要交付的具體成果 | 可沿用證據與缺口 | 完成如何辨認 |
|---|---|---|---|
| 正式資料匯出／應用團隊 | MariaDB page/title/正文/PDF抽取文字/Space/Tags/page-media 轉為穩定輸入；定義一致資料切點 | 合成builder可參考；正式schema與匯出未接 | 同批抽樣文件、權限歸屬與附件能追溯回來源，缺件不發布 |
| 搜尋與API／應用團隊＋consumer | SQLite前處理、查詢、篩選、排名、摘要及正式API adapter | K5合成容量成立；真實品質／API待對照 | 預先約定的必要查詢與consumer流程通過；可接受差異明列，不強求所有ES語意相同 |
| 閱讀下載與授權／應用團隊＋身份對口 | 接現有pageId閱讀、正文格式、PDF/media路徑、正式身份/ReBAC、canonical membership | 遠端MinIO與合成身份子證據；正式格式、大檔／Range需求待核 | 正式任務路徑可讀可下載，無權限不可取得；沿用現有editor不預設重寫 |
| 集中建置發布／應用團隊＋pipeline owner | 匯出→build SQLite→驗證→發布完整版本→各站可讀，排程/失敗告警/保留 | 有builder/publisher，正式pipeline與跨站完成條件未接 | 自動產生可追溯可安裝版本；失敗有可定位訊息，無人每天手動搬檔 |
| Reader生命週期／應用團隊＋平台 | 統一啟動與熱更新、ready、新舊請求處理、重試、cache上限與清理 | K5熱更新與O1啟動分開通過，尚未整合；GC/fatal復原未驗 | 新Pod與既有Pod依同一契約取得版本，更新不破壞任務；用少數必要情境驗收 |
| 部署與維運交接／平台＋維運 | Next配置/secret/network/resource/ephemeral-storage、MinIO政策、監控、告警與runbook | WSL配額與原型紀錄，非K8s部署模板 | 非作者能部署、辨識失敗並依流程恢復；正常更新無固定人工需求 |

責任不全消失也不全集中在MinIO：MinIO是持久版本及內容來源，Web Pod仍有本地DB、磁碟空間/IO、記憶體、worker及下載依賴。沒有PVC的本地副本可重取，但重取時間與節點暫存空間仍要管。ES索引也可能由來源重建，不能把「可重建」當C獨有；比較的是達成所需復原流程與持續責任。

C的主要成本假說為：減少獨立stateful搜尋服務管理，換取中央產製與應用內reader生命週期的維護。自動化不等於責任為零；例外事件頻率與處理難度才影響持續人工。以上拆解支持估工作與owner，不是已完成或工時估算。

後續研究可先將六包逐項標成沿用／適配／新增，找最大且能改變選型的未知再補最小證據。A同步方式及公司自動化另行核對，無資料就保留條件，不把它設成所有C盤點的阻塞。尚未承諾或啟動新的ES實驗、C正式化工程。
