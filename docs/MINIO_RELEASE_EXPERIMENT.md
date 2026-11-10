# M01：真實 MinIO 版本發布實驗卡

狀態：待驗證。Owner：待指定。本輪只設計，尚未啟動 MinIO 或宣稱發布原子性通過。

## 要決定的問題

保留 ES、以版本化物件供應正文／媒體時，能否在發布失敗與程序重啟後繼續提供完整舊版，且 consumer 不必自行協調 ES 與物件版本？對應 D01、F03、C01、O01。正式 API、授權時效與成本基準仍未知。

前一輪證據是獨立 Node reader 能從合成資料包完成讀取；沒有 active pointer，也沒有真實 MinIO。因此本輪只測版本發布與跨請求一致性，不擴充引擎。

## 實驗配置與候選協定

使用隔離 loopback 真實 MinIO、獨立測試 bucket、兩個 API/consumer 程序及一個發布者；固定 MinIO server/client 版本與下載 checksum，記錄 Node、OS、ES、程式 SHA、bucket 設定。只使用 synthetic binary。帳密存執行環境、不入證據；不使用正式 bucket、不公開服務。現有 fixture、Demo 與封存索引保留。

V1 先完成並設為 active。V2 使用不可覆寫的 releaseId/key prefix；manifest 列完整引用集合、長度、SHA256、schema、ES index 名稱與 digest。以實際 GET bytes 驗證，不以 LIST、ETag 或上傳成功替代內容驗證。ES 必須指向同版封存索引並檢查 write block、metadata 與內容 digest；以 manifest 的確切索引名查詢，不跟隨另一個可獨立漂移的 alias。

候選狀態機：staging → validated → active → retained。發布者完整驗證物件及 ES 後才原子切換單一 active pointer（generation、releaseId、manifest hash）；採單寫者，崩潰恢復具冪等性。使用哪個 MinIO conditional write/CAS 能力必須先由選定版本實測，不假設跨 ES／MinIO 有交易。若不能證明 pointer 原子更新及衝突拒絕，停止並記錄協調元件缺口。

每個請求只載入一次 release descriptor；搜尋結果及分頁／閱讀／下載連結綁定該 release。兩程序可以短暫分別提供完整 V1、V2，但同一操作鏈不得混版。實驗比較兩種 client 契約：A 由 API 產生含版本的 opaque link/cursor，client 原樣跟隨；B client 顯式保存／傳遞 release token。固定輪流路由至兩程序，檢查切換與重啟後 token 仍有效。版本 token 不能替代每次授權。

舊版在本實驗全部保留，不做 GC。不存在或已失效的版本應回明確錯誤，不靜默落到最新版。正式保留期限、錯誤碼、重試／過期語意、直接 URL 與 Range 支援待需求裁定。

## 故障矩陣與可反駁預期

| 案例 | 注入點與觀察 | 必要結果 |
|---|---|---|
| 正常 V1→V2 | 切換前後持續搜尋→正文→媒體，請求交錯兩程序 | 新鏈可使用 V2；既有 V1 鏈仍讀 V1 |
| 傳輸中斷 | 上傳 V2 一半時終止 uploader；另於大物件 multipart 中途切斷 | V2 不 active；完整 V1 繼續服務；恢復不重寫 V1 |
| 缺物件／錯 bytes | V2 manifest 存在但一個引用不存在；另注入同長度錯 hash | 因具體完整性原因拒絕發布，不能以任意錯誤算通過 |
| ES 未到齊 | 測試專用 ES 目標不存在或錯版；保留原封存索引 | gate 拒絕 V2，V1 搜尋／正文／附件一致 |
| 發布者重啟 | 驗證前、驗證後 pointer 前、pointer 已提交但確認前各終止一次 | 恢復時 active 是完整 V1 或完整 V2，無半提交；不重複破壞物件 |
| consumer 重啟 | A/B 分別在讀 pointer 後與搜尋後重啟，下一步交給另一程序 | 同鏈版本固定；不能憑記憶體 session 才成立 |
| 驗證後物件消失 | gate 通過後、切換前移除 V2 測試物件 | 揭露驗證至使用的競態；若交付缺件即記反例，不宣稱 immutable prefix 已保證不可變 |

最後一項需另證明權限／保留策略阻止發布後覆寫或刪除。若單靠一次 checksum 不能保證完整舊版，必須記錄 object lock、權限分離或本地完整副本的成本；不要以自動混用 V1/V2 補洞。

## 證據與停止條件

每案例一次正常控制組、一次故障注入；固定 seed、注入 barrier 與請求序列。保存版本時間線、pointer generation/hash、兩程序 PID/restart、每鏈 search/read/media releaseId、bytes hash、ES digest、預期與實際拒絕原因。每個故障窗口持續至少 20 條完整鏈，且跨切換鏈至少 20 條；這是功能覆蓋門檻，非容量或可靠度統計。

每案例最多 120 秒就緒／恢復等待；逾時保存失敗停止該案例。任一混版、未授權交付、破壞 V1、pointer 指向不完整版本，立即停止整輪發布操作，保留狀態與 log，不自動重跑求通過。因工具或資源不可用時記為阻塞。全部既定案例各完成後停止，不擴張成正式 RTO、HA 或大型檔案容量實驗。

## 如何影響架構選擇與總成本

A：完整版本及 opaque link/cursor 在兩程序和重啟下成立，支持繼續研究薄 DR API + ES + 物件副本；仍須計入匯出、驗證 I/O、保留空間、發布監控、故障恢復與升級工作。

B：需要 client 管理 release token，記錄代表性 client 改碼行數、分支／重試狀態、相容性測試與每次升級工作；比較 server adapter 隱藏版本協調的成本。沒有正式 client 範例時只報合成 client 成本，不宣稱 consumer 零改動。

C：跨服務一致性或舊版可用性失敗，列出最小必要協調元件；比較原 Backend 保留版本協調、原子切換本地完整副本、增加發布控制器。增加一個元件可能降低整體負擔，不能只以服務數量判斷。

記錄發布耗時、驗證讀取 bytes、失敗後人工步驟／時間、兩種 client 的額外邏輯與維護測試；與完整棧同承諾的工時基準尚缺，不先評定成本勝負。正式 API/schema、權限新鮮度、部署拓樸、MinIO 版本、保留／GC 規則變更時重驗。V1 舊歸屬風險仍需獨立需求裁定，版本一致不等於授權新鮮。

## 2026-11-10 公開基準帶來的前置缺口

先讀 `RESEARCH_BASELINES.md`。M01 暫限已封存 synthetic release；不得由傳輸 hash 推論正式來源同版。執行前補 reader/schema 回退相容矩陣、cold consumer、條件 pointer API 的選定版本能力。Hollow／Iceberg 是可借用的發布模式，並非本案已取得其保證。資料 age／撤權政策維持待裁定；不得將 M01 通過自動升格為正式備援可接受。
