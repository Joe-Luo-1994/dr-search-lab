# 保留 Elasticsearch 的主案：第一輪實測

日期：2026-11-09（Asia/Taipei）。成功 run：`mw8ey9hm`。原始證據：`.lab/reports/es-experiment-mw8ey9hm.json`；失敗的前次 run 也保留，未覆寫為成功。

## 問題與結論

要驗證：以發布資料代替查詢時的 MariaDB／完整 Backend，在參考實作中能否用 ES 完成唯讀功能？主站 ES 停止後，能否把事先備妥的快照還原至另一個 ES cluster，繼續使用？

**範圍內成立**：Next.js API + ES + 本地發布資料 + mock ReBAC 能完成合成案例；原 ES 停止後，第二個 cluster 可還原快照，搜尋結果及排序可重現，閱讀與 Media 交付可繼續。這證明一個參考架構存在，不證明公司現行服務已能移除 DB／Backend。

## 實驗環境

- Windows，同一台主機，兩個不同 cluster name／data path 的 ES 8.17.0 native 程序，僅綁定 loopback：primary 19200、DR 19300。
- 每個節點 Java heap 512 MiB；不是總程序記憶體，也不是生產容量建議。無 replica，single-node，安全功能關閉，僅供本地實驗。
- 官方 ZIP 約 456 MiB，以官方 SHA512 校驗。工具、設定、資料及 snapshot 全部留在 `.lab/`，不安裝 Windows service。
- V1 100 篇、V2 101 篇；正文與含附件各一份索引，共四份。相同合成 fixture，standard analyzer，Title 權重 2，固定 id 作為同分排序依據。
- 使用本地 filesystem snapshot repository，主站寫入、DR 以 readonly 註冊。不是 MinIO，也不是跨區複寫。
- Docker Desktop 啟動遇到 `dockerInference` listener 錯誤；沒有重設或修復 Docker，改用 native 路線。

## 已實際完成

| 驗證 | 結果與範圍 |
|---|---|
| 主站 V1/V2 完整集合／授權／Tags／分頁 | 每版本 36 組角色×Space×Tags 組合，均符合 fixture |
| 正文／附件切換、閱讀、Media、ReBAC 故障 | 參考應用函式實測通過；不是公司 ReBAC |
| 外部索引混版 | 保持筆數，改一份文件正文；完整內容 digest 檢查擋下發布，會話保持 V1；恢復原文件後再驗證 |
| ES snapshot | 四份索引 SUCCESS，failed shards = 0 |
| 主站中斷 | 核對節點名稱、live PID、專案 Java 路徑後停止主站；搜尋失敗，本地閱讀仍可用 |
| DR 還原 | 主站不運行，DR 從 readonly repository 還原；四份索引內容／版本／寫入封鎖均驗證 |
| 搜尋相容（本次快照） | backup、disaster recovery、資料庫備份、ERR_CONN_RESET 的筆數、ID 與順序和主站記錄一致 |
| DR V1/V2 契約 | 再跑 72 組；合計主站／DR 144 組集合比較 |
| 備援再重啟 | 停止 DR 再啟動，索引指紋與 backup 結果保留 |
| Next.js production build／瀏覽器 | 建置通過；13 類 smoke 檢查通過，含 4 個真實引擎、下載、Guest、發布與故障拒絕 |

## 時間：只能當本機實驗值

- 主站已備妥時建立四份索引並驗證：約 1.99 秒。
- 快照建立：約 0.49 秒。
- DR 啟動與 readiness orchestration：約 30.35 秒。
- snapshot restore + 四份索引驗證：約 0.83 秒。
- 從開始啟動 DR 到還原後搜尋／閱讀／下載驗證完成：約 **31.24 秒**。
- DR 再重啟與驗證：約 31.16 秒。

數值包含本地程序管理開銷，且資料極小。排除故障偵測、決策、跨區下載、DNS／流量導向、正式登入與 consumer 行為。**不能據此承諾一小時 RTO，不能依比例推算大資料量。**

## 額外發現與修正

1. 本地 manifest 原先只遍歷列出的檔案。真實損壞／缺檔會失敗，但空 manifest／漏列必要檔案會錯誤通過。新增必要檔案集合、長度與 hash 檢查。故障測試使用私有複本，不破壞運行中的資料。
2. ES 只檢查 count 不足以保證版本一致。加入 mapping `_meta` 中的版本、附件模式、canonical digest；封存後設 write block；發布時實讀全部文件比對。這需要 O(N) 驗證時間，應計入同步／發布成本。
3. ES 部分 shard 失敗或 timeout 不能當作完整成功結果。adapter 對 partial response 拒絕交付；此項分支以單元測試驗證，尚未製造真實 shard failure。
4. ES 同分結果增加 id tie-break，降低固定資料分頁的不確定性；正式環境是否採相同排序仍未知。

digest 不是簽章；write block 不是防止管理者惡意改寫的安全邊界。需要可信發布流程、正確權限與正式的不可變版本管理。

## 跟替代引擎的第一個具體差異

Alice／V1／相同合成資料：

| 查詢 | SQLite | MiniSearch | Orama | ES standard |
|---|---:|---:|---:|---:|
| disaster recovery | 33 | 33 | 33 | 33 |
| 資料庫備份 | 1 | 1 | 0 | 32 |
| backup＋ops＋database/runbook AND | 17 | 17 | 17 | 17 |

這是匹配設定差異，不是品質排行。ES 中文結果較多不能自動視為更好；既有公司設定仍待取得。原始查詢與 top5 在 `.lab/reports/observations.json`。

另外針對同一份 ES 索引、只搜尋 ops 的 title，實測 `disaster recovery` 被分析成兩個詞：`match` 找到 2 篇、`match_phrase` 找到 1 篇、原字串 `term` 找到 0 篇。`資料庫備份` 則被本參考 analyzer 拆成單字。這證明「拆成兩詞就必然搜不到」不成立，也說明只知道引擎名稱不足以定義相容性；不代表找到了公司現行問題的原因。證據在 `.lab/reports/es-query-semantics.json`，重現命令：`node --env-file=.env.local scripts/es-query-semantics.mjs`。

## 對決策的影響

- 可以把「保留 ES 的精簡唯讀架構完全不可行」排除在這組參考需求之外。
- 不能排除現行 API 有額外 DB／Backend 依賴；F03 的正式判定仍未知。
- 可以把 ES 快照還原保留為冷備援候選，不需要先替換搜尋引擎才有 DR。
- 同步發布、權限新鮮度與對外切換仍是共同責任，保留／替換 ES 都不能省略。
- 下一個有價值的證據是正式欄位／依賴盤點、MinIO 資料發布、ReBAC 實際介面，以及較大資料與長時間流量；不是增加更多引擎。

## 參考架構的責任盤點

| 責任 | 目前由誰承擔 | 維運含義 |
|---|---|---|
| Page metadata、正文、Media 關聯 | 發布 JSON／本地檔案 | 需要匯出、完整性與版本管理；未接正式資料 |
| keyword、Space、Tags、排序 | ES reference index/query | 仍要管理 ES 版本、mapping、快照、還原 |
| Space 權限 | mock ReBAC | 正式 API 能力／容量未驗證 |
| API、結果組裝、閱讀、下載授權 | Next.js server | 原 Backend 責任轉移，不是消失 |
| 恢復 | native 管理腳本＋snapshot API | 本機腳本不替代 infra 流量切換與演練 |

## 重現與管理

先下載官方 8.17.0 Windows ZIP 與同名 `.sha512` 到 `.lab/tools/`，然後：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/es-native.ps1 -Action setup
npm run experiment:es
```

ExecutionPolicy 只對該程序生效，不修改系統設定。setup 只在節點已停止時執行；每次實驗使用新的 `drlab-it-*` prefix，保留舊證據與索引，不刪除任何既有索引。重複實驗會累積磁碟用量。

成功後 primary 停止，DR 留存，以供後續 Demo；`.env.local` 設 `ELASTICSEARCH_URL=http://127.0.0.1:19300` 與報告中的 `LAB_INDEX_PREFIX`。每次新實驗若要切換 Demo，手動更新 prefix 並重啟 Next.js。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/es-native.ps1 -Action status -Instance dr
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/es-native.ps1 -Action stop -Instance dr
```

停止腳本會再次核對 live PID、node name 與專案 executable。完整實驗失敗時會保存 failed report 並保留程序供診斷，不自動刪除資料。

官方行為依據：[filesystem repository](https://www.elastic.co/guide/en/elasticsearch/reference/8.17/snapshots-filesystem-repository.html)、[restore API](https://www.elastic.co/guide/en/elasticsearch/reference/8.17/restore-snapshot-api.html)。這是固定舊版本的本機參考實驗，不是正式部署版本建議。
