# N1 最終獨立 review — 2026-11-17

結論：本輪G1／G2／G3a可以結案。Tantivy取得「既定合成E契約、預載穩態配置」候選資格；不等於完整DR可用、成本最優或正式搜尋品質通過。G3b更新／回滾延後，沒有取消責任。

## 獨立核對

- G1：SQLite 128、Tantivy 64 golden attempts通過；中文token oracle原失敗與單項修訂保留。固定token合約不是正式中英文語言品質證明。
- G2：六份result皆630/630，21題各30，三block／engine；failure null、cleanup clean、前後完整性未變。E含精確total及lexical同分順序。native計時／token所在配額差異限制純引擎倍率解讀。
- G3a：直接重算Tantivy七stage raw.ndjson的正式lane分母、成功數與nearest-rank p95，與result完全相符；各stage result與controller通過、無miss／failure。各resource樣本無OOM／oom_kill。sequence 2598.75秒、七stage完成、同boot、finally cleanup通過；stop receipts MainPID=0、remainingPids空。g3-final-integrity.json 54項皆通過，涵蓋來源／索引／binary及loader freeze；此review核receipt，沒有重跑大型hash。

| 工作點 | 每輪正式數量 | 三輪p95範圍（ms） |
|---|---:|---:|
| Baseline閱讀 | 300（一次） | 11.233 |
| W閱讀 | 300 | 11.824–12.870 |
| W Web搜尋旅程 | 1200 | 23.103–23.256 |
| M閱讀 | 300 | 15.896–16.151 |
| M Web搜尋旅程 | 1200 | 24.960–25.313 |
| M consumer搜尋 | 600 | 20.750–21.153 |
| M下載 | 600 | 22.356–24.306 |

每輪60秒warm＋300秒正式，W為閱讀1/s＋Web4/s；M再加consumer2/s＋下載2/s。Web旅程含SSR再search，延遲從預定到達到body驗證。以上是通過的固定工作點，不是最大RPS、真人體感或瀏覽器全資產測試。

## 失敗與資源不能怎麼解讀

SQLite attempt1/2是已保留的環境／儀器失效。attempt3閱讀baseline 300/300、p95 13.44ms；W1暖機首旅程4秒截止後，出現SEARCH_BUSY與POOL_CLOSED，正式測量尚未開始。最後status四general忙碌、queue16；全pool截止關閉策略會放大失敗。不能把未送的正式分母當0 RPS或實測100%錯誤率，也不能確認首worker內部瓶頸。

SQLite E仍有同分pageId排序的temp sort，不是充分最佳化或SQLite普遍極限。既有L僅省count仍保留tie；無tie原生TopK尚未測，不得全域淘汰SQLite。

T配置為兩Rust搜尋＋兩Node metadata，S為四general；拓撲不同、跨engine未時間交錯，不能作純引擎因果比較。完整SQLite metadata檔仍保留且須計成本。資源counter包含warm與測量，memory.peak是cgroup生命週期峰值；io.stat不可用，不能判IO瓶頸。沒有OOM或throttle不證明所有資源皆無限制。

## 停止與下一個決策

本輪不自動啟G3b或擴容。先帶候選資格、實際新增Rust build／IPC／角色生命週期／雙資料源版本責任與正式未知討論。若可放寬精確total與同分順序，下一個便宜且能改選的實驗是有界SQLite L gate；若E必須保留，才優先T正式語料品質與G3b多artifact更新／回滾成本。部署單位較少不等於日常維護工時已較低；實際工時與正式流量仍未知。

證據入口：[G2 summary](../evidence/n1-native-20261117/formal-summary.json)、[T G3a](../evidence/n1-native-20261117/g3a-tantivy-attempt1/summary.json)、[S G3a](../evidence/n1-native-20261117/g3a-sqlite-attempt3/summary.json)、[完整性](../evidence/n1-native-20261117/g3-final-integrity.json)、[逐階段review](DR_N1_DESIGN_REVIEW_20261116.md)。

## 結果報告最後核對

已審DR_N1_OUTCOME_20261117.md，無必要修正。12,900正式成功由300＋3×1,500＋3×2,700得出；mixed各lane p95與raw重算一致。CPU三輪28.750924／29.607161／29.214942秒及G2常見詞／長詞組範圍與receipt吻合。256正文／固定頁面、拓撲、cache／IO、SQLite E與無tie L未知、G3b延後、無正式品質／ES新對照等限制已列清楚。核准報告用於本輪收束，不需新增run。
