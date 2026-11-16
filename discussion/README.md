# DR 搜尋選型：團隊討論材料

下載本資料夾後，以瀏覽器開啟 **index.html**。不需安裝 Node、不需啟動服務，也不需 GitHub Pages。GitHub 網站顯示 HTML 原始碼是正常行為。

- index.html：主報告（使用目標、架構、容量、C六工作包、維運與決策）。
- pagefind.html：Pagefind 已證能力、真實限制、對照公平性與有界下一步。
- evidence.html：保留失敗與限制的精簡證據摘要。
- manifest.json：本包檔案hash與原始來源識別；原始來源不全附入。

## 從另一台電腦取得

既有 clone：切到 codex/cloud-migration 後 git pull，再開 discussion/index.html（若有本地修改，先保留，不要直接覆蓋）。新電腦可 clone https://github.com/Joe-Luo-1994/dr-search-lab.git，或使用 GitHub Code → Download ZIP。

## 討論結論

A 是完整架構可行基準；C 有受控合成可行證據，尚未證成本勝出。Pagefind 未永久排除：100k／6GiB 是當時 builder 預算失敗，不是 reader 上限；SQLite後續改善與擴容使研究投入不對等。應先確認必要任務、可接受差異與維護owner，再選最可能翻轉選型的一項未知。

## 範圍

本次只新增本資料夾，不新增壓測。未包含正式資料、索引DB、fixture、執行log、環境設定、憑證或完整測試程式。既有repo歷史保留。精簡材料可支持討論，不等於可獨立重播的完整實驗套件。正式資料／API／ReBAC／跨區RTO／公司工時仍未知。
