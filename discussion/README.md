# DR選型討論材料 — 版2

下載整個 discussion 資料夾後，以瀏覽器開啟 **index.html**。不需Node、服務或GitHub Pages；GitHub顯示HTML原始碼是正常的。

- index.html：使用目標 → 推薦調整 → 架構與職責 → 容量證據 → C責任盤點 → 成本差額 → 會議決策。
- pagefind.html：歷史成功、100k建置通過、同步WASM搜尋逾時，以及暫停深入理由。
- evidence.html：可追溯的精簡摘要，保留失敗與未驗限制。
- manifest.json：本包hash與原始來源識別；不等於完整可重播封存。

## 最新方向

優先核對沿用 A（既有Backend／ES／必要MariaDB與可用Gateway）的異地新增工作。C與Pagefind保留有條件備案，暫停引擎優化、擴容矩陣及C全面產品化。A尚未證成本勝出，也未完成本研究的完整異地驗收。

SQLite的6搜尋API/s是8CPU／12GiB下的已測混合工作點，不是最大RPS；Pagefind的高命中單題5秒截止不是吞吐測試。不能宣稱兩者只要開API就一定不可用。移除Backend與換搜尋引擎的成本應分開，Gateway若能DR沿用不必一律重寫。

## 取得

從repo的 codex/cloud-migration 分支下載ZIP，或在保留本地修改後正常git pull，再開 discussion/index.html。Repo：https://github.com/Joe-Luo-1994/dr-search-lab

## 發布範圍

本次只更新這五個討論檔案；未包含原始研究logs、索引、fixture、憑證與完整實驗程式。沒有新增壓測，歷史commit保留舊版材料。正式資料／consumer／ReBAC／RTO／真人體驗與公司維運工時仍未知。
