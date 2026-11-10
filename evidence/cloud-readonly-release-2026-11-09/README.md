# 雲端唯讀資料包重播

雲端 Linux 重播實測：36 tests（無 skip）、17 組整合檢查、128 組搜尋比對、417 次閱讀、425 次下載通過；本輪無執行失敗，故障注入拒絕理由在 result.json。既有 127 個 fixture/build/report 檔案 hash 未變；.env.local 未修改，DR 已 ready，未重啟／重建索引。來源安全 fast-forward 至 80a71ed，work/ 未提交工作保留。證據：evidence/cloud-readonly-release-2026-11-09/。這是合成資料契約的雲端證據，正式 API、MinIO、HTTP consumer、發布原子性及總成本仍未知。下一輪卡：docs/MINIO_RELEASE_EXPERIMENT.md（待驗證；本輪未執行 MinIO）。
