使用 /workspace/dr-search-lab 現有 checkout；每個雲端任務已隔離，除非使用者明確要求，勿建立 Git worktree。
先執行：
export PATH=/workspace/toolchains/node-v22.21.1-linux-x64/bin:$PATH
export PLAYWRIGHT_BROWSERS_PATH=/workspace/playwright-browsers
cd /workspace/dr-search-lab

確認 .env.local、.lab/data/manifest.json、.next/BUILD_ID 與 .lab/reports/es-experiment-latest.json 存在；報告必須 passed=true，且 .env.local 的 LAB_INDEX_PREFIX 必須與報告 prefix 相符。
執行 node scripts/es-control.mjs status dr；若 DR 未啟動，執行 node scripts/es-control.mjs start dr，等待最多 120 秒並重試 status dr，直到核對 node/PID 成功。若已有程序卻不 ready，先診斷 logs，不重複啟動。
停止 ES 時使用專案 es-control stop；若沙箱阻擋 /proc 身分核對，透過標準權限升級在沙箱外重試相同核對與停止指令，不略過 PID、Java 路徑及 ES_PATH_CONF 檢查。發布前已乾淨停止 Next.js 與兩個 ES endpoint；新任務必須重新啟動服務。
在持續執行的終端啟動 npm run start。以 curl -fsS http://127.0.0.1:3000/api/lab/status 驗證，再執行 npm run test:browser；要求 13 checks、engineCount=4、elasticsearchVerified=true。瀏覽器測試也驗證搜尋、閱讀、下載與拒絕授權。
缺少工具、資料、build 或成功 ES 報告時，先停止本專案 Next.js，執行 bash onboarding/install.sh；依 docs/CLOUD_MIGRATION.md 診斷失敗，不覆寫既有 .env.local、不在 server 運行時重建 fixture、不擅自更換 prefix。
檔案與依賴可由快照保存；Next.js、ES 程序與 session 不保證保留。僅使用既有 proxy/TLS 信任與官方來源，不公開服務。所需額外網域為 artifacts.elastic.co、cdn.playwright.dev、storage.googleapis.com，另保留 package manager preset。
2026-11-09 新任務驗收：快照檔案保留且修復後啟動通過；第一輪 Lucene lock creationTime／overlay copy-up 失敗已保存於 evidence/cloud-published-acceptance-2026-11-09/。若重現，先保存 log、確認 ES 完全離線，再僅將既有零位元組 lock 檔 touch 實體化後重試；不可對運行中的 ES 操作 lock。詳見 docs/CLOUD_MIGRATION.md。目前仍未驗證下一次快照無介入啟動，以及使用者裝置的 Desktop viewer／private preview。
