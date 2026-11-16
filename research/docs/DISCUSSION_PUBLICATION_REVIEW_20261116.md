# 公開討論包審查

2026-11-16。只審 `discussion/` 靜態內容、來源識別與發布範圍；沒有服務、負載、UI或GitHub寫入。使用者已授權將討論材料加到既有公開repo，且不需GitHub Pages；本審查不新增確認流程。

**裁定：範圍與內容主體符合；三處文字修正後可發布五檔討論包。**

## 發布前必改

1. `pagefind.html` 首屏「若要選定SQLite，…願意承擔Pagefind的未解風險」風險主體倒置。應表達選SQLite時接受尚未補足Pagefind比較證據的不確定性，或選一個有界gate；不把必須先跑Pagefind當作選SQLite的硬前提。
2. 同頁「12頁真Next兩輪實驗…合計52 HTTP」應改為第二輪兩候選各18/18、該輪合計52 HTTP。不能把單輪數字表成兩輪總和。
3. `index.html` 原「完整K5數據」「完整歷史重判」等已重映射至公開摘要的連結，應同步改名為對應證據摘要／Pagefind專頁；本包沒有完整raw，不能仍用完整資料的連結承諾。摘要與來源hash不能替代可重現封存。

## 已核實

- 實際檔案僅 `index.html`、`pagefind.html`、`evidence.html`、`README.md`、`manifest.json`，本次讀取合計58,496 bytes；manifest四個payload的bytes／SHA及21個本地來源識別hash均獨立核對相符。manifest不列自己hash是正常的。
- 36個本地連結／anchor全部落在五檔allowlist內且目標存在，沒有指向工作區原始log、fixture或程式。外部連結為Elastic／Pagefind官方文件；未見外部script／資產載入、fetch或遙測。內嵌JS僅展開／收合與列印。
- 五檔閱讀及字樣掃描未見Windows／Linux個人環境絕對路徑、存取憑證、私鑰、raw環境log或fixture dump。manifest保留的是repo相對來源名稱、bytes與hash，明示原始內容未附入；未將來源文件全文一起公開。
- Pagefind小型Next成功、MinIO browser子證據、舊中文Node／browser差異、100k建置超6GiB而reader未跑、早期fragment與失效牽連後來已修，均有適當界線。SQLite後獲更多調整／擴容，不宣稱公平同條件勝出；新100k gate標尚未執行。
- 主報告保留A完整基準、B不代A、C各build不拼正式整合、scope最新修正、六包owner待確認與成本未知。公開摘要未將合成證據升格成正式ReBAC、公司consumer、RTO或成本接受。

## 交付界線

這是可下載的靜態討論材料，不是原始研究套件，不部署Pages、不新建搜尋服務。README明示GitHub通常顯示HTML原始碼、下載整包後開啟；本審查不宣稱iPhone已實際成功打開。真正提交仍由主agent核對diff只有這五個新增檔並保留既有repo歷史；本次沒有審查整個既有公開repo內容，也沒有確認遠端commit或下載讀回結果。

## 定向複核：三項全部closed

已讀重新生成的公開檔：首屏改為可接受暫缺Pagefind比較證據的不確定性，且Pagefind先跑不是採用SQLite的前提；12頁／52HTTP明確限定第二輪；原完整資料連結改為K5證據摘要與Pagefind專頁。三項finding全部closed。

新包仍僅五個allowlist檔，合計58,588 bytes；四個payload的manifest bytes／SHA重新核對相符，36個本地連結／anchor全部有效。**此靜態討論包無剩餘內容／範圍審查阻擋，可依使用者既有授權發布到原repo。** 實際commit僅五檔、遠端讀回與下載交付仍由主agent完成；本裁定不代表那些外部動作已發生。
