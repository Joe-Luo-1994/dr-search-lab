# 實驗設計、結果與證據

這是研究審查包，不是正式環境驗收或已驗證的一鍵重現環境。歷史文件保留當時的建議，最新選型以主報告為準。所有數據是合成案例；正式 consumer、ReBAC、RTO 與 DevOps 工時仍未驗。

[最新選型報告](../discussion/README.md) · [下載後開啟 HTML 導覽](index.html) · [逐檔來源與公開副本 manifest](manifest.json)

每條結論依序檢查：問題與門檻 → 實驗設計 → 成功／失敗結果 → reviewer 限制 → 原始紀錄及當時程式。請不要只用通過數判斷方案。

## E1：搜尋、閱讀、下載與授權

先證明最小任務鏈；時間戳與身份 UI 補驗獨立列出。

[設計／門檻](docs/DR_E1_CARD_20261115.md) · [結果](docs/DR_E1_RESULT_20261115.md) · [Reviewer](docs/DR_E1_FOLLOWUP_REVIEW_20261115.md) · [紀錄入口](evidence/v1-e1-20261115/r2/summary.json) · [執行程式](scripts/v1-e1-20261115/run.mjs) · [補驗設計](docs/DR_E1_FOLLOWUP_CARD_20261115.md) · [補驗結果](docs/DR_E1_FOLLOWUP_RESULT_20261115.md)

## E2／遠端內容：更新與 MinIO 接縫

區分舊版內容、真正遠端讀取及故障後行為，不能拼成正式全流程驗收。

[設計／門檻](docs/DR_REMOTE_CONTENT_CARD_20261115.md) · [結果](docs/DR_REMOTE_CONTENT_RESULT_20261115.md) · [Reviewer](docs/DR_REMOTE_CONTENT_POSTRUN_REVIEW_20261115.md) · [紀錄入口](evidence/v1-remote-content-20261115/result.json) · [執行程式](scripts/v1-remote-content-20261115/run.mjs) · [E2設計](docs/DR_E2_CARD_20261115.md) · [E2結果](docs/DR_E2_RESULT_20261115.md)

## K1–K4：容量問題如何暴露

先看小型混合負載，再看百萬頁、Web 單獨搜尋與查詢成本；保留 smoke、失敗及停止原因。

[設計／門檻](docs/C_MILLION_PLAN_20261116.md) · [結果](docs/C_MILLION_RESULT_20261116.md) · [Reviewer](docs/C_MILLION_POSTREVIEW_20261116.md) · [紀錄入口](evidence/c-million-20261116/fallback-1/load/result.json) · [執行程式](scripts/c-million-20261116/environment.py) · [K1設計](docs/C_CAPACITY_PLAN_20261115.md) · [K1結果](docs/C_CAPACITY_RESULT_20261116.md) · [K3設計](docs/C_WEB_SEARCH_DESIGN_REVIEW_20261116.md) · [K3結果](docs/C_WEB_SEARCH_RESULT_20261116.md) · [K4設計](docs/C_QUERY_COST_DESIGN_REVIEW_20261116.md) · [K4結果](docs/C_QUERY_COST_RESULT_20261116.md)

## K5：擴容後通過哪個工作點

R1 更新時體驗未全過；R2 通過 6 search/s 混合工作點。不是最大 RPS，也不是相對完整 A 的成本勝出。

[設計／門檻](docs/C_SCALE_PLAN_20261116.md) · [結果](docs/C_SCALE_RESULT_20261116.md) · [Reviewer](docs/C_SCALE_POSTREVIEW_20261116.md) · [紀錄入口](evidence/c-scale-20261116/analysis.json) · [執行程式](scripts/c-scale-20261116/environment.py) · [當時執行版本與pin](frozen/provenance.json)

## O1：重啟與版本選擇

是另一套小型 runtime 的重啟證據，不能與 K5 合併宣稱完整生命週期已驗。

[設計／門檻](docs/C_RESTART_PLAN_20261116.md) · [結果](docs/C_RESTART_RESULT_20261116.md) · [Reviewer](docs/C_RESTART_POSTREVIEW_20261116.md) · [紀錄入口](evidence/c-restart-20261116/cases/bad-cached/result.json) · [執行程式](scripts/c-restart-20261116/environment.py)

## Pagefind：100k 建置與搜尋 gate

建置通過；第一個高命中查詢逾時，其餘案例未執行。保留舊小型成功及中文反例。

[設計／門檻](docs/PAGEFIND_NEXT_GATE_20261116.md) · [結果](docs/PAGEFIND_GATE_RESULT_20261116.md) · [Reviewer](docs/PAGEFIND_GATE_POSTREVIEW_20261116.md) · [紀錄入口](evidence/pagefind-gate-20261116/g1-verification.json) · [執行程式](scripts/pagefind-gate-20261116/environment.py) · [歷史成功與反例](docs/PAGEFIND_DECISION_REVIEW_20261115.md)

## Pagefind D1／D2：為何沒有繼續擴容

單題定位到同步 WASM 呼叫邊界，部分觀測窗約一核心；不是 RPS 測試或演算法根因。

[設計／門檻](docs/PAGEFIND_D2_PLAN_20261116.md) · [結果](docs/PAGEFIND_D2_RESULT_20261116.md) · [Reviewer](docs/PAGEFIND_D2_POSTREVIEW_20261116.md) · [紀錄入口](evidence/pagefind-d2-20261116/analysis.json) · [執行程式](scripts/pagefind-d2-20261116/environment.py) · [D1設計](docs/PAGEFIND_D1_PLAN_20261116.md) · [D1結果](docs/PAGEFIND_D1_RESULT_20261116.md) · [D1審查](docs/PAGEFIND_D1_POSTREVIEW_20261116.md)

## 維運與選型：為何先核對 A

把實驗觀察與決策分開；A 未量完整成本，B 不當 A，C 的條件式投入尚待團隊決定。

[設計／門檻](docs/DR_EXPERIMENT_PLAN_V1.md) · [結果](docs/DR_SELECTION_DELTA_20261116.md) · [Reviewer](docs/DR_SELECTION_DELTA_REVIEW_20261116.md) · [紀錄入口](docs/C_SCALE_OPERATIONS_LEDGER_20261116.md) · [執行程式](scripts/c-scale-20261116/environment.py)

## 如何讀完整紀錄

- `docs/`：實驗卡、設計審查、結果、事後 review、成本清單；歷史下一步可能已被後續決策取代。
- `scripts/`：當時工作區的 runner、fixture／oracle、控制器、分析與報告程式。
- `frozen/`：另從保留環境讀回的實作副本與來源清單；不能將最新工作區腳本當成每輪唯一執行版本。
- `evidence/`：保留原始成功及失敗 attempt、逐請求／資源／事件紀錄、保全雜湊與 UI 截圖。
- 400KB 以上文字以 `.gz` 無損壓縮；GitHub 點 Download 下載。`python verify.py` 檢查全部公開檔案；`python verify.py --extract` 另輸出到 `expanded/`，將 gzip 還原為原檔名，**不執行實驗或啟動服務**。

## 公開副本與重跑限制

個人環境路徑以 `/PUBLIC/...` 替換。manifest 分列原始 SHA、公開解壓 SHA、儲存檔 SHA；有替換的檔案不能聲稱與原始 bytes 相同。既有 freeze 文件內的 hash 仍描述原始執行，不因公開替換而改寫。沒有上傳私密設定、credentials、node_modules、資料庫、完整建置索引或大型語料。

這份材料支援審查設計、演算法與記錄；要重跑仍須重建合成資料／索引、取得依賴、設定路徑及隔離資源，並依每輪實驗卡確認限制。沒有重新跑壓測，也沒有驗證下載後一鍵重現。未收錄或失效的歷史連結列在 [來源缺口](LINK-GAPS.md)，不得視為已補證據。

正式資料、A 完整異地環境與公司維運人時仍未知；新增資料不使合成測試升格為正式驗收。
