# 已發布環境的啟動

使用現有 `/workspace/dr-search-lab` checkout；每個雲端任務已隔離，除非明確要求，不建立 Git worktree。不要把重新安裝或重建資料當作啟動修復。

```bash
export PATH=/workspace/toolchains/node-v22.21.1-linux-x64/bin:$PATH
export PLAYWRIGHT_BROWSERS_PATH=/workspace/playwright-browsers
cd /workspace/dr-search-lab
```

1. 確認 `.env.local`、`.lab/data/manifest.json`、`.next/BUILD_ID`、`.lab/reports/es-experiment-latest.json` 保留；ES report 必須 `passed=true`，且 prefix 與 `.env.local` 的 `LAB_INDEX_PREFIX` 相同。缺檔或不符時停止並回報，勿重建 fixture、換 prefix 或重跑實驗掩蓋問題。
2. 執行 `node scripts/es-control.mjs status dr`。若未 ready，執行 **`node scripts/es-control.mjs start dr`**；這個正常入口會序列化啟動、核對 PID／同 instance 程序／HTTP 和 transport port／POSIX locks，並僅實體化 data 內既有 regular zero-byte `node.lock`、`write.lock`。不手動 touch、不刪 lock、不略過檢查。活躍、競爭或狀態不明時會拒絕；先保存原因與 log。殘留 PID 僅在 `/proc` 明確顯示 zombie（Z）或 PID 已不存在時可繼續其他離線檢查，不刪除 PID 或 lock 來繞過判定。
3. 若拒絕原因為沙箱無法讀取 `/proc`，使用平台標準權限升級，在沙箱外執行**同一個** start／stop 指令；升級不是手動修補 lock，不能移除防護。需要 Linux Python 3（標準庫）及可讀同使用者程序的執行權限。等待最多 120 秒並以 `status dr` 確認節點名稱與 PID；逾時保留 log，勿盲目重啟。
4. 執行下列四組封存索引檢查，既有內容 digest／write block 必須通過：

   ```bash
   node --env-file=.env.local --input-type=module -e 'const {verifyElasticRelease}=await import("./lib/es-release.mjs"); for(const v of ["v1","v2"])for(const a of [false,true])console.log(await verifyElasticRelease(v,a));'
   ```

   再在持續執行終端啟動 `npm run start`，以 `/api/lab/status` 驗證，執行 `npm run test:browser`；要求 13 checks、`engineCount=4`、`elasticsearchVerified=true`。ES 啟動也應使用可維持存活的執行終端；不要把一次 daemon launcher 成功推論為平台會保留背景程序。
5. 停止僅限本 executor、本 checkout 的程序。Next.js 先核對 PID、cwd 與 pinned Node 路徑後 SIGTERM；ES 使用 `node scripts/es-control.mjs stop dr` 核對身分後 TERM。發布前確認 3000、19200、19300 都無服務、ES log 有 `closed`；資料與 reports 保留。不要停止其他對話／executor 的服務。

日常回歸：`npm test`（既有 33 tests）；Linux 啟動防護：`python3 tests/es-start-linux.py`（需要相同 `/proc` 讀取權限）。不以單元 fixture 測試推論下一次發布快照已通過。下一個發布版本仍須新一般雲端對話在不手動修補 lock 的情況下重新驗收。

已知邊界：啟動 guard 只序列化這個正常入口；不要直接執行 bundled Java／Elasticsearch 繞過入口。此工具是單一使用者研究環境的防誤操作機制，不是抵抗特權程序同時移動檔案或自行啟動 Java 的安全邊界。程序、session 不保證由快照保留。私人 viewer／preview 仍受平台交接工具／網站 UI 限制，沒有已驗證的使用者互動入口；不公開部署、不建立 tunnel、不將雲端 localhost 提供為使用者裝置連結。詳見 `docs/CLOUD_MIGRATION.md`。
