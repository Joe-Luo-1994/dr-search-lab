# 公開討論材料 v2：獨立內容審查

2026-11-16。讀取 `discussion/` 五檔、生成器及最新 K5、Pagefind G1／G2／D1／D2、選型與落地來源。只做文件、hash 與靜態連結檢查；未做新實驗、UI 或發布操作。

**最終裁定：兩項必要修正均 closed，內容與公開範圍審查通過，可依使用者授權發布這五個討論檔案。** 這是討論材料的內容審查，不是公司方案驗收，也不表示遠端發布已完成。

## 必改

1. `index.html` 的新增 A 架構圖把 MinIO 寫成「正文／附件依既有設計」。公司正文位置未核實，不能把 C 的遠端正文設計套給 A。改為已知的 media／附件；正文與 metadata 的實際儲存、交付路徑仍待走查。主 agent 已辨識並正在修正。
2. `index.html#work` 末尾繼承的「導入順序提案：先用一條正式來源→搜尋→既有頁面／附件……工作包 1–3」未附啟動條件，會與本版先核 A、暫停 C 全面產品化的下一步產生衝突。保留六包細節，但將該段明確限定為「僅在重開 C 條件成立並決定投入後的順序；目前不啟動」。不用刪掉有價值的工作拆解。

## 已符合的必要邊界

- A 是優先核對及提案方向，不是已證成本勝者；B 不代替完整 A。移除 BE／MariaDB 與替換搜尋引擎分兩軸，A 的 ES／DB 容量、升級、同步與事故責任仍有列出。
- Gateway 重用以異地可達、配置與依賴成立為條件；限流不代替應用併發隔離，ReBAC 不代替 canonical page／Space／media 關係解析與執行。未把共同責任全部算為 C 獨有或全部相消。
- SQLite 6 搜尋 API/s 是 8 CPU／12 GiB reader 加另配 MinIO 下的已測混合工作點，並非上限；R1 更新完成但體驗未全合格、R2 成功及 K5／O1 不同 runtime 均保留。
- Pagefind 新 100k 建置成功、舊 6 GiB 軟預算失敗與 Node 差異有交代。G2／D1／D2 單題逾時不當 RPS、所有查詢失敗或正式 5 秒 SLO；其餘 31 必要與 1 歷史觀察未執行、中文 Node／browser 反例及本地 SQLite 路徑限制仍明列。
- 保留具體架構、六包 owner／驗收／持續責任、成本四欄與重新投入條件；未知工時／費率未填假數。下一步為既有 A 路徑、增站與負載的一次走查，不自動開引擎或擴容矩陣。

## 公開範圍與靜態檢查

目前僅 `index.html`、`pagefind.html`、`evidence.html`、`README.md`、`manifest.json` 五檔，合 63,308 bytes。4 個 payload SHA 及 27 個本地來源 SHA 全符；36 個本地連結／錨點皆存在。公開頁面只帶精簡摘要與來源識別，沒有 Windows／WSL 環境路徑、credential 值、raw log／DB／fixture dump；HTML 沒有外部 script／iframe／fetch 執行。localhost 僅作架構說明，外部官方／repo 連結為使用者點擊連結。

manifest 的來源 hash 不是讀者已取得完整原始證據；本包已明說非可重播封存。UI 與發布由主 agent 另驗，不能將本審查當成已完成手機或遠端發布驗收。修正後須重建 manifest，再做定向閉合。

## 定向複核：全部 closed

已重新讀取生成的 `index.html`：A 圖現在為「異地 MinIO：media／附件」；六包末尾限定為僅在重開 C 條件成立、團隊決定投入後的導入順序，並明示「目前不啟動」。兩項修正對應到位，沒有改變既有證據或自動恢復 C 工程。

重建後五檔合 **63,377 bytes**，4 個 payload SHA 與 manifest 全符。另已讀主 agent 的 `evidence/discussion-reframe-20261116/browser.json`：三頁版面／展開／鍵盤／錨點、跨頁與列印狀態回復檢查通過，errors／remote 皆空。這是 agent browser receipt，非本 reviewer 重跑，也不當真人理解或實際紙本驗收。無剩餘內容發布阻擋；主 agent 仍需完成授權的 commit／push 與遠端讀回。
