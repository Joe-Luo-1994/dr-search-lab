# 最新決策入口（2026-11-17）

先讀 [架構決策摘要](DR_ARCHITECTURE_DECISION.md)，再按需查看 [證據與未知矩陣](DR_EVIDENCE_MATRIX.md) 與 [30分鐘團隊決策指南](DR_TEAM_DECISION_GUIDE.md)。

最新工作假設待團隊確認：待命時更新快照，DR Active凍結良版，驗證主站並切回後才恢復更新。Recreate是本機實驗選擇，也可能足以供待命刷新；RollingUpdate不再是例行資料更新的必要門檻。核心剩餘風險是待命更新中遇災難時，能否從異地良版復原並符合RTO。C1 原始資料仍在本機，公開摘要不等於獨立原始證據。以下 HTML 與舊材料保留為歷史參考，最新選型敘述以上述三份 Markdown 為準。

## H2：搜尋結果卡片的命中摘要

[有界可行性與實際案例](../research/h2-snippet-20261117/README.md)：不改N1搜尋語意的小型Node原文位置adapter，修正H1四個反例及第5,000字附近命中；保留首次安全缺口與一次修正。Top10長中文增量P95約54–58ms，非API/RPS承諾。仍屬Should-have，正式授權／PDF原文來源／worker接合未驗。

---

# DR 選型討論材料與研究來源

下載 repo 後開啟 `discussion/index.html`。不需 Node、服務或 GitHub Pages；GitHub 顯示 HTML 原始碼是正常的。

- [研究來源入口](../research/README.md)：設計、結果、review、成功與失敗紀錄、程式和來源限制。
- [離線研究導覽](../research/index.html)：八條證據鏈與完整檔案目錄。
- `index.html`：使用目標 → 架構與職責 → 容量 → 維運差額 → 決策。
- `pagefind.html`：能力、100k 建置成功、單題逾時與暫停深入的理由。
- `evidence.html`：精簡證據摘要。

目前優先核對 A 的異地增量工作；C／Pagefind 是有條件備案，並未證明 A 成本勝出。SQLite 6 search/s 是已測混合工作點，不是最大容量；Pagefind 單題 5 秒研究截止不是 RPS 測試。B 不當 A。

本次擴充 `research/`，保留研究設計與紀錄的公開副本；不是正式環境或一鍵重跑驗收。個人路徑替換與來源雜湊有記帳，未包含私密設定、node_modules、完整 DB／索引。要連同來源閱讀，請下載整個 repo，單獨複製 discussion 五檔會缺研究連結。

分支：`codex/cloud-migration`。正式資料、consumer、ReBAC、RTO、真人品質與公司維運人時仍未知。


## 最新研究方向補充

完整原始研究材料見 [research](../research/README.md)。以下新增討論沒有改寫歷史實驗結果：

- [DR_ENGINE_ISOLATION_API_REVIEW_20261116.md](updates/DR_ENGINE_ISOLATION_API_REVIEW_20261116.md)
- [DR_RELATED_WORK_20261116.md](updates/DR_RELATED_WORK_20261116.md)
- [DR_EXTERNAL_FEEDBACK_REVIEW_20261116.md](updates/DR_EXTERNAL_FEEDBACK_REVIEW_20261116.md)
