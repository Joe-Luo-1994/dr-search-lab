# S1-ES 小型 Lexical baseline：獨立審查

2026-11-14。裁定：**通過本輪有限功能範圍；未驗證完整S1百萬容量或正式DR採用。** 使用同一凍結standard-v1／來源／oracle／HTTP harness，實作沒有因測試結果修改契約或增加資源。V1/V2的小型合成共同API證據成立；V6僅mock Space集合。V4只取得此來源的短窗口成本，不是正式SLO或容量上限。

## 證據與執行次數

- 獨立fixture共1107頁。全1107頁抽取text SHA256、UTF-8 bytes、Unicode code points、來源bytes及highlight資格均符合oracle，見 `evidence/s1-es-2026-11-14/reviewer/extraction-audit-attempt1.json`。
- 真Next production → ES8.17.0首次HTTP **24/24任務、56請求通過**，窗口1.365秒；沒有API失敗後修程式求通過。見 `http-attempt-1.json`。
- root發現初次runtime監測未選到Next server，保留監測缺口並修正selector。相同harness唯一資源重播 **24/24、56請求通過**、1.075秒。見 `http-resource-replay.json` 與coordinator/monitor-coverage-correction.json。這是同24任務重播，不是48種能力，不是冷cache／冷程序測試。
- 未知Lexical `secret-widget`在建索引前exit1；成功索引source/mapping/settings digest、1107筆與write block前後不變。見 `unsupported-review.json`。這只證明pre-index validation拒絕，尚未測完整版本原子發布／中途中斷。
- 凍結檔案checksum維持。初始fixture生成使用反覆全JSON序列化，產生O(n²)準備成本，已停止own generator、改為一次bytes估算；前版來源及setup問題保留。這是fixture準備問題，不刪去，也不是ES實測失敗。implementation shell設定問題亦在其setup-failure.txt保留。

## 我們現在能多說什麼

1. **大JSON不等於大搜尋文字。** 結構頁4,490,075bytes，抽取22,149 code points；文字頁4,490,838bytes，抽取4,490,546 code points。兩者能從Next搜尋命中頭尾（文字頁亦測中間），原文bytes/hash完整一致。decimal4.5MB是本輪研究單位，未確認公司MB定義。
2. **有界highlight的代價可見。** 100000 code points頁含emoji、UTF-16長度100001仍正確提供文末highlight；100001 code points頁及4.49MB長文字頁回null/unsupported_length，但文末仍可全文搜尋。HTML來源被escaping；每hit最多2段、每段≤200 code points。這證明限定降級可行，尚未取得consumer接受。
3. **基本consumer鏈有共同契約。** 中英文、技術碼、AND、受信任Space範圍與縮小篩選、無權正文404、未知授權503、total cap的eq/gte、前1000窗口及超限錯誤均符合。相同查詢與release排序穩定；不要求所有引擎排序等同ES。
4. **限制沒有讓服務假裝成功。** 超窗口、pageSize、進階語法清楚拒絕；長頁highlight降級有機器欄位；原文完整讀取分開。8請求的小並行組包含4個大原文讀取與4個小query，均於5秒內正確完成。未測持續流量、尾延遲穩態或惡意查詢取消。

## 成本與不可外推之處

Next production build 12.67秒；1107頁解析／抽取／寫原文／bulk／refresh到可查詢共1.771秒，其中parse54.2ms、extract129.2ms、bulk668.8ms、refresh141.5ms。原Lexical總9,547,375bytes、抽取文字4,755,699bytes；額外highlightText輸入165,149bytes。短文字被額外索引到highlightText，以避免長頁進入highlight分析；此為實作與儲存責任，尚未做有無該field的成本A/B。

prepare當下ES store104,405bytes，另有translog5,165,595bytes；不能只拿store代表總索引成本。實驗runtime artifacts合計88,407,826bytes（含fixture/oracle/source/Next build），需和ES資料目錄分項，不當作純引擎索引大小。這些是高度重複／可壓縮合成資料的觀察，不是容量預估。大文字多為filler，小頁內容亦高度相似；不能用1.77秒或此索引大小推算百萬頁。prepare雖逐行讀來源，仍把所有抽取documents留在array再bulk；此小fixture設計不可直接當作百萬串流build實作。

首次56請求最慢183.6ms、重播最慢130.4ms；成功搜尋回應最大10,120bytes。這是loopback、少樣本、混合錯誤／正文／搜尋的短窗口，不報為正式P95 SLO或QPS。小型有限excerpt讓回應小，並不證明consumer原API無改動成本。

本輪ES固定512MiB heap、既有DR節點、單實驗索引1 shard/0 replica；不是HA成本。coordinator/cost-summary.json記錄build期間ES＋實驗程序採樣RSS峰值1454.44MiB，修正監測後service重播峰值1014.84MiB，均未觸6GiB採樣軟護欄；startup未量。程序RSS相加不等於cgroup／Pod需求，可能重算共享頁、未含所有OS cache；heap不是總RAM，既有封存索引成本也不能忽略。第一輪HTTP的Next監測缺口不能用事後RSS補稱全程完整；第二輪才有修正後覆蓋。

## 剩下缺口與下一步

- 本輪沒有SQLite／Pagefind同S1實作對照，不能結論ES或替代方案總成本較低。
- 尚無百萬量級S1容量、實際長尾分布、長時間混合負載、正式GM／consumer、真MinIO載入／恢復、附件與atomic release故障驗證。
- 原文由本地共同內容層讀取，未驗MinIO網路與權限；mock身份header不是正式可信驗證服務，不能部署成產品授權。
- API成本轉移明列：consumer需另取完整正文、理解gte總數、1000筆窗口與長頁highlight=null。以上限制需核心consumer owner確認；非作者agent審查不等於業務簽核。
- 下一步可在凍結S1契約下做ES的10k→100k→1M控制語料容量，再將SQLite／Pagefind帶入同契約比較；避免以本輪壓縮比估容量。若owner指出必要任務被S1排除，再版本化擴充相應實驗，不重開所有edge cases。

本輪標準通過支持繼續研究，不支持正式DR RTO/RPO、永久服務存活或完整產品採用宣稱。舊MS1失敗保持原裁定。
