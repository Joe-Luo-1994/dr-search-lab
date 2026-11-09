# 正常啟動流程固化 — 2026-11-09（Asia/Taipei）

本輪位於設定草稿 executor `ccarenv_b64_Y2NhcmVudl9kZTQzMmU5NDU5MDA4MTkxODBjNmE2YWRlZjI4MDIyMg`，與已驗收一般對話的 executor 不同。ff-only 更新至 `7de737e` 後實作；沒有操作其他對話的服務、重建 fixture、重跑 ES snapshot 實驗或手動 touch lock。這些檢查不是下一次發布快照的保證。

## 實作與拒絕條件

`scripts/es-native.sh start` 委派 `scripts/es-start.py`（Linux 64-bit、Python 3 標準庫）。在 instance data 外的 `.start.guard` 使用 flock，直到 launcher 回傳 recorded PID，序列化正常入口的並行啟動。先驗 recorded PID、同使用者同 instance 程序、HTTP/transport port，再以不跟隨 symlink 的 dirfd traversal 檢查 data。所有候選先以唯讀 fd 查詢 POSIX F_GETLK（含共享鎖）、取得共享 record lock，完整驗證後才開可寫 fd 及升級獨占 record lock；只對既有 regular zero-byte、single-link `node.lock`／`write.lock` 更新 metadata/fsync。沒有新建／刪除 lock、寫入 payload、刪索引或替換資料。

無法讀取 `/proc`、PID 檔不合規、活躍 PID／instance 程序、port 已綁定、held POSIX lock、symlink、非零檔及 hardlink 都拒絕。PID 已不存在可繼續其他檢查；若 `/proc/<pid>/stat` 明確為 zombie（Z），記錄後仍檢查程序／port／lock，不以連線失敗推論離線。標準沙箱可能無權讀 `/proc`，須透過正常權限升級執行相同入口，不能略過防護。

guard 是合作式啟動入口的互斥，不是抵抗特權程序直接啟動 Java、移動檔案或修改設定的安全邊界。POSIX locks 與 flock 不同；不能用只測 flock 的 fixture 宣稱已驗證 Lucene record lock。

## 驗證證據

- `linux-tests.log`：14 項 Linux 測試通過。涵蓋離線處理與重複處理、索引 bytes/hash 與 lock inode 保留、共享／獨占 held lock、active PID／同 instance 程序、未知權限、無回應 listener、並行啟動 guard 及 launcher 期間互斥、PID 非 regular／symlink／無效值、data symlink、非零檔、hardlink、明確 zombie 仍不能忽略活躍 port。
- `node-tests.log`：既有 33 tests 全通過，0 failed/skipped。
- `start-dr.log`：初次正常入口自動處理七個既有 zero-byte lock，DR 啟動成功；`start-sandbox-refusal.log` 保存沙箱權限不足的 fail-closed 拒絕。
- `repeat-start-refusal.log`：對當時活躍 DR 再次 start，recorded PID 阻擋啟動。
- `start-final.log`、`status-dr-final.log`：最終實作經正常入口啟動與節點/PID 核對。`restart-stop-final.log` 為上一個 DR 的乾淨停止。
- `elastic-release-final.json`：四組 `verifyElasticRelease` 與上一輪 `elastic-release-retry.json` 完全一致，包括 count/digest/writeBlocked；保留 cluster UUID `4wnGrk8jSc6jPCnXiE4r9Q`。
- `browser-smoke.json`、`browser-final.log`：13 checks，4 engines，elasticsearchVerified=true。
- `summary.json`：19 個 fixture/config/build/report/lockfile 的原始 hash 比對均未變；僅保存布林結果，沒有環境檔內容或憑證。新 helper／shell／tests 的 source hashes 可核對本次實作。
- `shutdown.json` 與 shutdown logs：驗收後核對本草稿 PID、TERM、ES closed、三個 endpoint connection refused；保留 data、snapshots 及 reports，供發布一致 filesystem。

## 中途異常（不隱藏）

初次通過四組 release 與 browser 後，複核發現 PID 2762 變成 zombie、19300 關閉；該程序 log 沒有正常 shutdown 訊息。停止入口因端點不可用而拒絕；沒有強殺或刪 PID/lock。`/proc/2762/stat` 明確為 Z，`/proc/2762/exe` 已不存在，cgroup memory.events 的 oom/oom_kill 為 0。無信號來源紀錄，不能判定由哪個外部因素造成，也不能宣稱是 Lucene 或平台問題。相關觀察來自本回合工具輸出，未製造事後的原始錯誤 log。

後續將 launcher 放入獨立 session，並在驗收期間維持執行終端；`restart-dr.log` 保存明確 zombie 被辨識後仍重新檢查完整離線條件，再處理七個既有 lock 的過程。之後的正常停止、最終啟動、release/browser 及最終乾淨停止均有獨立證據。這不保證平台跨任務保留任何程序；新任務必須重新啟動服務。

## UI 設定及待驗收

啟動說明唯一版本為 `onboarding/start.md`。UI start skill 請保存 `onboarding/start-skill.txt` 的一行原文；install script 不需加入臨時 lock 修復。agent 未自行發布環境。

下一步由使用者在 UI 保存並發布，再以新一般雲端對話驗證：不手動 touch、不重建資料，正常 start 通過四組 release 與四引擎 browser。此項目前 **pending**。私人 viewer／preview 仍未打通，本輪未重試交接、未建立 tunnel、未公開部署；以歷史 `handoff-followup/` 更正為準。

本目錄只提升選定的合成報告及程序 log，不含 `.env.local`、native binaries、live data、snapshot payload 或憑證。`SHA256SUMS` 涵蓋本目錄其餘檔案；不是簽章。
