# Pagefind D1：定位首個查詢的停止階段

2026-11-16，使用者授權繼續。單次診斷，不是重跑 G2 求通過。保留原 G2 的 5,003.314 ms 無回應結果。

問題：100k 新 server 的首筆 `huge/commonterm/page1/pageSize10` 查詢，時間停在初始化、資產載入、搜尋、50k 結果映射，或回應？這個答案才能判斷要改 adapter、暖機、資源，還是停止投入。

- 凍結同 G1 索引 bytes、G2 oracle 首題、Node22.18.0/ICU77.1、Pagefind1.6.0、原查詢/授權/排序/exact total 與全部結果映射。新隔離副本只加 trace，不重建索引、不預熱、不換題。
- 同 4 CPU quota／4 GiB／swap 0，使用 G2 已驗 controller。全組 15 分鐘、完整 query 操作外部 5 秒截止，包含回應解析與 oracle。最多一次 query；任一失敗停止，不追加第二次或放寬窗口。
- 沿用並複製 G2 已完成的 Next production build；本輪不重做編譯。新 Node server 首次載入 provider；前置完整性掃描會暖檔案 cache，和 G2 一樣不能稱 OS cold-cache。少了重新編譯、另加 trace，因此不當受控效能 A/B。
- G1 產物與 D1 source/API/dependencies 執行前核 hash；原 G1/G2不改。停止後另做唯讀 hash/清理確認，不能補成正常完成的 runtime 證據。

觀測：HTTP 到達/完成、state與SQLite開啟、Pagefind import/options、pf.search begin/end、mapping begin/end及每10k進度、10筆正文組裝、Response建立；資產 listener 記 path、bytes、讀取及傳輸完成/中止。只寫階段及計數，不寫文件內容。

trace在階段邊界同步落盤（write+fsync），每 process一個FD，最多1,000筆/1MiB，超限退出而不靜默漏記。記錄可量測trace自身耗時；硬kill時最後一筆的寫入耗時可能尚未回填，標未知，未完成span不得填0。這是診斷介入，有觀測開銷，不將trace耗時當作純業務耗時。

結果判讀：開始但未結束的span界定觀察窗口內仍在執行/等待的階段；不直接證明引擎、磁碟、mapping或CPU是因果根因。若完成則報本次單次結果，不抹掉G2或推吞吐；若定位則只推薦該階段一項後續驗證，不在本卡自動改程式或加資源。

交付：凍結與差異清單、原始trace/單題/控制器結果、事後保全、可供選型的簡短結論及reviewer。Agent帳務/實際DevOps工時未取得則保持未知。
