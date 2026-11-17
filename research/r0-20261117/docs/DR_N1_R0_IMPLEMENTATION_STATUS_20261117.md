# R0 最小實作進度（未部署）

## 最新：安裝器、部署草稿與HTTP生命週期已離線實作

- `installer.mjs`：釘選manifest SHA／release／Node+ICU；串流寫part、size/hash、原lineage驗證；通過後才發布config。CLI60秒硬截止，首次錯誤檔不被重試覆蓋，失敗staging須換Pod。remoteObjects僅結構驗證，正式完整發布仍由publisher與oracle驗收。
- `server.mjs`：啟動／readiness與live分開；SIGTERM停止准入、10秒在途排空、15秒硬退出、顯式worker close。新增service init/health/close出口，2+2/pool本體不變。
- `deployment.py`：只產生JSON、不apply；images必須digest pinned、專用namespace、init container、Secret引用、emptyDir、app及MinIO限額。progress120秒保留，installer60＋startup40＋minReady5，其餘15秒僅剩餘預算，不保證足夠。
- MinIO emptyDir是可重建lab fixture，不能宣稱遠端持久來源故障復原；poolfatal仍需operator重建Pod，未新增supervisor。

Linux Node22.18.0離線測試TAP 8/8過，證據 `evidence/r0-release-20261117/offline-adapter/tests.tap`。HTTP/SIGTERM測試使用stub Next/runtime，驗在途回應完成與close呼叫；不是實際Next/Rust子程序回收證據。安裝測試是合成bytes與記憶體response，非MinIO整合。

獨立review見 DR_N1_R0_IMPLEMENTATION_REVIEW_20261117.md：上述預算收斂／首因保留／scope可接受，允許繼續離線整合，不放行正式R0。接下來需要真image、真release fixture與oracle、installer／雙reader容量及Kubernetes部署驗證。沒有新增常駐服務，沒有push。

以下保留先前增量歷史，不代表最新缺項清單。

Reviewer後修訂：明確允許本實驗v1/v2/v3且都需等於RELEASE_ID，避免壞V3先被版本白名單擋住而無法驗hash拒絕。新增第六情境：釘選v3後仍需來源版本綁定（v2來源必須拒絕），修前測試失敗、修後1組6情境通過。這不是實際V3 hash故障注入。下方v1/v2敘述是初版範圍，以上修訂優先。

空載環境084246經獨立review通過，可開始離線最小實作。研究app／MinIO／發布實驗尚未啟動。

已完成第一部分：`scripts/r0-release-20261117/prepare_runtime.py` 從凍結N1建立獨立runtime副本，原始檔未改；source/adapter SHA見同目錄runtime-receipt.json。只有service/preloaded有邏輯變更：Tantivy允許v1/v2但必須等於環境RELEASE_ID；status對fatal/closed回503；成功初始化後回應附release/pod識別。pool、worker、storage維持原bytes；2+2、E、queue、deadline及全pool失效策略未改。

驗證：Node --check service/preloaded成功；`node --test scripts/r0-release-20261117/runtime-contract.test.mjs` 1組測試通過，含一致v2、錯pin、同長度內容hash損毀、來源版本不符、額外未列index檔五種情境。測試檔是合成bytes，非真SQLite或Tantivy索引；只驗預載validator，不證worker啟動／搜尋／探針／MinIO相容。status503尚未以實際worker故障注入測試。

尚缺：installer與完整release manifest、部署與probe設定、終止排空、V2可識別內容與oracle、受控安裝／雙reader／MinIO容量門。這些未完成前不能開始R0發布實驗。空載cluster已停止，無新增常駐服務；尚未push。
