# H1：Tantivy 能 highlight，但現行中文分析不能直接套用

2026-11-17｜有限實驗已停止，未修改正式runtime／部署或N1/R0/C1證據。

**決策：保留Tantivy候選，但不能把目前組態的中英文highlight標成已支援。** 官方功能能產生有上下文的英文摘要；現行N1預切詞與預設snippet分析器不一致，造成中文與組合音標「搜尋命中、摘要空白」。不為此更換搜尋語意或自製完整highlighter。

## 使用者看到的差異

| 查詢／情境 | 既有前160字 | 官方snippet實測 | 意義 |
|---|---|---|---|
| backup在文件末尾 | 只有Introduction，看不到命中 | `Introduction. Final <b>backup</b> instructions` | 可以解釋為何找到這篇 |
| 備份／每天執行備份並驗證文件 | 看得到原文 | 搜尋命中，但摘要為空 | 中文整合不合格，不是Tantivy沒有highlight API |
| 備份／備份操作指南title | 有標題文字 | title摘要為空 | 不能用「只做title」直接解決中文問題 |
| café／單一é字元 | 原文 | 正確標示 | 此案例通過 |
| café／e＋組合音標 | 原文 | 搜尋命中，但摘要空白 | Unicode分析一致性也需處理 |
| backup recovery | 有兩詞 | 分別標示兩詞，即使不相鄰 | 現行契約是AND詞項，不是片語匹配 |

完整20題對照見公開包的 `CASES.md`，包括HTML輸入、emoji、PDF換行與斷字；全文、預先期待值及原始輸出保留。沒有真人評分，不把案例可讀性當正式使用者滿意度。

## 正確性結果與停止點

- 20/20搜尋命中／不命中符合預先期待；16/20整體案例通過，4個highlight失敗：`zh-word`、`zh-title`、`zh-mixed`、`combining`。16包含3個預期不回結果的案例，不是16個成功highlight。
- 全部實際輸出通過原文片段歸屬、UTF8範圍、文字與HTML一致性、HTML只含官方`b`標籤且原文字元escape檢查。合成denied案例沒有輸出snippet；這只是程式分支測試，不是正式ReBAC驗收。
- 因上述失敗，**未接入Next／API、未跑端到端負載、未修改索引或正式搜尋結果**。按事前設計，只繼續對成功英文路徑做獨立成本診斷，不將它升格為候選通過。

來源走查：N1的`src/main.rs`使用`PreTokenizedString`寫入Node `Intl.Segmenter('zh-Hant')`產生的詞，title/body schema卻仍為`TEXT`預設分析器。官方`SnippetGenerator::create`依field的分析器重新掃描提供的原文。實測失敗與這個不一致相符；不是對所有中文tokenizer或Tantivy上限的判斷。組合音標案例亦顯示不能只檢查ASCII。

N1 index只儲存payload中的title與正文前160字，title/body沒有STORED原文。R0沿用SQLite有content且metadata worker用SELECT*，因此本地有可能重用原文；但未驗來源版本／完整PDF抽文與取文成本，不假定一定要去MinIO，也不宣稱免費取得。儲存原文於Tantivy的產物大小／下載成本本輪未量測。

## 有界成本測量：只回答摘要運算，不回答RPS

固定1 CPU／512MiB、swap0；Tantivy0.27.0、Rust1.90、Node22.18／ICU版本見fixture。20文件小索引提供query詞頻；原文已在記憶體。每批10份相同大小英文文字，命中置於結尾，包含官方generator建立、完整掃描、highlight檢查與HTML產生。**不含百萬索引搜尋、授權、SQLite／MinIO取文、IPC／HTTP或Web競爭。**

每個尺寸3個區塊，各5對暖機＋50對正式baseline/highlight，順序交替。共1,200正式批次＋120暖機批次；下表為三個區塊各自P95的範圍，不混合百分位。

| 每篇原文實際bytes（約略大小） | 每批10篇官方highlight P95 | 每批現算前160字 P95 |
|---:|---:|---:|
| 1,032（1KiB） | 0.044–0.047ms | 0.0028–0.0031ms |
| 10,248（10KiB） | 0.349–0.362ms | 0.0028–0.0032ms |
| 102,408（100KiB） | 3.399–3.623ms | 0.0031–0.0050ms |
| 1,048,584（1MiB） | 35.095–36.120ms | 0.0065–0.0079ms |

全數低於事前100ms/批的診斷預算；它只是既有2秒研究門檻的5%，不是產品SLO。這是短時間closed-loop成本screen，不是open-loop吞吐壓測或服務容量保證。相同英文內容、暖記憶體與單查詢不能代表正式分布。baseline是**現算**前160字；現行N1是建置時預存，不能把此差值當現有API增加的精確延遲。

診斷unit約6.967秒、CPU累計6.354秒；cgroup採樣peak16,207,872bytes（約15.46MiB），不代表完整app需求。最小採樣Windows available約14.42GiB，未觸6GiB護欄；沒有採樣OOM/swap。建置重用離線依賴、2CPU／2GiB配額，實際約2秒。各unit結果inactive/MainPID0，沒有啟動Kubernetes或MinIO。

## 維護代價與下一個決策

若highlight仍屬加分項，第一版可保留現行摘要並清楚不承諾命中標示。若團隊要納入，最小下一步是**以相同token語意與原文offset接合官方snippet**，先用這4個失敗案例驗證可否低成本修正，再決定是否值得整合。不是先改用另一種中文切詞讓demo通過；改搜尋分析器會重開召回／排名驗證。

需擁有的額外責任：分析器／版本一致、可信原文取得、僅對已授權當頁結果產生摘要、錯誤fallback、安全呈現與延遲預算。Rust highlight範圍是UTF8 byte offset；前端JavaScript字串索引不能直接照用。此次只驗Rust byte切片與HTML輸出，沒有宣稱JS轉換已做。

停止理由：已得到一項會影響採用的未知答案——官方預設不能直接滿足目前中文契約。此時擴大HTTP／百萬頁壓測不能修正語意差異，因此不繼續。下一步是否處理offset接合由團隊按價值決定。

## 證據與研究限制

公開包含事前PLAN、fixture／預先期待、Rust與runner／analysis來源、Cargo.lock、原始cases／1,320批次timings、資源與退出receipt、checksum manifest。保留4個失敗，沒有修改期待值或重跑至全綠。

程序限制：診斷成本段依計畫可在G1 mismatch後獨立執行；實際runner未設機器化G1→HTTP gate，因本輪根本沒有HTTP階段。100ms P95預算為離線檢查，未實作逐尺寸自動停止；本輪所有點均低於預算，硬資源／runtime護欄仍生效。原計畫提到process RSS，但只收得cgroup memory，報告不冒稱process RSS。自我審查，不是獨立review或真人品質研究。

官方API：[SnippetGenerator](https://docs.rs/tantivy/0.27.0/tantivy/snippet/struct.SnippetGenerator.html)；實驗實際讀取鎖定0.27.0套件的snippet來源，未依賴網站latest版本推測行為。歷史N1/R0/C1結果未改。


## 公開證據入口

[20題對照](CASES.md) · [完整合成輸入](fixture.json) · [機器彙整](analysis.json) · [事前設計](PLAN.md) · [程式與原始證據包](source-and-evidence.tar.gz) · [逐檔checksum](manifest.json)

Archive SHA256: `0ff338345eff0fe696dd0f69658784dbf0de8e60b951e4cfe26f032777ee055f`。解壓後依manifest的publicSha256驗證；originalSha256指未清洗本機原件，不與公開副本混用。runner保留環境特定設定但個人路徑已替換，需配置工具鏈；不宣稱一鍵重現。
