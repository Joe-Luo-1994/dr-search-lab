# Pagefind G1：執行前獨立裁定

2026-11-16。**批准一次既定100k G1建置／完整性驗證。** 使用native新目錄的frozen controller與wrapper；controller仍須在go前實讀4CPU／12GiB／swap0及Windows／WSL餘裕，不符即停。本裁定不批准G2或百萬建置。Reviewer未執行build／查詢／服務。

已靜態讀controller、environment、wrapper、oracle與舊MS1 builder／API介面。controller具全unit cgroup限制、外部採樣期限、host／artifact護欄、整樹kill及cleanup空membership核對；G0的128MiB OOM案觀察oom／oom_kill各增1，8秒deadline案無OOM，兩案均觀察4個程序、remainingPids與cleanupErrors皆空、MainPID=0。這是小型控制器自測證據，不是Pagefind容量。

native freeze的56個來源檔已獨立重算SHA，零差異；setup及Node binary SHA相符，保留17份舊MS1原檔與origin SHA一致。Node22.18.0／ICU77.1與舊22.21.1差異已記錄，不能將新結果純歸因記憶體。controller SHA `3d9534f7b8059f55cbac6138dda3ad3dcab536ab2e342827b935e7312298840f`；wrapper SHA `933d3bcf95f8eeb50aa42749b755df33c66c9031573811e1e2f0f9048b069795`。

wrapper保留原builder，新增前後freeze核對、Pagefind1.6.0／zh page_count=100k、完整source公式與每row、DB integrity、page／mapping雙向關係、fragment身份／Space、外置完整byte SHA inventory。controller建立新artifacts父目錄，原builder自行建立不存在的artifact-100000子目錄；evidence使用新g1-control，不能覆蓋已有資料。

G1通過必須同時有controller passed、remainingPids空／cleanupErrors空、wrapper verified及凍結保全；單獨verified不抵銷稍後monitor或cleanup失敗。partial／失敗保留，不進G2、不調RAM救通過。

G2留待成功產物與實作review：oracle身份401／503／403／none空結果、來源metadata及Tags反例方向正確；需在G2新freeze前補metrics欄位名稱allowlist，不能只驗其值為數字。新operation-watch介面可用，但具體runner仍須保證每次操作寫入／移除標記、檢查完成耗時與總案例上限，避免50ms輪詢間已完成的超時被當通過。這不阻塞G1，也不是新增矩陣。共享Next實際依賴於G2前另鎖定。
