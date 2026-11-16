# N1 G0：Tantivy reader 採用資格靜態查核

2026-11-17。只讀本機 source／worker／fixture 及官方 API，未安裝、編譯、建索引或壓測。結論：基本功能有原生 API 路徑，可進小型 G1；不能直接跳百萬資料或宣稱 E 等價。兩項前置缺口是 tokenizer parity 與 E 的 pageId 同分排序。

## 最小 reader 路徑

單一 Rust 專案提供離線 build 與 read-only serve 子命令。Node 以 child process 的有界 JSONL stdin/stdout IPC 呼叫，stdout只放協定，stderr只放診斷。正式 reader 不執行 IndexWriter，MinIO artifact 先下載並校驗到不可變目錄，reader ready 回報 source／schema／tokenizer／binary／snapshot 識別。Next 保留身份、內容路徑與對外契約。

每process初版只接受一個在途request，Node queue有界；維持長壽命reader而非每題spawn。增加process／Tantivy threads均計入同資源預算。EOF／crash／錯協定需拒絕而非無限排隊。外部deadline到期直接終止該child並回收其在途request；不能只Promise.race後讓CPU工作繼續。以小fixture故障注入驗證timeout後無遺留計算，再談自動restart及其ready成本。不宣稱找到Tantivy原生可取消每筆query的API。

## Schema與查詢

| 需求 | 提議原生路徑 | 必須驗證 |
|---|---|---|
| title/body | 各自text field，token frequencies／positions；只store需要回應的title及固定摘要 | body不用store不等於整套資料較小；另計metadata、摘要與內容存取 |
| pageId | STRING／STORED；E若需穩定排序另加FAST排序鍵 | numeric i不是字串pageId排序的等價替代，百萬門檻變為7位數 |
| Space | STRING索引，不走全文analyzer | allowed-space OR與指定Space AND取交集，空集合直接空結果 |
| Tags | 同一STRING field多值，逐個TermQuery以Must相交 | 不可用一個OR TermSet代替多Tags AND |
| 多詞全文AND | 每詞為(title TermQuery boost3 OR body TermQuery boost1)，每詞組之間Must | 可跨title/body滿足詞項；避免QueryParser預設OR或使用者語法改變契約 |
| filters不影響ranking | filter BooleanQuery包ConstScoreQuery(...,0.0)，與全文Must相交 | 少量golden確認未改命中，filter不額外加分 |
| E精確total | `searcher.search(&query, &(Count, TopDocs...))` | count須是全部filters及授權後集合；joint collector對剪枝效能的影響須實測 |
| L不計total | 只TopDocs，response不含total | 不把缺欄位寫成0或approximate |

API依據：[BooleanQuery](https://docs.rs/tantivy/0.27.0/tantivy/query/struct.BooleanQuery.html)、[ConstScoreQuery](https://docs.rs/tantivy/0.27.0/tantivy/query/struct.ConstScoreQuery.html)、[BoostQuery](https://docs.rs/tantivy/0.27.0/tantivy/query/struct.BoostQuery.html)、[collector tuple](https://docs.rs/tantivy/0.27.0/tantivy/collector/index.html)。這些只確認組合能力，未確認本案正確性／效能。

## 不可直接等價的地方

### 排名與同分

[TopDocs](https://docs.rs/tantivy/0.27.0/tantivy/collector/struct.TopDocs.html) 原生同分用 DocAddress 升序，不是pageId；segment／build不同可能改變它。E若維持SQLite `ORDER BY bm25(...),pageId`的產品契約，不能只用原生TopDocs宣稱等價。官方有 `tweak_score`／`order_by`及FAST field讀取，可研究以(score, reverse lexical rank)作排序鍵，但尚未編譯驗證；它是少量adapter候選，不保證保留原生TopK快路徑。

不得只對已取回Top10重新按pageId排序：邊界同分超過10筆時會選錯集合。也不能取所有hits再排序而不把成本明列。若E無法在預算內實作，標E未成立；只跑L時明確記DocAddress同分規則，不把它混入E。

`BoostQuery(title,3)`乘的是該field query score；SQLite FTS5 `bm25(title=3,body=1)`的欄位權重位置不同。兩者可表達title較重要的偏好，但並非數值／排名等價。N1須以任務golden判斷，不拿SQLite順序作Tantivy oracle。

### Tokenization

目前fixture以Node `Intl.Segmenter('zh-Hant')`切Han runs，再交SQLite unicode61；worker的query以Unicode letter/number/mark regex取詞，再交FTS。Tantivy預設analyzer不保證等價，尤其大小寫、diacritics、Unicode分類、長token、offset及position。

建議共同輸入明確的canonical token序列，Tantivy可使用 [PreTokenizedString](https://docs.rs/tantivy/0.27.0/tantivy/tokenizer/struct.PreTokenizedString.html) 而不是再跑預設斷詞；query直接構造TermQuery。但canonical producer仍必須證明與SQLite實際tokens相符，不能只稱同用Segmenter就完成。G1至少比大小寫、中文詞邊界、中英混合、符號、重複詞與較長token；可用SQLite fts5vocab作實際詞項核對。若canonical contract改動，只在新fixture分支重建並明示，不污染原K5。

百萬source的`attachmentknowledge`同時存在body，不是PDF-only extraction證據。PDF抽取文字golden須另有專用案例。source中的pageId在1,000,000處由六位轉七位，更不可把i排序當字串排序。

## 版本與封裝

本輪官方latest解析為Tantivy0.27.0；實作應顯式`=0.27.0`與Cargo.lock，記Rust toolchain、target、build flags、binary SHA及tokenizer/schema version。這只是候選pin，未確認本機compiler／OS可build；Windows PATH查無cargo／rustc，不代表WSL沒有，交由主agent環境盤點。

不假設不同Tantivy版本索引可直接互讀。manifest配對builder與reader fingerprint，升級先build新artifact並保留舊binary／index回滾；版本不符不ready。下載／checksum成功不等於index能開啟，需`Index::open_in_dir`、schema檢查、固定健康query後才ready。IPC payload／schema亦需版本欄位，拒絕未知欄位值或未知身份狀態。

## 建議G0裁定

可給Tantivy一次有界G1機會，無需先證整套TCO；先做小fixture token／filters／count／tie／timeout正確性。尚未證E的tie快路徑、native binary可build、正式中文品質、版本升級相容、熱更新或容量。新增責任至少為Rust鎖版／binary distribution、IPC supervisor、索引schema／token契約及升級回滾；不能因同一deployment就記零維護。

## 主agent環境盤點後補充

主agent回報WSL Ubuntu24 x86_64沒有cargo／rustc及既有cargo／rustup目錄，須隔離安裝才可build。官方 [0.27.0 Cargo.toml](https://raw.githubusercontent.com/quickwit-oss/tantivy/0.27.0/Cargo.toml) 宣告 `rust-version=1.88`、edition2021。可先pin Rust1.88.0；依賴解析後仍須確認整份Cargo.lock實際可build，不能把頂層MSRV視為所有新解析依賴的保證。

[rustup安裝文件](https://rust-lang.github.io/rustup/installation/index.html) 允許以CARGO_HOME／RUSTUP_HOME設定安裝根；本案置於新`.lab/n1...`專用目錄，使用minimal profile及`--no-modify-path`，不改shell或系統Rust。這是建議命令選項，安裝未由本agent執行。

E tie的具體小型候選：離線builder依pageId的字串順序建立唯一`page_lex_rank` u64 FAST欄位；`TopDocs::with_limit(10).tweak_score`的segment closure讀取該欄位，回傳`(original_score, std::cmp::Reverse(page_lex_rank))`。官方方法的TSortKey接受PartialOrd，tuple是可行API方向，但尚未編譯。必須用跨segment與六／七位ID、超過10個同分結果測選取正確性。不要使用原始numeric i，不要先Top10後排序；是否降低剪枝效率另量，列為E的必要成本。
