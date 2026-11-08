# 第一階段驗證紀錄

## 2026-11-09：保留 ES 主案實測

詳見 `ES_EXPERIMENT.md`。單元／契約測試增至 **33/33**；ES 真實整合完成主站與 DR 的兩版本共 **144 組**集合比對、混版拒絕、主站停止、snapshot restore、結果排序比對及 DR 再重啟。production build 與 **13 類／4 引擎** browser smoke 重跑通過。

成功報告為 `.lab/reports/es-experiment-mw8ey9hm.json`。前一 run 的程序 PID 保護檢查拒絕停止主站，該失敗報告也保留；修改為核對 live node identity 與 executable 後才成功。沒有略過保護檢查或把失敗記成通過。

此輪仍未測公司正式資料／API、MinIO、跨區、正式 ReBAC、故障判定／DNS／登入及完整切回。下面歷史紀錄不改寫。

## 2026-11-09：補強防漏驗證

新增 `docs/VERIFICATION_PLAN.md`，以 F01..C01 對應主張、測試／演練／審查、證據範圍與決策影響。原第一階段紀錄保留於下方，不代表本輪重新執行所有瀏覽器或建置檢查。

新增 `tests/coverage.test.mjs`：三引擎各執行 4 種角色 × 3 種 Space 範圍 × 3 組 Tags，共 108 組純篩選完整集合比對（每組遍歷分頁、檢查總數、無重複及超出尾頁）；另測 ReBAC 故障時的閱讀／下載，以及 V2 已變更歸屬的直接 ID 存取。

首次執行：26/27 通過，Orama 的 Alice 純篩選結果為 38，fixture 預期 39。檢查固定版本 3.1.18 的 `search-fulltext.js`，發現指定 properties 會讓空 term 仍走文字索引路徑。修正 adapter：純篩選時不傳文字 properties，使用 where-only 路徑。此修正只適用 Demo 的空白 keyword 約定，未替正式產品定義規格。

修正後執行 `node --test --test-concurrency=1 --test-reporter=spec tests/*.test.mjs`：**27/27 通過**，使用原本 v1 100 篇／v2 101 篇的本地合成資料。未重新執行 production build、browser smoke 或外部服務整合；既有運行中的 production build 需重新建置啟動才會帶入 adapter 修正。

這證明新增測試補到一個實際缺口，不證明正式 API、完整生命週期或所有漏項都已覆蓋。

## 原第一階段紀錄

環境：Windows、Node.js 22.21.1，Next.js 16.4.5，MiniSearch 7.2.0，Orama 3.1.18，SQLite 使用 Node 內建 FTS5。版本以 package-lock.json 為準。

## 已取得證據

- `npm test`：22 項契約測試通過。
- `npm run build`：Next.js production build 通過。
- `node scripts/browser-smoke.mjs`：13 類端到端檢查通過，包括三引擎結果、Tags AND、閱讀、下載、錯誤 Media 拒絕、JSON 匯出、Guest 拒絕、發布失敗保持舊版、V2 發布、ReBAC 503、會話隔離、手機無水平溢出、無 browser pageerror。
- `docker compose config --quiet`：設定語法通過；不代表服務已運行。
- 三個獨立子程序 microbenchmark 與八組搜尋情境已輸出 JSON。
- 桌面與手機截圖已產生並目視檢查。

## 初步觀察：只適用這份合成 fixture

Alice，V1，100 篇，Title/正文模式：

| 查詢 | SQLite | MiniSearch | Orama |
|---|---:|---:|---:|
| disaster recovery | 33 | 33 | 33 |
| 資料庫備份 | 1 | 1 | 0 |
| backup + ops + database/runbook 全部符合 | 17 | 17 | 17 |
| bakcup（未特別調整容錯） | 0 | 0 | 0 |
| ERR_CONN_RESET | 1 | 1 | 1 |
| quartzfalcon（含附件） | 1 | 1 | 1 |

同筆數不等於同排序。例如 Tags 案例 Orama 首筆是 p10，SQLite／MiniSearch 首筆是 p01。中文結果反映目前預設 tokenizer／設定，不是引擎中文能力的最終判決。

## 報告位置

- `.lab/reports/observations.json`：查詢結果、top5 與資料 manifest。
- `.lab/reports/benchmark.json`：小樣本函式級耗時、程序 RSS；不代表容量、HTTP 吞吐量或 RTO。
- `.lab/reports/browser-smoke.json`：端到端檢查清單。
- `.lab/reports/browser-observation.json`：由 UI 下載的實際比較結果。
- `.lab/reports/desktop.png`、`mobile.png`：畫面截圖。
- `.lab/reports/media-download.txt`：經授權後實際下載的合成 Media。

## 尚未取得證據

本機 Docker daemon 尚未運行，因此三個外部服務只有 adapter／provision／Compose，沒有真實服務端整合結果。Pagefind 尚未實作。MinIO、公司 ReBAC、正式登入、真實 ES 設定、跨區傳輸、DNS／consumer 切換、多副本與長時間負載未驗證。

以上項目在介面與文件明確列為未驗證，不以 embedded 引擎測試替代。
