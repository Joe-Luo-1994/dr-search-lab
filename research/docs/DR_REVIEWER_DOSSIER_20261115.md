# 分層評審材料修訂與獨立審查

> 後續需求補充以 [討論紀錄](DR_DISCUSSION_REGISTER.md) F01–F05 為準：PDF抽取文字在MariaDB可用、Web highlight為加分項、Tags屬獨立metadata、中英文與pageId銜接。歷史HTML的PDF來源未知已過時；抽取覆蓋／授權／正式consumer等缺口仍保留。[搜尋品質草案](SEARCH_QUALITY_PLAN.md) 尚未執行。

2026-11-15。使用者指出舊手機材料缺乏架構、搜尋效果與決策資訊；本次依五組問題重寫，不新增 DR 實驗或修改既有實驗裁定。

## 使用入口

- [可展開 HTML 評審材料](DR_REVIEWER_DOSSIER_20261115.html)：依同步、搜尋、閱讀、更新、選型串成一條閱讀路徑。對話內另交付同內容的可互動版本，供手機使用。
- 舊 [DR_REVIEWER_BRIEF_20261115.md](DR_REVIEWER_BRIEF_20261115.md) 保留歷史，但最新閱讀基準及術語以本次修訂為準。
- 原始資料與摘要：`.lab/reviewer-brief-20261115/dossier-source/`；手機 QA：同目錄上層的 `DOSSIER-UI-VALIDATION.json`、`verify-dossier.cjs` 與截圖。來源快照並未重跑實驗。

## 更正的現況及設計基準

1. 「副本」必須區分跨區 MinIO 已發布版本與每個 Pod 可重建的本地 SQLite。107.52 秒只測 MinIO 已有檔、Pod 本地從空開始；不是每日同步必然停機。
2. 主站每日產製／發布、Pod 初始取得／背景更新、事故入口切流是不同機制。候選 sidecar＋reader supervisor 是部署提案，不是 Kubernetes 自動同步已完成。
3. 使用者已確認現有 page list→pageId→取 page content→editor 可用。新增範圍是搜尋 pageId 銜接與 DR 內容／授權 adapter；PDF 抽取搜尋、media-backed page 顯示與供檔授權分別討論。
4. 搜尋效果、效能、正式相容性分開。歷史10k unicode61／trigram差異、Pagefind Node/browser反例、S1-ES小型參照與最新L固定ID鏈不可混作同語料排名。
5. 即時 ReBAC role＋舊快照 page→Space 可能仍洩露搜尋 title／snippet／total；歸屬時效 gate 未設計驗收。不得只靠開頁時拒絕補救。
6. 最新更新實驗是同 release 第二份檔，停舊啟新時沒有在途請求。正式新版本切流、舊鏈、回滾與GC仍待驗。
7. 更新2D只是假定一舊一新；保留多版本需按同時存在檔數K計算。雙reader切換RAM峰值未量。不能由RSS推128MiB Pod，不能由服務數推總維運較低。

## 獨立 reviewer

角色：`/root/reviewer_material_audit`。只讀材料與選定程式／紀錄；未執行新實驗、未操作真實產品。

首輪：原五題均只能局部回答。主要缺口是兩層同步混稱、閱讀基準錯置、只有延遲沒有搜尋效果、無更新生命週期圖、沒有A/B/C改選條件。

新版複審：主要敘事成立；指出搜尋的歸屬時效缺口、2D容量與舊版保留脫節、證據只列檔名缺少入口。三項均修正。

最後核對：沒有剩餘必改，五題可由材料直接回答。這是材料可回答性與選定來源一致性的 agent review；不等於實驗重跑、使用者理解驗證或正式 owner批准。

## UI 檢查與限制

獨立無頭 Edge，手機320／375／390及736寬度，全部展開後無水平溢出；20px base字體無溢出；18處details可操作、點擊證據連結會開啟同頁卡片。曾發現長code字串溢出及sandbox中原生anchor定位問題，已修正並重驗。預覽wrapper固定高度造成長section截圖裁切，改用手機viewport走查及內容高度模擬；不把舊裁切圖當交付品質證明。

實際手機理解程度尚未由使用者接受。這次沒有新增需求接受、RTO/RPO/SLO承諾或正式選型。

## 下一個具決策價值的工作

優先補最新L與ES的同題搜尋效果／Tags AND及既有UI銜接；同時盤點A可沿用的部署、備份、告警與runbook。先釐清必要中文命中與整合成本，再繼續單邊效能優化。正式未知維持；不要求在缺乏證據時先批准C。

本次一名獨立 reviewer，時間／token／金額未取得可靠完整統計，標示未知；不以省token量或測試數聲稱品質提升。
