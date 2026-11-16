# E1-F1：時間戳與身份 UI 最小補驗

目的：V6/V7；只決定 E1 能否有限結案。原 r1/r2 及 120 個凍結檔保留，沒有 E2、搜尋品質重跑、PDF/Tags 重測或產品修改。

## 固定範圍

- 沿用 Windows Node22.21.1、原 Next production build、C SQLite 和 37 頁合成快照；B/C 共用 API 授權及 UI 程式。ES 不啟動。共享路徑代表性不延伸成新的 B provider 驗收。
- 先做 100 次同程序 Date.now → new Date ISO → Date.now 夾測，再做 100 次序列純 Node IPC clock probe，父子分別記 Date.now、new Date、performance 及 hrtime。只判斷原跨程序嚴格 wall-clock 包含關係是否可靠，不以事後容差更改 r2；不直接比較兩程序 performance.now。
- C HTTP：固定 b 身份，baseline → revoked-b → baseline，各一次 b-roles 正文及一次 Quartz 搜尋，共 6 次。檢查 200/404/200、搜尋有/無/有目標、no-store、時間格式；時間包含關係另列診斷，不自動視為功能通過。
- Reviewer 要求保留原服務不插樁：只記實際回應 authorizationCheckedAt、client wall/monotonic 時鐘及關聯 ID。Server 內部 Role 讀取時間未知，源碼 await 順序與實際撤權/恢復行為分開列證；不推導跨主機時鐘同步或真 ReBAC 撤權 SLA。
- UI 先存 DOM label 與實際 AX tree，記原 exact label locator 數量；再以觀察到的唯一 identity combobox 語意 locator 操作。375px：a 搜尋 relay、開一正文、切 none（正文及舊結果清空）、none 搜尋空結果、unknown 搜尋顯示權限未知且沒有結果。1280px：切回 a 搜尋 relay、有 10 筆、沒有橫向溢出、切 none 清空。另一個受控延遲搜尋在切身份後回傳，確認舊結果不重現；此延遲是測試注入，不算真網路壓測。

## 判讀與保全

- 未先驗證 DOM/AX，不宣稱是 locator bug。UI 成功須可操作、錯誤語意正確、舊結果不顯示、無 pageerror；保留 desktop/error 截圖，agent 檢查不當真人驗收。
- 時鐘若不能定位，記未解；可另由 reviewer 評估是否以因果序列/當次 Role 讀取證據替代不成立的跨程序毫秒不變量。不能將 r2 改成通過，不能任意加 ± 容差。
- 成功標準是這兩個缺口有可追溯證據、原檔未變且 reviewer 明示有限範圍；未知即保留，不自動重跑。
- 新腳本 `scripts/v1-e1-followup-20261115/`、新證據 `evidence/v1-e1-followup-20261115/`。執行前固化新腳本 SHA256；前後核原 120 hashes，Role finally 復原 baseline；只停自己啟動的服務及 browser。已有占用則停止。
- 一次 clock probe；一次預備 DOM 觀察；一次正式補驗。每 fetch 5 秒、UI 動作 5 秒、整輪 180 秒 watchdog；失敗保存，不自動重試。新證據 50MiB 上限、可用磁碟至少 10GiB、可用 RAM 至少 2GiB；無硬 CPU/RAM quota，不當容量測試。禁止並行負載、安裝、舊索引改動。
- 主 agent 實作/執行，既有 reviewer 審卡及事後原始證據；token/金額未知，記可得 elapsed。下一步只提案，不執行 E2。

## 執行前已觀察的環境差異與唯一追加

首輪 probe 在 Codex sandbox 執行；同程序 100 次及 child 100 次正常，IPC 99/100 不符合，child 比 parent 開始早約 9–10ms。這不是原 r2 超後的同方向重現。Reviewer 同意另做一次正常程序權限環境的 100＋100 對照，使用相同 Node 與 probe，僅輸出目錄不同；無論結果如何停止。原 probe 保留，沒有覆蓋或挑選成功樣本。

UI 預備觀察先遇 sandbox Edge 啟動拒絕，再遇正常 browser 無法連 sandbox server。已停本次 sandbox server，改正常服務 PID23416；另一次啟動曾因 PID20288 尚存而 EADDRINUSE，未執行案例。這些是環境準備失敗，非功能矩陣重跑。正常環境 DOM/AX 觀察成功：AX name=研究身份；exact label count=0，role locator 唯一。正式使用 getByRole('combobox', {name:'研究身份', exact:true})。

延遲回應案例會先取得真 C 成功回應，再切 none，釋放 response 並等 route 完成/取消事件收尾後檢查；它驗的是舊身份回應隔離，不宣稱真網路長時行為。原服務無插樁。
