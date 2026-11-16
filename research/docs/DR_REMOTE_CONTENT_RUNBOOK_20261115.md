# 遠端內容補驗：本輪操作入口

這是合成研究操作說明，不是公司值班手冊或已驗收RTO。執行前先讀執行卡／preflight最新裁定；所有命令在 Windows repo 根目錄，Node 22.21.1。不要直接重跑已存在的 create-only 產物或凍結實驗。失敗保留，變更須依卡裁定。

## 依賴與責任

- Next：Windows 3162／3163，隔離錯件reader 3165，手動路由fixture 3164，空cache拒啟候選3166。
- MinIO：WSL Ubuntu既有研究binary，19440 API；19441 console（browser off）。只有本輪 `minio-data` store，沒有公司bucket或共享服務。
- 私有設定：`.lab/v1-remote-content-20261115/private-config.json`；短期合成credentials只用於此實驗，不放repo／證據／命令列。實驗Next使用root測試credential，不代表正式IAM最小權限已設計或接受。
- 本地cache：每版manifest、SQLite、search-text及receipt。search-text及FTS仍含搜尋文字，沒有可供閱讀API降級使用的正文／PDF檔；不能以檔案數宣稱節省多少。
- 遠端：版本／hash命名正文JSON和PDF，另有本地索引artifact。這是應用命名與SHA檢查，沒有Object Lock；錯件候選故意違反expected hash。

## 一次準備與執行順序

主agent協調：`freeze.mjs init`只初始化本輪私有設定與舊檔保全；先完成卡／oracle／實作靜態審查，再`freeze.mjs source`。`prepare.mjs`產隔離版本與物件，`audit-prepared.mjs`獨立對照oracle，`build.mjs`只建一次production app。上述皆位於`scripts/v1-remote-content-20261115/`。

MinIO啟停由 `wsl.exe -d Ubuntu -- python3 '/PUBLIC/WINDOWS_WORKSPACE/scripts/v1-remote-content-20261115/minio-service.py' start|status|stop`；helper只管理同binary＋同store的程序。保存binary SHA與版本，先核19440／19441無占用，ready health需Windows可達。服務與資料都不公開。

設本shell環境 `REMOTE_CONFIG_PATH` 為上述config的絕對路徑，`REMOTE_IO_LOG` 為本輪證據的`publication-io.jsonl`，執行`publish-install.mjs publish`。每來源物件PUT後以GET驗SHA；正常release的manifest／commit最後寫。安裝器以受信任的本地publication receipt傳遞manifest SHA/key（不把可變object metadata當信任來源）；**未驗證遠端commit發現／災後遺失本地receipt重建／跨區複製發布交易**。保存這個部署輸入是新增責任。

產物及binary／程式／oracle／build讀回核對，獨立reviewer關閉preflight缺口後`freeze.mjs formal`。執行唯一`run.mjs`，它自行安裝、啟reader、切fixture入口、跑R1–R3、最後關閉自己的服務；不需手動在關卡間改產品。正式I/O另存`remote-io.jsonl`，不可與publisher校驗流量合成一次閱讀成本。

## 故障辨識與限制

- `CONTENT_INTEGRITY_MISMATCH`：真的取到資料但驗證失敗；拒絕交付，查release描述與object身份，不自動跳過hash。
- `CONTENT_UNAVAILABLE`／`MEDIA_UNAVAILABLE`：正文／附件依賴不可用；已裝索引可繼續搜尋，Web提供明確重試。搜尋存活不代表整個DR任務可用。
- `ARTIFACT_UNAVAILABLE`：空cache無法下載索引；不啟ready，不能以已有reader狀態冒充新Pod恢復成功。
- `VERSION_MISMATCH`：使用原契約明示重搜，不默默去掉版本參數。
- `AUTHORIZATION_UNKNOWN`：拒絕交付；本輪身份仍是可控mock header/profile，不是正式登入／ReBAC整合。

每物件最多1MiB，完整收齊驗證後才回應；正式大PDF、Range、串流與併發記憶體負擔未驗。新舊遠端物件須保留到舊reader退役，本輪只驗保留，不做GC。停機只覆蓋這座本機MinIO程序，不代表異地HA或fz1／fz2故障演練。資源按關卡抽樣Windows程序working set及WSL MinIO RSS；OS cache／WSL VM總量未分攤，不是Pod容量建議。

本輪主agent操作，沒有新增非作者接手或真人可理解性驗收。記錄新增操作責任與實際失敗，不能因此推論比沿用整套A或保留ES的B更省工。
