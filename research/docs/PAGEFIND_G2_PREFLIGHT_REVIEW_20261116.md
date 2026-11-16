# Pagefind G2 執行前獨立審查

2026-11-16。僅讀程式、凍結檔及 G1 證據，未啟服務、build 或查詢；未修改既有卡片與凍結輸入。

**裁定：無剩餘執行阻擋，可依原卡單次執行 G2。** 由凍結 controller 在放行前讀回整組 4 CPU／4 GiB／swap 0 及主機餘裕；不符合便停止。這是執行資格，不是尚未取得的能力通過判定。

## 已核對

- G1 controller 為 passed／COMPLETED，實際 4 CPU／12 GiB／swap 0，memory max／OOM 事件皆零，remainingPids 與 cleanupErrors 皆空。wrapper 核對 100,000 筆來源、雙向 mapping、100,000 fragments 及完整 SHA inventory，verified=true。G1 已有有效產物，足以進入 G2；不代表 reader 容量或百萬頁建置成功。
- 獨立讀 native G2 freeze 並重新計算全部 **10,469 檔 SHA，零差異**。包含共享 Next 依賴、保留歷史 bundle、G1 source 與新 G2 程式。runner 為 `d2d30816…`，oracle 為 `0450a52e…`，controller 為 `3d9534f7…`。原 G1 凍結副本沒有被 workspace 的 G2 oracle 修正取代。
- runner 先核 G1 inventory 原始 bytes 的 SHA，再對實際產物逐檔核大小／SHA／名稱集合，拒絕未列檔與特殊檔；執行後再核。來源及依賴另有 before／after freeze。不能只憑成功 manifest 接受殘缺產物的缺口已關閉。
- 12 題 MS1 加 20 題小 fixture 為必要案例，來源 oracle 核 exact total、身份／Space／Tags AND、回傳內容與 URL；兩頁結果另核不重複。metrics 僅允許 engineMs／mappingMs，有限非負數，空物件合法。缺身份 401、授權服務 unknown 503、不認識使用者 403、none 200 空結果的邊界有分開。
- 每次 query marker 由外部 controller 監視，超時停止整組，不把 HTTP abort 當作 WASM 已取消。成功 HTTP 回應在解析／驗證後若 elapsed≥5 秒也失敗且保留 marker。runner 880 秒、controller 900 秒；程序群組 finally 終止與等待 close，原始案例及未執行案例均保留。
- 第 33 次僅是必要 32 題通過後的歷史 Node 觀察。完整 load／query／hydrate 有 5 秒邊界；未完成時請求數可能 unknown，不假填零。歷史內容差異不改必要 oracle；沒有 browser 對照，也沒有歷史完整 inventory 的連續性證明，不能宣稱原中文 parity 問題閉合。

## 報告限制與成本口徑

G1 wrapper 含核驗為 **161.139 秒**，外部 controller 含監控與清理為 **162.811 秒**；兩者不可混稱相同時間。cgroup 的 memory.peak 為 **8,499,032,064 bytes**，不是 reader 常駐 RSS。產物 101,571 檔、252,204,787 logical bytes；wrapper allocated 為 608,612,352 bytes，controller 最終取樣為 613,355,520 bytes，應保留不同取樣值而不擅猜原因。

G2 是 Next server 讀私有本地 Pagefind 的合成能力檢查；MS1 仍包含 SQLite mapping／本地正文，另建的小 fixture 不等於把新遠端內容 C 整合完成。即使本輪全過，仍沒有 production ReBAC、正式 consumer、browser 品質／互動容量、每站總成本或優於 A／SQLite 的證據。若任一必要案例失敗，保留失敗及後續未執行項，依卡停止，不在本輪改語意或 oracle 救通過。
