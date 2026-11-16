# K5：C 擴容結果與續接

本輪找到可行配置：8CPU／12GiB／8workers。這是最高已測工作點通過，未尋找最低資源，也未證正式長期維運成本較低。

工作點：Web搜尋4journeys/s（每次SSR→搜尋）、另reading1/s、consumer搜尋2/s、bulk下載2/s，並在相同背景更新V1→V2。相當於6次搜尋API/s、5次SSR/s及2次下載/s，不包含所有瀏覽器資產與正式使用者行為。

## 每階結果

| 配置／階段 | 閱讀P95 ms | Web搜尋P95 ms | consumerP95 ms | 下載P95 ms | 判定 |
|---|---:|---:|---:|---:|---|
| r1／先確認閱讀基準 | 14.2 | — | — | — | 通過 |
| r1／Web 搜尋 2/s ＋ 閱讀 1/s | 14.0 | 1063.8 | — | — | 通過 |
| r1／Web 搜尋 4/s ＋ 閱讀 1/s | 7.7 | 1127.8 | — | — | 通過 |
| r1／再加 consumer 1/s | 25.5 | 1159.8 | 1266.0 | — | 通過 |
| r1／consumer 提升到 2/s | 152.3 | 1296.5 | 1239.0 | — | 通過 |
| r1／再加下載 2/s | 133.5 | 1276.4 | 1275.7 | 289.5 | 通過 |
| r1／相同背景下更新 V1 → V2 | 862.5 | 2074.1 | 1671.9 | 834.8 | 未通過 |
| r2／先確認閱讀基準 | 14.0 | — | — | — | 通過 |
| r2／Web 搜尋 2/s ＋ 閱讀 1/s | 12.5 | 1119.8 | — | — | 通過 |
| r2／Web 搜尋 4/s ＋ 閱讀 1/s | 7.8 | 1096.8 | — | — | 通過 |
| r2／再加 consumer 1/s | 9.0 | 1143.2 | 1252.3 | — | 通過 |
| r2／consumer 提升到 2/s | 8.3 | 1193.5 | 1262.9 | — | 通過 |
| r2／再加下載 2/s | 13.8 | 1215.1 | 1333.4 | 26.4 | 通過 |
| r2／相同背景下更新 V1 → V2 | 12.9 | 1205.8 | 1271.6 | 26.2 | 通過 |

## 如何解讀

- R1前六階通過，更新也完成啟用與舊pool退出，但更新階reading及Web搜尋不合格，不能說R1整體成功。原始失敗保留。
- R1更新平均CPU約3.73核且有配額節流／排隊，RAM沒有max/OOM；支持測更大CPU／worker配置，不代表已證RAM不足。R2同時提高CPU/RAM/worker，是配置可行性試驗，不能分離各自因果。
- 服務端內容槽維持4；R1有CONTENT_BUSY及SEARCH_BUSY。MinIO更新期間有memory.max事件而無OOM；不宣稱MinIO絕無瓶頸。不同輪次宿主快取與順序也可能影響，沒有做純因果A/B。
- 新增常駐deployment unit為0；實作在新副本改pool數量，其餘service/storage/worker與Next build相同。controller／harness為本輪研究工具。
- 更新由admin API觸發。PoC固定V1啟動，重啟恢復最新版尚未接通。V1→V2成功不等於每日排程、V3以後、舊檔GC、回滾、告警與非作者交接通過；DevOps長期工時未知。

## 證據與停止

[手機報告](C_SCALE_RESULT_20261116.html)、[原始資源分析](../evidence/c-scale-20261116/analysis.json)、[獨立數據重算](../evidence/c-scale-20261116/verification.json)、[結果review](C_SCALE_POSTREVIEW_20261116.md)、[維運責任帳](C_SCALE_OPERATIONS_LEDGER_20261116.md)。

原資料／SQL／timeout／判定門檻沒有因失敗而修改。每輪各80檔freeze與兩版installed DB hash、服務清理見各attempt；R1/R2各自保留。

完成本輪後停止擴容；下一個有價值的方向是以可行或失敗配置核對日常操作／連續版本生命週期及團隊可重用自動化。ES與Pagefind等對照尚未由本輪執行；A總成本未知，不把B當A。

限制：百萬合成重複語料、九query等權、256正文hotset／8media、單輪短窗；正式ReBAC、PDF-only／正式品質、長尾讀取、真實流量、長期可靠／RTO、真人體驗及人時仍未驗。

執行腳本 scripts/c-scale-20261116；分析／報告 scripts/c-scale-report-20261116；native .lab/c-scale-20261116；證據 evidence/c-scale-20261116。無新引擎安裝、原資料保留、沒有push。
