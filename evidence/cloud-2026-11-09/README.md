# 真實雲端驗收 — 2026-11-09（Asia/Taipei）

本目錄為 Codex Cloud Linux x64 的實際執行證據；原始時間戳採 UTC，因此檔案內可見 2026-11-08。測試來源 commit 為 `6fca68f972e44f3242df936dc5ee39f89278ad02`。Node 22.21.1、ES 8.17.0、4 CPU quota、32 GiB memory limit。不是 Windows 歷史證據，也不是正式服務 DR 驗收。

## 通過項目

- `onboarding-install.log`：實際執行 `onboarding/install.sh`，33 tests passed，0 failed/skipped，Next.js production build 通過。
- `es-experiment-mw8h0cao.json`：官方 archive 經 SHA512 校驗；真實同主機雙 cluster，144 組契約、混版拒絕、快照、主站停止後還原、四組查詢 ID/order 比對、DR 重啟與索引保留全部通過。完整階段輸出在 `es-experiment-console.log`。
- `browser-smoke.json`：官方 Playwright Chromium，13 checks、4 real engines、elasticsearchVerified=true；涵蓋搜尋、閱讀、下載、Guest、fail-closed 與 session isolation。
- `observations.json`、`benchmark.json`：四引擎觀測及函式級 microbenchmark；不可當成 HTTP 吞吐量、生產容量或 RTO。

## 失敗與修正的保留

- `playwright-install-blocked.log` 保留真實 403 Domain forbidden 失敗。官方 cdn.playwright.dev 307 轉向 storage.googleapis.com，允許後重試成功，見 `playwright-install.log`。沒有繞過 proxy 或關閉 TLS 驗證。
- 初次 ES 下載也被 artifacts.elastic.co 的 CONNECT 403 拒絕；此項只在原對話保留輸出，未留下可回收的原始 log，因此不製造事後的失敗 log。允許後官方 archive 安裝成功，見 `es-setup.log`。
- `browser-smoke-initial-three-engines.json` 是 ES 尚未安裝時的局部成功，不是四引擎驗收。
- `cloud-preflight.json` 為較早階段報告；其中 browser pending 及 app port EADDRINUSE 不表示最終失敗。最終 browser 與 shutdown 報告提供後續狀態。
- 草稿工具持續 INVALID_ARGUMENT，無法確認 agent 保存 install_script/start_skill；使用者會從 UI 保存 `onboarding/install.sh` 與 `onboarding/start.md` 全文。

## 發布與可存取性

實際政策 revision 4 為 enforced，額外限定網域 artifacts.elastic.co、cdn.playwright.dev、storage.googleapis.com，加上 package manager preset，完整公網未開啟。僅本人存取為使用者回報的 UI 設定，agent 未另行驗證 viewer ACL。

平台回報 remote_desktop enabled=true、state=unknown，但本回合沒有 desktop js、open_in_codex 或 preview 工具，因此無法產生或驗證確切的私人 URL。可由產品側邊面板「＋ → Desktop」開啟共享桌面；使用者裝置實際可見仍未驗收。沒有公開部署。

`shutdown.json` 記錄核對本專案 PID 後，以 SIGTERM／專案 ES lifecycle script 乾淨停止 Next.js、DR；primary 在實驗中已停止。三個 port 3000、19200、19300 均 connection refused。資料、snapshot 與 `.lab/reports` 保留，供沒有進行中 ES 寫入的 filesystem snapshot。這是刻意的發布準備，不是移轉失敗。

Publish 與之後 resume／新任務還原仍待使用者操作及新對話驗證；不得由本次程序重啟通過推論平台持久性通過。下一任務依 `onboarding/start.md` 重啟 DR、Next.js 並再次要求四引擎 browser smoke。

## 分享範圍

僅提升明確 allowlist 的合成資料報告與文字 log，經憑證模式檢查；保留本機路徑、PID、測試時間等執行中繼資料。未加入 .env.local、cookie/session dumps、native binary、live ES data、snapshot payload 或平台憑證。`SHA256SUMS` 可檢查本目錄其餘檔案完整性；這不是簽章。
