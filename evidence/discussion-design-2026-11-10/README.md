# 討論介面與內網供應準備證據

2026-11-10 Asia/Taipei；執行log為UTC 2026-11-09。使用者要求推送前納入內網image供應與設計框架，並回報公司已有Harbor、似乎部分API。沒有連到內部Harbor、沒有push GitHub或部署公開服務。

## 本輪結果

- 最終互動版在新的隔離Linux副本安裝、36 tests、Next build通過；不在原checkout重建資料或build。此副本位於/tmp，沒有父層repo lockfile依賴／警告。
- 原主Lab browser smoke 13 checks，engineCount=3、elasticsearchVerified=false。
- 討論頁14checks：鍵盤／focus、情境、Pagefind邊界、三方案成本、Harbor未知、無預設同意、步驟切換保留草稿、本地下載、沒有寫入請求、重整清除、四段手機無橫向溢出、無pageerror。
- 第一次導覽locator未容許標題br造成的accessible name空白，30秒timeout；attempt-1.json/log保留。改為容許空白的語意定位，加入15秒timeout及focus等待；沒有為此修改app行為。attempt-2通過。
- 另有env拒絕探針；所有檢查在啟動前拒絕既有env或新副本注入的空白測試env，沒有更改任何正式／雲端env內容。
- runtime-capabilities只驗證本機Node／記憶體FTS5，不是container或Harbor證據。
- 與前輪127檔baseline比較全部hash保留；既有3000四引擎、3100舊展示三引擎、3102最新展示三引擎在最後檢查ready。DR先前再驗證的4個封存digest保存在../internal-demo-2026-11-10/sealed-es-verification.json。
- 新展示服務在持續終端session35773；不保證程序跨session／重啟永久保留，非RTO。所有URL僅cloud loopback，非使用者入口。

## 來源與範圍

Base HEAD 80a71edbad899fd6fdd8388a8bab885159e1b39e，加未提交修改；tested-source.json保存已測app與腳本hash，確認app與隔離build副本一致。既有未提交研究與歷史失敗保留。沒有container build/run、真實MinIO、正式身份／資料、consumer契約或實際參與者可用性驗收。

圖片僅在本地.lab/discussion-design-preview，不放本evidence目錄；此處只存文字／JSON／log。操作者合成測試草稿也只在.lab，未收集真實會議筆記。

## 公開參考

- https://impeccable.style/designing/ ：採受眾／任務／限制優先、實作後檢查的方向，未安裝plugin。專案自主設計記錄見docs/DESIGN.md及PRODUCT.md。
- https://goharbor.io/docs/2.10.0/working-with-projects/using-api-explorer/ ：API Explorer參考，不假定公司版本。
- https://goharbor.io/docs/main/working-with-projects/working-with-images/repositories/ ：artifact digest／manifest資訊參考。

下一輪用H01讓內網agent只讀查明確scope，再決定公司可用基底與依賴。角色價值、人員採用與正式確認不由自動化check替代。
