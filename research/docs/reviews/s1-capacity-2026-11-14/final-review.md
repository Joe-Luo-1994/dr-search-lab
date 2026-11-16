# S1 ES 容量參照：獨立審查

2026-11-14。裁定：**ES在本輪10k／100k／1M純文字控制語料、S1有界API與短工作集下通過。** 這是V4容量參照及V2契約證據，不是正式Lexical長尾、持續SLO、MinIO恢復、GM／consumer或完整DR採用結論。標準、來源oracle與HTTP harness的凍結checksum保持；沒有性能失敗後加RAM、放寬timeout或重播求過。

## 實際結果

| 頁數 | ES準備程序總時間 | 循序任務 | HTTP（含混合） | 80混合操作P95 | 混合窗口 |
|---:|---:|---:|---:|---:|---:|
| 10,000 | 4.305秒 | 20/20 | 105，零失敗 | 44.59ms | 0.466秒 |
| 100,000 | 19.540秒 | 20/20 | 105，零失敗 | 36.52ms | 0.447秒 |
| 1,000,000 | 186.412秒 | 20/20 | 105，零失敗 | 111.08ms | 0.980秒 |

同20種循序任務在三個scale重複，合315HTTP不是60種獨特產品能力。每scale4個closed-loop client×20操作，64搜尋＋16本地原文讀取；p95包含兩種操作，非純搜尋引擎P95。百萬stage全部HTTP窗口2.040秒，最慢請求181.57ms，最後合法窗口page20×50約105ms單樣本。這些數字支持本工作集在5秒deadline內完成，不能當持續穩態QPS／正式SLO，也不能用100k較10k低的短樣本P95宣稱資料越多越快。

測試涵蓋small／huge／all三類可見性（百萬時約501／500000／1000000可見頁），all仍帶1000個Space terms filter，無全站免filter捷徑。common／rare／中文／技術碼、無結果、none、unknown授權、request scope縮小與不可擴權、highlight、穩定排序、前1000窗口、超限拒絕及完整正文hash均符合。百萬rarebeacon命中超過1000時也須明示total下限。這是控制marker查詢，不是正式搜尋relevance、同義詞或所有中文語意的驗證。

## 獨立來源與索引核實

- 三份既有MS1 SQLite以readonly方式逐row讀取；canonical JSONL SHA、總bytes／正文bytes、全部ID與Space公式、筆數及1000Space histogram均與舊manifest相符。各scale9個邊界doc另與獨立generator比完整內容。1M核對耗時8.27秒，已暖source/OS cache，測試不屬冷cache。
- ES準備完成、HTTP量測結束後才做獨立只讀index audit：各scale實際count分別10000／100000／1000000，完整Space histogram、9個實際_source樣本的title/searchText/highlightText/codepoints／release、metadata與write block全符合。這是count/histogram＋抽樣，不冒稱已對ES百萬_source做全量digest。
- HTTP原文預期由公式doc生成，不能用服務輸出當oracle。原文格式為MS1純文字doc JSON，並不是上一輪Lexical JSON。
- reviewer輸入與audit腳本checksum核對保持，見 `evidence/s1-capacity-2026-11-14/reviewer/`。

## 取得了什麼成本參照

固定ES8.17.0／512MiB heap／1shard／0replica，沿既有DR研究節點，不改heap。整輪ES＋本輪Next／建置程序合計採樣RSS峰值約1702.05MiB；1M HTTP期間峰約1644.25MiB（8個採樣點），1M準備約1652.81MiB。均未觸6GiB採樣軟護欄。整輪新產物採樣峰約2.104GiB、最低free約22.33GB，未觸6GiB新增產物或4GiB free界線。

這不是Pod最低需求：RSS相加可能重算共享頁，沒有包含全部filesystem cache；全cgroup峰值含其他程序／cache不可全歸本服務。ES帶有前輪及較小stage索引背景成本。服務HTTP窗口極短，250ms採樣可能漏尖峰；不能把觀察峰當硬上界。詳細phase與限制見coordinator/cost-summary.json、resource-summary.json。

百萬來源canonical約1.232GB，正文1,099,749,124bytes。所有頁均低於100k codepoints，因此本參照實作又把幾乎全部正文複製到highlightText：額外原始輸入同為1,099,749,124bytes。這是保持與小型S1實作相同的highlight策略成本，**不是ES必然或最低儲存需求**；尚未做移除該欄位的成本A/B。

百萬prepare觀察ES store1,287,239,865bytes，另有translog48,407,692bytes；較晚merges／flush會改變數字，後測stats另存，不能取代先前觀察。需另計原文層、runtime依賴、保留版本與staging，不能只拿store當整個方案成本。10k／100k store分別約14.37／138.07MB，當時translog約24.20／242.04MB，兩者必須一起看。

本輪改善前輪小fixture的全documents陣列：從既有來源逐row讀、每批最多500文件／5MiB、有await背壓；百萬2000批、實際最大bulk1,198,716bytes。此為新增開發責任，容量結果基於此實作。來源舊SQLite約2.133GB同時含MS1 FTS；它僅是現成合成正文測試載具，非新增SQLite服務，也不代表ES正式方案需要部署它。不能把整個舊FTS檔案當ES必要正文容量。本次量到的是ES＋Next＋本地正文路徑，沒有MinIO網路／可用性成本。

## 保留的程序偏差與失敗證據

Next build凍結標準180秒，但實作wrapper沿root最初提議設600秒；實際12.081秒完成，符合觀察時間門檻，但**沒有正確配置180秒watchdog**。此為協調／執行偏差，未重建或改標準掩蓋；見reviewer/execution-deviation.json與implementation/build-guard-deviation.json。ingest600秒、HTTP5秒與資源門檻保持。

root後測stats查詢誤用merges收到400，改用有效merge欄位取得觀察；原錯誤保留，沒有對功能工作集重播。這不影響已完成HTTP及index audit，亦不是引擎容量失敗。其他舊MS1／S1失敗或監測問題保留原裁定。

## 下一個決定

ES可以保留為**已實跑到百萬控制語料的S1參照**。下一輪應讓SQLite／Pagefind在相同S1契約、來源及資源口徑比較，不直接拿舊MS1的深跳／精確total／內嵌正文、無highlight結果排速度名次，也不把舊SQLite第100000頁超時改判通過。

仍未回答：正式Lexical大小與Space分布、較高或持續負載、真MinIO讀取／索引發布／恢復、正式GM與撤權、consumer是否接受分離正文／total下限／前1000筆／長頁無highlight、HA及完整RTO/RPO、接手與維運成本。這些缺口不阻止下一輪有界比較，也不能因本輪通過就視為已解決。
