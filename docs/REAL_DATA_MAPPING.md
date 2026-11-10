# 合成案例 → 真實資料對照表

只在公司內部填實際值，雲端／Git 僅保存去敏後的欄位名稱、數量、規則與結論。此表目前都未收到正式樣本；PM 已確認 readonly、下載、搜尋方向，不能擴張成已確認所有門檻。

| 面向 | Demo 已有什麼 | 內部最小對照輸入 | 夠好的判定／會改變的決定 | 對口 |
|---|---|---|---|---|
| 來源／備份 | generator 的 JSON，V1 100／V2 101頁 | Cronjob 的目錄／manifest、完成條件、重試方式 | 是否能證明正文／metadata／附件來自同一可發布版；不足需補 producer | DevOps＋來源 owner |
| 穩定識別 | p01／m-p01、Space、Tags | 真實 page/media ID生命週期、關聯、多對多、移動／刪除規則 | API與發布版本可追蹤，下載不能借錯 page 授權 | 核心 consumer＋DevOps |
| 正文 | bodyText 與純文字預覽 | 原始格式、HTML／富文字、圖片連結與轉換責任 | user能讀取必要內容；若需渲染／轉換，計入應用工作 | PM＋產品開發 |
| 附件 | 事先給定 attachmentText；HTTP示意檔 | 檔案類型、大小分布、實際 bytes hash、文字抽取已有否 | 搜尋與下載分開驗收；PDF／OCR不假設已可用 | PM＋來源 owner |
| 查詢任務 | 中文、英文、代碼、AND篩選、錯字 | 5–10個真實任務、希望找出的文件、不可見文件 | 必要召回／誤命中／可見性由對口確認；不用ES一致筆數替代 | PM＋consumer |
| Consumer 契約 | 自訂合成 HTTP API | 一個client的request/response範例、分頁、錯誤、下載Range需求 | 能完成最小鏈，差異與接入工時有owner同意 | 一個核心consumer owner |
| 身份與授權 | 可切換Alice/Bob/Guest，mock ReBAC | 網站／service身份、token流、ReBAC呼叫點與失效政策 | 每條讀取路徑一致檢查；撤權、舊版披露與故障降級有政策 | DevOps＋身份owner／FDE |
| Pagefind 資產 | 同一可讀取索引含全部合成Space | 是否可整包交付、群組穩定性、cache／撤權條件 | 不可用UI filter保護已交付資料；決定是否值得分包 | DevOps＋FDE |
| 運行與資源 | Linux Node22.21.1單程序測試 | 公司Next／Node、CPU/RAM、磁碟、容器副本、網路 | API是否可用Node runtime，索引是否放得下、不拖累Web | 核心DevOps |
| 操作與恢復 | 正常啟動、合成故障、歷史封存ES | 發布／重啟／回退／監控現行步驟與當班owner | 有可執行runbook及演練；多副本不混版 | DevOps＋FDE |
| 營運門檻 | 尚未正式承諾RTO/RPO | 優先任務、可接受舊資料、停機、最低可服務量 | 確認何時由不夠好跨到可採用，不由Lab自行定SLO | Reviewer＋PM |
| 接入與採用 | 能力可展示，尚無正式consumer | owner投入估計、試接結果、上線與維護負責人 | 能力交付≠已整合≠已採用；方案準備者追蹤總負擔 | 準備者＋consumer＋主管 |

每一項回填格式：證據位置（內部連結）／誰確認／日期／已知值或未知／影響哪個候選／下一步與停止條件。不填憑證或正式內容到本表，也不以合成數字取代未知。
