# K3：一般 Web 搜尋與獨立閱讀的設計審查

2026-11-16，獨立 reviewer；本文件只審設計，未啟服務或負載。沿用使用者最新決策：先回答沒有 API consumer 時，一般 Web 搜尋是否仍影響 Web 閱讀；暫緩 K2 提議的 reader 4→8GiB 更新補驗。

## 裁定與新增價值

**有條件通過最小設計，可準備；正式負載仍須新 runner、fresh-ready 實際限額與事前 freeze 通過。** K2 已證共享 pool 下搜尋會排擠 SSR，但其 Web 搜尋只用 rare／published-marker，九種搜尋形狀由 consumer 送出。K3 能補的是「SSR 開頁後執行一般搜尋，另有獨立閱讀持續到達」這種任務組合的可承受範圍。不能把 caller／lane 換名當成性能改善，也不重做引擎功能品質或推論真實使用率。

已核凍結的 `scripts/c-million-20261116/pages/docs/[id].js`：頁面只有 keyword 輸入，fetch 固定 `all` 身份，沒有 Space／Tags／身份控制。九 shape 可以保留作 **Web 所需的合成伺服器搜尋任務**，保持來源 oracle 與重查詢覆蓋；其中篩選及受限身份的 HTTP 模擬不等於已有可操作 Web UI。SSR→JSON 結果驗證也不是 DOM 可見完成時間。報告必須把這兩層分開。

## 最小執行卡

- **固定輸入與資源：** K2 凍結 runtime／build、百萬頁 V1 DB、來源 predicate oracle；reader 2 CPU／4GiB／swap0、兩 workers 與共享 pool；MinIO 4 CPU／4GiB／swap0。沿用原 timeout／SQL／cache 參數。獨立 K3 runtime、cache、ports 3176／19660／19661、units `dr-web-*`、runner 與 evidence；重用既有 MinIO artifacts，記錄實際共用或複製方式，不重建資料。K2 輸入事前／事後 hash 相同。
- **就緒：** fresh V1 下載、驗 hash、pool ready，實際 cgroup hard limits 與 swap 讀回；失敗保留原狀，不改參數救測試。冷啟動成本另記，不混入穩態 P95；也不稱宿主／MinIO cache 是冷的。
- **Baseline：** 獨立閱讀 SSR 1 次／秒、30 秒，驗已發布正文、頁身份與 V1。P95 **≤500ms**、失敗 **≤1%** 才可升階。Baseline 不只是可計算 reference；若它本身過慢，不讓後續相對門檻替不良起點開脫。
- **三階搜尋：** 搜尋 journey 固定 open-loop 1、2、4 次／秒，每階 30 秒；每個 journey 真 SSR 開已發布合法頁 → 九 query shape 等量輪替 → 完整結果回應與 oracle 校驗。同時獨立閱讀保持 SSR 1 次／秒。兩者有各自排程與併發記錄，不能等上一任務完成才安排下一筆。無 consumer lane、bulk 或 update。
- **搜尋範圍：** 驗 total、eligible Top10、canonical URL／snapshot、Space／Tags／title／snippet 等既有來源義務，不依引擎輸出產期望。合法空結果不得當失敗。不點未發布的長尾正文，明示本輪不是搜尋後任意文件閱讀閉包；閱讀 lane 只代表既有發布 hotset。
- **階段門檻：** 搜尋 journey 從原定到達至完整結果 P95 ≤2 秒；閱讀 P95 ≤max(2×合格 baseline P95,500ms)；兩 lane 失敗各 ≤1%。第一個不合格階停止升階，不再試更高率或自動降回補跑。30 筆閱讀樣本下單筆失敗已超1%，如實保留離散樣本效果。
- **停止與期限：** 沿用 query 從 admission 起 4 秒、既有 HTTP deadline；新 runner 全程300秒、drain16秒與共用 abort。錯資料／錯身份／錯版是正確性停止；worker timeout、OOM 等依明確規則作容量停止；未知 transport／service failure 留未分類，不猜 CPU 根因。任何部分中止均不得判整階合格。

實際表單仍需低頻 browser smoke 確認開頁、輸入一般詞、送出並看到結果，以及無結果時的實際畫面；可用已取得且適用的證據，不要求在各階重跑 browser。這只證現有 keyword 流程可操作，正式計時仍是 HTTP 伺服器任務，不是 browser 渲染／互動 SLO；缺少 filter 控制與清楚空結果提示若仍存在，保留限制，不改凍結產品來補驗。

## 統計與結論邊界

每 lane 分列 planned／sent／fulfilled／失敗／missed／停止後未送取消，保留原定排程、實送與完成時間；未送項保留在任務完成分母，不把零長度占位算延遲。保留 SSR 與 search 子步時間和關聯 ID，總 journey P95 不混入獨立閱讀。報出每 query shape 樣本數及延遲；低率30秒各形狀僅約3–4筆，不能給它們正式 P95 SLO 意義，也不能讓整體 P95 掩蓋必要查詢的慢例。

同時保留 reader／MinIO cgroup CPU、memory.current／peak、max／OOM events、pool queue／run／op／lane、event-loop 與停止原因；MinIO有較大配額不代表已證非瓶頸。讀回來源與 hash、cleanup 都屬結案要求。K2 與 K3 負載組成、cache／順序不同，不能用 P95 差異作純 caller 因果比較。

若最低搜尋階即不合格，已足以支持「沒有獨立 API consumer 也可能有 Web 搜尋／閱讀競爭」，不必擴測湊上限。若全部通過，只能稱在本次九形狀等權、閱讀 hotset、短窗合成組合中最高已測4次搜尋／秒合格，不能稱容量上限或公司使用情境安全。未驗正式 ReBAC、正式搜尋品質、完整 filter UI、真人體驗、真實流量分布及 A／B 成本。更新未完成仍是 K2 保留問題，本輪不解決，也不再授權 8GiB 或新的備案。

## 新 runner 靜態複核

已讀 `scripts/c-web-search-20261116/load.mjs`、`environment.py` 及 `scripts/c-web-search-report-20261116/browser-smoke.mjs`，未執行。Runner 的雙 lane、baseline500ms、完整 SSR／search 校驗、九形狀來源 predicate、canonical hit URL、首不合不升階、300秒共用 abort 與16秒 drain 符合本卡，無新增邏輯阻擋。五種 text query 的 browser smoke 保留空結果與真正畫面更新檢查，仍只作正式前操作證據並明示暖 cache。

正式前有一項保全條件待關閉：native K3 runner 實際 import 相鄰 `scripts/c-million-20261116/load.mjs` 的 `summarize`，須將該**實際路徑**與 `source.mjs` 納入 freeze，並核同 K2 原凍結版本；原 `project/load.mjs` 的另一份拷貝不能代替。對沿用的 K2 source／build／DB 也須比較原 SHA，而非只重新產生當前 hash。可用獨立 preservation receipt 完成，不需改產品。fresh-ready、實際限額及上述 freeze 尚未在本次審查出現，故本段不等於正式負載批准。
