# H2：結果卡片的中英命中摘要可行，但要有界取文與明確擁有者

2026-11-17｜**隔離可行性研究，不是runtime功能交付。**

**建議：保留為Should-have。** 小型Node位置adapter在不改N1檢索語意的前提下，修正H1四個反例，能顯示原文第5,000字附近的命中。沒有必要為這個功能移植另一套中文搜尋分析器或把所有正文複製進Tantivy。若團隊不願承擔原文取得、Unicode與版本／授權接合責任，就省略highlight；同快照、已授權的純文字preview是待Product確認的fallback。

只處理搜尋結果卡片；不做開啟文件內highlight、命中導覽、PDF座標或viewer功能。原閱讀／下載流程沒有變更。

## 1. 兩種最小方式與選擇

| 做法 | 根據實際API／原碼能怎麼做 | 新增責任與判斷 |
|---|---|---|
| 官方SnippetGenerator＋相容分析器 | 0.27.0 `create`取field tokenizer並用query詞頻；`new`可傳詞權重、TextAnalyzer及field。Token的offset是原文UTF8 byte位置。可實作接受Node詞／原文位置的Tokenizer橋接；不必換索引搜尋分析器 | 仍要先完成Node原文mapping，再跨IPC傳原文／詞／offset，實作Rust tokenizer stream並維護版本。若改用Rust另一套中文切詞則有語意漂移。本輪只走查API，沒有實作或測效能；不是宣稱官方做不到 |
| **Node原文位置adapter（本輪選擇）** | 沿現有Han-run Intl.Segmenter＋L/N/M regex＋lowercase語意，額外保存原文UTF16位置；匹配query詞，取第一個命中附近約160 grapheme視窗 | 不重做檢索／BM25／排名，只挑結果摘要。不需新Rust橋接／索引schema；但仍有位置mapping與token parity維護。不是零成本，snippet選窗也不等同官方權重選窗 |

H1的pretokenized offsets屬於「加空白後的token串」，**本輪完全不拿它當原文位置**。adapter保留每個原文字元位置，插入的空白沒有原文位置；每個token必須能從原文切回、lowercase後等於既有token。所有案例比對import的N1 `normalize`產物與token序列，並用凍結N1 binary實際檢索。

永久實作應讓builder/query/snippet共用同一份token規則並鎖Node／ICU版本；研究adapter是獨立入口，這項整合尚未完成。所選視窗允許遠距AND詞只顯示其中一個；沒有宣稱片語匹配或所有命中全覆蓋。

## 2. 原文真的在哪裡？

| 實際路徑 | 走查／觀察 | 本次選擇及未證部分 |
|---|---|---|
| N1 Tantivy payload | `tantivy/src/main.rs` title/body為TEXT，非STORED；payload只有title、正文前160字與metadata | 不能從payload製造第5,000字附近的摘要；不新增全正文stored field |
| SQLite `pages.content` | `c-million-20261116/fixture.mjs`第97–131行寫完整p.content；遠端published JSON的body來自同一p.content。R0 metadata worker第5行SELECT*，page op可回content但search op未用它 | 本輪唯讀抽查既有百萬DB前10列，content各1024bytes，schema／snapshot與輸出已保留。沒有掃百萬內容，也沒有以SELECT*宣稱正式授權／PDF來源成立 |
| source/index綁定 | R0 `preloaded.mjs`驗metadata/source/index hashes、snapshot、sourceSha及referenceManifest；service pin active pool版本，search檢查snapshot | 產品應沿這個已驗證release取得原文；spike僅模擬版本及canonical metadata檢查，不能用同名snapshot字串取代完整hash／信任鏈 |
| MinIO閱讀與附件 | R0 service page/media先查page與allow，附件另查page.mediaId；讀descriptor hash後確認pageId／snapshot | 保留原路徑。本輪不逐結果抓MinIO、不抓PDF、不做新S3服務；避免每頁最多10次遠端下載與大物件buffer |
| PDF抽取正文 | 使用者確認MariaDB有PDF抽文；目前合成DB沒有可證真實page/media/PDF抽文版本來源的資料 | 正式export是否把同版抽文放進pages.content仍未知。須有可信page→media關係與抽文lineage；不從附件ID推定可讀，不把一般合成content當PDF驗證 |

**最小來源候選：** 當頁至多Top10，先依同版canonical metadata與Space/Role授權，再從已驗證release的本地SQLite取純文字。media衍生頁還需可信page→media關係。長期應是受限metadata worker中的批次介面，不在Next主執行緒逐篇掃描；本輪只在獨立Node程序直接SQL測可行性。

限制：每篇64KiB、每批256KiB；超過則用已授權同版stored prefix，不宣稱覆蓋全文。SQL先量bytes再取content，避免把巨大文字帶回JS；**不保證SQLite內部讀頁／CAST長度計算無大檔成本**，正式可考慮可信預存長度或受限worker timeout。現有worker SELECT*本身也非低成本證明。若未來metadata瘦身刪掉content，這條廉價來源就消失；不能為Should-have無條件保留3.31GB舊FTS／正文或重建另一份語料。

## 3. 正確性證據與保留的失敗

最終attempt2共34項檢查：29個搜尋／摘要案例、1組3文件title boost＋tie／exact total、4個信任邊界反例。凍結N1 Rust binary SHA256為`7d841c4aaf753bd196e8a0fa70d6589853821ad851bf3a8adccc1bbd0d621add`，僅建立專用小索引／SQLite。正常已授權結果的原始response、順序、score與total在裝飾前後不變。

| 案例 | attempt2結果 | 邊界 |
|---|---|---|
| H1四個失敗：zh-word／zh-title／zh-mixed／combining | 全部有正確原文命中span | 不是改H1 oracle；H1原失敗保留 |
| 中文第5,000字附近 | 摘要原文起點4850（UTF16 offset），包含備份 | 不是在原prefix加粗 |
| 英文遠端命中 | 起點5861，包含backup | 視窗只取命中附近 |
| emoji／組合音標遠端命中 | 起點5432，組合音標與backup皆正確 | 驗UTF16切片→UTF8 bytes→原字串round-trip，不代表所有Unicode案例已窮盡 |
| title-only | title標示，body安全plain fallback | 不製造body命中 |
| AND詞距離很遠 | 搜尋需兩詞；摘要只標示第一個附近的backup | 合乎本次「不需同窗顯示全部」要求，非片語 |
| oversize／missing source | 同版已授權prefix，ranges空，附原因 | 不改取文上限來湊成功 |
| denied／unknown／version mismatch／media mismatch | 不讀正文、整筆結果不輸出；不存在殘留SECRET prefix | 合成callback，不是公司ReBAC證明 |

**attempt1不能當安全完整通過：** 原檢查只驗`preview=null`，自我審查發現spread input hit仍保留舊`snippet`，在偽造／過期結果場景可能洩漏prefix。原碼、輸出及REVIEW保留；唯一一次修正改成信任失敗時整筆不輸出，補驗空hits／沒有SECRET／sourceReads0。這不是把失敗期待改成綠燈。

此抑制只示範安全邊界；正式遇版本／授權漂移應由既有API契約fail closed或重新執行授權檢索，不能悄悄刪hits卻仍聲稱舊exact total正確。正常已授權路徑不改total。prototype尚未提供完整API錯誤契約。

## 4. 通過後的小型Top10增量成本

1CPU／512MiB／swap0；Node22.18.0／ICU77.1。兩個profile各3區塊，每區塊5暖機＋20正式批次，共120正式／30暖機。順序固定，暖本地檔案，無cache flush；不是open-loop壓測、不測最大RPS。

| 每批10筆 | 既有DB前10列（各1KiB，無匹配fallback） | 小索引真正Top10（每篇約15KiB中文、命中末端） |
|---|---:|---:|
| total P95（三區塊範圍） | 0.458–0.546ms | 54.345–57.741ms |
| metadata＋合成授權 P95 | 0.059–0.066ms | 0.267–0.468ms |
| 本地量長度／取文 P95 | 0.078–0.092ms | 0.556–0.573ms |
| token／offset／視窗 P95 | 0.268–0.362ms | 53.472–56.753ms |
| JSON格式化 P95 | 0.015–0.016ms | 0.028–0.032ms |

各欄百分位不能直接相加。total還含prepare／結果組裝；既有DB profile是取文診斷，不冒稱其10列是某query的Top10。late profile是凍結binary選出的10個不同page，內容同樣且合成；兩profile不是同資料A/B，不做引擎倍率。所有點低於100ms/批診斷門檻，非正式SLO；排程、IPC、真正ReBAC、完整搜尋與HTTP／Web競爭不在時間內。

attempt2整個unit約4.42秒、CPU3.98秒、peak146.8MiB（含小索引建置／reader／Node／SQLite），不能當snippet常駐或正式Pod需求。退出inactive/MainPID0；既有DB以readOnly開啟，前後size／mtime一致，未重hash整個3.31GB檔。沒有啟動Kubernetes／MinIO或改部署。

## 5. 正式接合草圖（未實作）

1. 固定release的Tantivy檢索仍回原pageId／排序／total；信任的授權流程先完成page／Space／Role判定，不信任client送來的space／mediaId。
2. 同一版本metadata worker確認page及必要media membership，受限批次取原文並生成摘要。若hash／版本／授權有矛盾，由整個API fail closed，不混版拼結果；純取文缺失／太大則走已授權prefix fallback。
3. 新增可選欄位，例如`preview: {text, ranges:[{start,end}], unit:'utf16', reason}`；range為相對snippet的半開區間。外部非JS consumer依明示unit轉換；不把Rust UTF8 byte直接當JS字串索引。
4. UI用text nodes／框架escaping切段，再用`mark`包已驗證range；不用任意innerHTML。結果點擊沿原pageId／版本URL，正文／下載仍走原MinIO授權路徑。
5. prototype僅回純文字與ranges，公開案例由離線程式escape後標示。無前端／API改動、無新schema、無索引大小增加或新的runtime部署單元。

fallback不是萬用：未授權／未知／版本或membership錯誤不得輸出原prefix；oversize／缺原文／找不到可映射命中才可在已授權同快照前提下顯示plain preview。來源不可用的例外處理、worker超時／queue回退與整批超限分支仍需產品接合測試；本輪已驗missing／單篇超限，不宣稱所有運維失效情境已覆蓋。

## 6. 新增的永久責任與停止理由

- tokenizer／Node ICU parity與原文mapping：大小寫、混合字界、組合音標及版本升級回歸。
- 原文取得與版本綁定：PDF抽文來源、metadata瘦身、byte上限及source/index同版；不新增遠端逐筆抓文當預設。
- 授權與降級：先授權後讀文、unknown拒絕、不可洩漏舊prefix、產品可接受的缺失／大檔fallback。
- UI/API ranges契約與安全渲染；worker計算預算／超時、fallback原因計數及owner。

這些是明確責任，不換算猜測人時。adapter約數十行不代表低維運已被證明；54–58ms中文批次也不應放在Web主event loop。若團隊已有Node／metadata worker owner且願意共享token規則與測試，這是**小型、可信的候選機制**；若必須另建全文儲存、移植另一套分詞或無上限遠端取文，就延後或省略。Should-have不重開Tantivy選型。

已回答可行性與成本方向，因此本輪停止；不自動做產品整合或更多benchmark。研究為agent自我審查，未經獨立review／真人摘要品質驗證。

來源：N1公開commit `7a08707ed3eedd675c805b8eaa5cf06b0feec9ab`與R0 `a42b8664be76558c6aedfaeffdc3918b7269114e`的研究包；H1 `2f6da1980a9cb2df356263a61f5b387faab41e3c`。官方[SnippetGenerator](https://docs.rs/tantivy/0.27.0/tantivy/snippet/struct.SnippetGenerator.html)與鎖定套件的Tokenizer原始碼已走查。本包附來源檔hash／節點環境、兩次原始證據與可重算analysis；runner依本機工具鏈，公開路徑清洗，不宣稱一鍵重現。


## 公開證據入口

[案例對照](CASES.md) · [合成輸入與期待](fixture.json) · [可重算結果](analysis.json) · [事前設計](PLAN.md) · [程式／兩次原始證據](source-and-evidence.tar.gz) · [逐檔checksum](manifest.json)

Archive SHA256: `8b45ffbc387b4ddf68562459b1e4443be3cc68f466ee5374a98543de24ea951f`。解壓後用publicSha256驗證；originalSha256指未清洗原件。公開runner路徑為佔位，需既有Node／N1 binary與SQLite設定，不宣稱一鍵重現。analysis可在對應檔案結構下離線重算。

既有來源：[N1](https://github.com/Joe-Luo-1994/dr-search-lab/blob/7a08707ed3eedd675c805b8eaa5cf06b0feec9ab/research/n1-20261117/README.md) · [R0](https://github.com/Joe-Luo-1994/dr-search-lab/blob/a42b8664be76558c6aedfaeffdc3918b7269114e/research/r0-20261117/README.md) · [H1（含原紅案例）](https://github.com/Joe-Luo-1994/dr-search-lab/blob/2f6da1980a9cb2df356263a61f5b387faab41e3c/research/h1-highlight-20261117/README.md)。
