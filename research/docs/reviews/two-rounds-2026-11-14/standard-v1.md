# C1 兩輪共同產品判準 v1（凍結）

日期2026-11-14；審核組制定；讀取DR_PRODUCT_REVIEWER v0.1。核心V1必要任務、V2 consumer可繼續運作。V6/V7僅合成scope與錯誤邊界，不能冒充正式授權。此輪不要求MinIO、30分鐘容量、原站故障或正式GM整合，這些仍未驗證。ES同量總資源／相容性不作本輪通過主張。

## 凍結與最低交付

- reviewer-owned `scripts/product-review/fixture.json` 為獨立固定輸入，12頁、1個文字附件。預期結果由此文件及人工任務定義，不能由候選輸出反推。fixture/schema/tasks不因失敗而改寫；更動需另起標準版本，兩候選同版重評。
- **基本級 B**：SQLite與Pagefind各自經真Next HTTP提供下列全部18張任務。只證明小型合成API任務，可回傳JSON頁面，不要求本輪UI。使用無額外第三方client SDK的同一fetch client，只有engine參數不同。任務全過才稱「B級限定範圍通過」；尚無正式consumer確認。
- **加分級 H**：在B全過之上提供安全HTML highlight；H非B阻塞，null必須明示。不能將缺失content、URL、必要中文查詢或分頁改稱降級求通過。ES原排名一致不是門檻。
- 各HTTP請求timeout 5秒；ready等待最多120秒（首次Next編譯可在ready內暖一次）。任務個別及總耗時記錄；本輪不據此判P95／SLA。錯誤、逾時及harness問題分開，原始失敗保留；最多正常重播一次以排環境暫態，不無限重試。
- 真Next路由及啟動命令／PID／依賴版本需證據；若只能Node handler，仍可報部分證明，不能通過此C1 B級。獨立app/distDir/產物，不動既有fixture、.next或ES。

## 合成共同HTTP契約

身份header `x-lab-user: ops|restricted`；只允許相同scope。這是明示mock。缺header→401 `UNAUTHENTICATED`；unknown→403 `FORBIDDEN`。

`GET /api/research/search?engine=sqlite|pagefind&q=...&page=1&pageSize=2`

```json
{"schemaVersion":"c1-v1","release":"review-v1","engine":"sqlite","page":1,"pageSize":2,"total":5,"totalRelation":"exact","capabilities":{"highlight":"none"},"hits":[{"id":"p01","title":"...","content":"...","url":"/api/research/pages/p01?release=review-v1","highlight":null}]}
```

- page正整數，pageSize 1..10；不合法page／未知engine→400 `INVALID_REQUEST`。
- title/content為原fixture原字串（不是tokenized內容），id為穩定page ID。url為同origin相對URL，可由同client跟隨並保留身份；不得以唯一記憶體session才可讀。所有結果僅屬身份scope；total為該query經scope限制後的精確值。
- 同query與release重播排序需穩定；不要求等同ES。超出最後頁→200空hits、total仍正確。unknown term→200、total=0、hits=[]。
- highlight `null`＋capabilities.highlight=`none`，或安全字串＋`html-mark`。本輪基本級允許null；不能用缺欄位或空字串偽裝支援。HTML模式只允許`<mark>`、`</mark>`作標籤，來源markup需escape。H級必須實際在英文及中文命中片段加標記，不能只宣告能力。

`GET /api/research/pages/:id?release=review-v1` 回 `{schemaVersion,release,id,title,content,attachments:[{id,url}]}`。正文與query結果須一致、附件URL可跟隨（保留身份）。異scope頁面→403 `FORBIDDEN`（本合成契約）；不支援的release→409 `VERSION_UNAVAILABLE`，不能默默回目前版。

附件可採 `/api/research/attachments/:id?release=review-v1`，回固定fixture UTF-8 bytes；以獨立hash核對。錯誤JSON共同 `{error:{code:"...",retryable:false}}`；5xx可有retryable=true，不能回空結果掩蓋錯誤。未知ID可404但不得帶出其他頁面內容。

## 18張必要任務（B級，兩候選共用）

| ID | 使用者／consumer任務 | 事先期望 |
|---|---|---|
| T01 | 英文backup找到復原文件 | ops Top10包含p01；內容／title／URL契約成立 |
| T02 | 連續中文資料庫備份找到文件 | ops Top10至少含p01或p03；不要求p02一定召回 |
| T03 | 二字中文備份仍找得到 | ops Top10包含p01、p02、p03；不能因trigram限制漏掉必要短詞 |
| T04 | 用ERR_CONN_RESET定位排障 | ops Top10包含p04 |
| T05 | 以標題Evacuation找到聯絡資訊 | ops Top10包含p12 |
| T06 | 無結果與故障分開 | absentquartz→200 total0 hits[] |
| T07 | 不交付另一scope搜尋資訊 | ops查secretcobalt→200 total0 hits[]；response不含p06內容 |
| T08 | 受限使用者仍能完成自己的任務 | restricted查secretcobalt→僅p06，total1，原內容與可跟隨URL |
| T09 | consumer能完整翻頁且排序可重播 | ops runbook, pageSize2；三頁聯集恰好p01,p07,p08,p09,p10，無重複／遺漏，total5；重播第一頁順序相同 |
| T10 | 翻過末頁不誤判故障 | runbook page4/pageSize2→200 hits[] total5 |
| T11 | 搜尋後讀取正確正文 | 跟隨T01的URL，release=review-v1，p01原title/content一致 |
| T12 | 搜尋後可完成附件下載 | amberchecklist→p05；follow page→attachment→固定bytes hash一致 |
| T13 | 直接正文讀取仍檢查身份 | ops讀p06→403 FORBIDDEN，無p06內容 |
| T14 | 缺失身份不默默放行 | 缺header搜尋→401 UNAUTHENTICATED |
| T15 | 未知身份不當成可見全部 | unknown搜尋→403 FORBIDDEN |
| T16 | 不合法輸入是可處理的client錯誤 | page0及engine=unsupported各400 INVALID_REQUEST，retryable=false |
| T17 | release不相容不能混版 | page p01?release=other→409 VERSION_UNAVAILABLE，retryable=false |
| T18 | 文字與highlight契約不導致內容混淆 | markertest→p11原content完整；B級null+none合法；有highlight時不得輸出script或其他未escape來源標籤 |

H01加分：T01英文、T03中文至少一個命中excerpt具非空mark片段，去標籤／解碼後內容可對應來源，HTML安全。H02加分：可說明相較原API的highlight／排序差異及client如何處理，但不得聲稱正式client已接受。

## 每輪最低成本揭露與結論

兩輪交付各附：更動模組與理由、引擎原生／adapter補足／依賴能力、前處理／建索引／啟動／查詢成本的已量測與未知、consumer是否須新增引擎分支、快取／記憶體／檔案保留責任。工時以實際投入或明示粗估記錄，不假造精確ROI。

審核組不改實作。交付後凍結round產物／code hashes，獨立HTTP重播和code review，列B級各任務通過／不符合／未驗證、H獨立結果、最高優先修正。Round2同判準重驗；額外發現另標不回頭增加v1條件。所有候選未通過其他V項，不能稱完整DR可採用。
