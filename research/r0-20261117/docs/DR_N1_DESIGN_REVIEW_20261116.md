# N1 設計獨立審查

2026-11-17。Reviewer：n1_design_review。唯讀核對 N1 設計、K4 查詢成本、K5 配置及限制；未執行實驗，未修改實驗卡。此審查不宣稱 Tantivy 效能／相容性已驗。

裁定：**可先做 G0 盤點；以下四項在各自 gate 前關閉後，才進入相應測量。** 不需增加引擎、正式資料或重新做歷史實驗。現行整體方向、沿用受控來源、A/B 邊界、完整資源accounting與失敗保留是合理的。

## 必要修正

### R1 — E/L 排序契約尚未對稱（G1 前阻擋）

現卡要求 SQLite E 保留 pageId 次排序，L 才可移除；Tantivy 只寫原生 TopDocs，沒有對 E 的相同分數排序義務。同時 E→L 可能一次改 total 與次排序，若直接將差距稱為取消 count 的收益會錯誤歸因。

最小修正：在 G0 凍結每配置的排序表。E 明確保留現行 pageId tie-break，兩引擎都遵守；若原生能力不足或需客製，照實記採用成本／未完成，不以普通 TopDocs 冒充相同 E。L 可允許引擎原生同分順序，但明示是「無精確total＋同分順序放寬」的能力包，不把差距全歸因 count。若希望測 count 的純效果，只增加一個同排序的有限診斷對，不擴 G3 矩陣。

原生 BM25 同設3/1不代表跨引擎數值／排名等價；現卡已承認此點，保留即可，無須實作共同ranking公式。

### R2 — 正確性 oracle 與排名通過門檻需具體（G1 前阻擋）

目前「所有命中符合來源」「目標Top10成功率」不足排除只回任意一筆合法文件、重複文件、空結果或未正確執行排序的實作。未預先給門檻也可能事後選擇有利案例。

最小修正：golden 卡事前列 expected eligible set／count、必找與必排除、預期回傳數 min(10,eligible count)、唯一pageId、欄位／摘要與版本；對明確known-item情境要求全部 must-find 進Top10，不以平均成功率稀釋必要案例。大量同分百萬題允許不同合法ID，但必須驗足額、無重複、授權／filter完整。排名至少加入非同分小語料的 native score 單調性／title-boost明確案例，分數正負方向由adapter記錄；這是實作健全性，不是以另一引擎排序當答案。研究oracle工作不要跑進被測reader cgroup或被算為引擎時間；若在client熱路徑驗證，須監測generator是否因此掉發。

### R3 — G3 發送與期限的時間起點需一致（G3 前阻擋）

卡片以預定到達計延遲，卻僅說query外部deadline4秒。若timeout從實際送出才開始，generator已延誤的請求可占用額外時段；若暖機未drain或成功請求尚在完成，分母也可能不一致。

最小修正：固定每請求 scheduledAt／sentAt／completedAt／deadlineAt，端到端deadline=scheduledAt+4s（閱讀／下載若不同則另列）。已過deadline未發送記generator漏發／未完成，不瞬間補送積欠流量。暖機與測量使用獨立request標籤；結束後有界drain，完成仍歸原測量到達窗。每lane預定數為失敗分母，成功延遲與失敗率並列；generation validity 未過時不得判候選容量失敗。記實際stage外部deadline及只清理本輪process group。這些是harness檢查，不需先壓測才修。

### R4 — 預算內的執行優先序與重試需凍結（G2 前阻擋）

兩引擎×E/L×兩資源×三次W/M加baseline／更新，可能用盡8h；「值得繼續」「大幅超過deadline」也留下事後選擇空間。Tantivy從零建置與SQLite沿用的投入本來不對稱，2h不足不能寫成引擎較差。

最小修正：明訂30次是每block每shape或跨block總數；固定執行順序及剩餘預算檢查。先完成兩引擎 G1/G2，再做4CPU E共同點；需要降級才做L，只有已識別資源壓力才做8CPU。一次配置／階段失敗即停止該次升階，保留資料；三次都通過才稱repeatable。錯誤修復最多一輪且另attempt，超時／額度耗盡列「研究未完成」而非引擎不適用。進G3至少要求G1全過、無未處理crash、G2各shape在4s期限內有完成樣本；邊界慢題若停止需列明哪個門檻，不以平均×RPS推算。最好把活躍工程6h作可追蹤session區間預算，無法可靠量測則同時用既定變更數／attempt上限，不虛報精確人時。

## 非阻擋但必須保留的限制

- K4 count與Top10皆包含MATCH/join/filter，不能直接當純operator成本或預測去count後吞吐。
- K5是短窗／重複合成語料工作點，不是最大RPS；N1新長窗不能將跨日結果當純優化因果。
- 一次更新只證更新受控路徑，不能與三次穩態通過合併稱完整DR可靠；O1不同build不可直接借用。
- 建議G0實測builder／新舊雙版磁碟需求，60GiB上限不足時記資源限制，不能刪既有證據挪空間。MinIO可用性／壓力須分列。
- 下載2秒是新的研究門檻，不是正式要求；保留固定附件大小與觀察窗、避免拿小檔通過推論任意PDF。
- 不必為review增加更多元件或要求正式ReBAC。共同合成授權契約、版本／身份拒絕及既有MinIO鏈足以做本輪有界研究。

## 關閉證據

主agent修正實驗卡後，提供契約表、golden schema、發送／deadline規則與執行順序。Reviewer可先確認文字閉環，再於G1／G3前讀實際oracle／controller是否相符；文件通過不等於harness已驗。四項均可在既有scope內處理，不需要使用者新增產品決策；正式降級接受仍保留未知。

## 2026-11-17 修訂複核

已讀實驗卡頂端「執行修訂」R1–R4。四項文字層級阻擋已關閉：E跨引擎pageId tie、L能力包不作count純歸因；golden足額／唯一／必找與排名健全性；scheduled deadline／arrival分母／drain／instrument-invalid；每block樣本數、預算與固定升階條件。

允許主agent依卡進G0／G1準備。此裁定不替代實際oracle／adapter／controller審查；SQLite G1 runner待實作交付後另核，G3時間與取消機制則於G3前讀碼核對。下方原設計狀態由頂端明示優先修訂覆蓋，不構成阻擋。

## SQLite G1 實作預審（等待一項補正）

已讀adapter／golden-fixture／golden runner／README。S0/S1 E/L都保留pageId tie，unknown identity fail closed、filters在LIMIT前、L缺省total而非偽值、原生score排序與title-boost皆有明確斷言。同步reader需由父controller隔離與外部deadline，模組本身不宣稱已處理。

唯一小fixture執行前缺口：現有31題皆小於Top10，tie插入順序與pageId相同。請加至少12筆同分文件、逆pageId插入，凍結完整eligible集合及E前10順序，驗total>10／足額／unique。runner應把eligible集合和returned Top10分開，避免將returned全等eligible誤用於大結果。這也能抓Tantivy E誤用DocAddress tie。已傳實作agent；補正後再核。

## SQLite G1 補正複核

已確認32案例含12同分反序插入、跨位數pageId lexical前10，runner分eligible與returned，E count=12、兩SQLite配置L也保留tie。小fixture內容阻擋關閉，可開始執行；不等Tantivy。

外層run-sqlite-g1.py已設systemd CPU／RAM／RuntimeMaxSec及finally stop。執行前需補捕捉TimeoutExpired並保存controller receipt（目前timeout會使r無值、跳過receipt）；已通知主agent最小修正。這項不改實驗契約，修後可直接執行，不要求新增review輪。

## Tantivy G1 實作預審

已讀Cargo.toml、src/main.rs、export-golden.mjs、golden.mjs、README。typed query為詞項AND／title-body OR，Space與Tags為零分必要條件；E用score加反向lexical-rank tuple，L保留原生tie；來源lexRank按pageId字串排序；共用12筆cutoff案例可抓DocAddress冒充E排序。未見阻擋小fixture的核心契約問題，build成功後可開始受控G1。

必要小修：golden.mjs原passed僅依failure，最後一題後child非正常退出／cleanup kill可能仍報pass；須要求exit code=0且無signal，否則記failure。父controller仍需保存超時和退出證據。

邊界保持：共享token函式非獨立parity證據、自然segment數待讀、未驗強制跨segment排序／實際索引詞項、未做production lifecycle／併發／G3。這些不阻擋小fixture，不由此批准G2／G3。固定fixture之外Unicode分析一致性仍需G0/G1後續核對。

## SQLite vocabulary／百萬 screening 預審

vocab-check.mjs實際讀fts5vocab instance並對手寫詞與offset，可執行小fixture。對照原source.mjs，21shape的獨立source-rule count／eligibility與V1/V2規則一致；足額／unique／欄位／版本／E總數及S0/S1有序parity有檢查。一次query加EQP只是screen，不能借名formal G2或API SLO。

阻擋：probe.mjs父程序做百萬×21 oracle掃描且逐結果驗證，直接整個runner放reader cgroup會違反oracle配額外約定。需保持父harness在配額外，僅child進受控cgroup且在查詢前確認；否則只能明示為不採效能數字的儀器預檢，不能稱4CPU引擎結果。已通知主agent／實作agent。

其他保全建議：DB stat變化目前裸assert發生於result寫入前，應轉為failure以保留result；外層仍負責fullhash／cleanup receipt。第一fail停止整輪可接受，但未測後續配置不可標fail。

## G1 receipt與vocabulary失敗裁定

讀回Tantivy G1 result：64 attempts、passed=true、child exit0／無signal，僅小fixture成立；單segment、共享token與未驗正式語言品質限制保留。

SQLite原vocab fail定位g05 title：固定Node22.18／ICU77.1對完整「排程維護」切為排／程／維護，與手寫預期「排程／維護」不同。diagnosis實讀52欄位並保留相同DB SHA前後，故批准新vocab-check-v2只更正此字面oracle並重跑，原失敗保留、不改tokenizer／DB。

這是固定分析器的預期校正，不是改善中文品質。對完整文字逐欄index/query parity，不證明任意獨立短query在不同分詞context下皆可找回；不得將此升格為正式語言需求已滿足。

## quota外screen v2與Tantivy source/screen複核

SQLite probe-v2已將父oracle留quota外，child由systemd讀回4CPU／8GiB／swap0、PID與cgroup membership；stat錯誤會落result。Tantivy export來源hash／seed／count／版本閘與lexical rank，以及screen的oracle／E score/tie檢查可接受。

兩screen執行前小修：systemd加TimeoutStopSec=2s及KillMode=control-group；stdout/error/exit handler對active process加guard，避免SQLite上一cfg wrapper退出誤拒新cfg pending；4s timeout先記deadline事件再cleanup，不把cleanup耗時當query延遲。修後可做有界screen，不需新scope。

Tantivy screen仍回nativeScores、SQLite screen不回，screen數值不能直接當公平效能排名；formal G2前統一診斷投影或明確分開。Tantivy meta stat不等整index完整性，parent仍需full freeze/hash。source exporter的共用token流程仍不是獨立正式語言證據。

## 百萬screen結果審查與formal G2範圍

讀回SQLite 84/84與Tantivy E 21/21結果及raw ready／cleanup。ready確有4CPU／8GiB／swap0、stop2s／control-group，parent在reader quota外；全部clean且pid不存在。cleanup後transient unit properties顯示infinity屬卸載後讀回，不能用來否定ready的實際限制。尚需主agent將完整index／輸入hashafter閉環，meta stat不是全索引hash。

允許最小formal G2只做E、21shape保留且9legacy／12probe分層；每shape每block30、三block，沿計畫交錯引擎順序。screen一次觀察不能當倍數或容量。S0／S1沒有可由單次screen判定的穩定差距，選S1原生rank作候選合理，但保留少量S0同session控制且不稱最優配置。

投影對齊：兩邊都回nativeScores可接受為明示G2診斷契約，不需為此修改Rust binary。SQLite開includeScores後先有限正確性／有序parity確認，不能與不回scores的screen直接算收益。G2仍不是正式API，若後續測無診斷API須兩邊共同關閉並記新配置。

暫不需要L、擴容或更換schema；E若已足以支持下一個決策，不必為填滿矩陣多做。Tantivy與SQLite單題數值有明顯差距值得正式確認，但缺乏正式語料、G3與維護差額，仍不能宣告Tantivy架構勝出。

## Formal G2 runner預審與G3拆階

已讀formal/run.mjs、systemd-reader.mjs、sqlite-child.mjs：E-only、21shape、三warm round＋30measure round、同block seed shuffle；S0同session控制與S1有序parity、兩邊nativeScores、父oracle quota外、ready資源讀回、4s截止先記事件與2s stop均符合修訂。凍結後可執行，沒有新增阻擋。

以roundTrip作共同邊界；nativeMs兩實作起點不同（SQLite compile在計時外，Tantivy含query建立），只作各自診斷，不直接求引擎倍率。單unit CPU／IO統計包括warm、控制等階段，不能直接除630當純query成本。三block與原始結果須保留，不用聚合掩蓋單block失敗。

原則同意G3拆成a預載search替換／保留metadata及MinIO，b真artifact下載與V1→V2更新。這是先縮小整合未知，不取消完整G3目標。G3a過只能證穩態整合工作點，不能稱更新／復原通過；保留SQLite metadata的RAM／磁碟／版本責任必須算入Tantivy配置。具體G3proposal仍須另讀，未由本段直接批准G3實作或完整方案結案。

## G3a 接縫方案預審

已讀g3a/PLAN.md，同意預載同版Tantivy search替換＋原SQLite metadata／MinIO的最小實作。2Rust＋2metadata與原4通用worker是拓撲變體，不作單引擎因果；完整SQLite含FTS／正文全部計成本。更新404與preloaded-no-update明示合理，不取消G3b目標。

實作須明列Next內tokenization計入服務CPU，不能移至load generator；dataAsOf原N1有欄位，不應靜默剝除，來源未知可回null並標明，不能造時間。G3 oracle只用符合原生排名差異的eligible／count／足額／unique／欄位與必要任務，不套SQLite的Top10 ID順序。pool fail-closed／queue／兩role清理及descriptor驗證需實作後再讀碼，再放行smoke；此為準備批准，非混載或完整DR驗收。

## G3a load設計scope核准

已讀g3-load/PLAN.md。同意採21題mix（不與K5九題ratio）、跨slot舊到達記miss不追趕、共同4s整journey/body驗證deadline、T/S不用exactIDs排名oracle、父generator配額外與role/cgroup讀回。可開始實作，不等於正式load已准跑。

可簡化baseline為每engine同build／資源配置一次60s warm＋300s measure合格，W/M各3rep共用；避免三次無決策價值的純閱讀重複。W/M背景reading仍各自守門。build／資源變更或明顯宿主飄移時需新baseline或停判，不能事後改用較慢baseline放寬門檻。

跨slot skip比只到deadline才跳過更保守，可接受；miss留預定分母，>1%判instrument-invalid而非引擎失敗。正式stage前仍需service smoke、儀器短自驗（延誤不追趕／共享deadline／完整body timeout）及實際loader讀碼。G3a不含update，不由此取消G3b或提升為完整DR驗收。

## G3a runtime與前三個formal結果複核

已讀初版pool／preloaded／service／metadata-worker／storage：來源lineage＋bytes/hash驗證、兩角色queue／deadline、protocol／exit fail-closed、全child teardown、Next內tokenization及dataAsOf保留均存在，可在controller／smoke準備完成後做最小smoke。indexDir本身以realpath接受目錄symlink，檔案symlink有拒；在受信controller配置範圍內保留此限制，不泛稱已拒絕所有路徑symlink，不擴安全矩陣。

獨立讀raw：SQLite b1、Tantivy b1/b2各630 measured、21shape各30、無deadline事件；ready為4CPU8GiB/swap0，cleanup clean。這足以支持G3a準備，不代表未完成b2/b3已過。正式混載仍須完整G2三block、service smoke與loader自驗／讀碼閉環。

共同pool worker截止使全pool fatal是保守adapter策略；第一個deadline及其queue／worker／role上下文，須與後續連鎖503分開報告。整合配置仍按全部失敗分母判定，不可刪除後續失敗美化，也不可把這些失敗全稱引擎固有容量。SQLite4通用worker與Tantivy2search＋2metadata為不同拓撲，結果不是純引擎單變因。

## G3a controller／load 最終 code gate（2026-11-17）

已核 controller.py、S1 sqlite-worker／共用pool／preloaded，以及load／oracle／schedule／transport。沒有必要阻擋；可凍結，先在同WSL runtime跑短儀器自驗及各engine service smoke。正式baseline／W／M仍以完整G2三block通過為前提，code gate不代替實測。

核對範圍包括：source-rule eligible/count與足額／unique／欄位／canonical URL、dataAsOf null、HTML正文與media完整body校驗；scheduledAt共同4s截止、跨slot不追趕與預定分母、未送／中止terminal保留、worker role PID唯一且同cgroup；4CPU8GiB reader／4GiB MinIO限制讀回、398s外部deadline／30s準備界線、host磁碟記憶體guard、killpg與unit清理。S1使用原生rank權重與lexical tie，並受共同pool生命週期管理。

核准有界排程：每engine單次啟動及合格baseline後W1/W2/W3，再M1/M2/M3；同generation／PID／build／資源且持續host監測。任一W失敗不升M，不為省時縮測量窗。SQLite先、Tantivy後有時間／cache漂移混淆，需明示；不為交錯額外重啟與重跑baseline。重啟或明顯漂移須重新建立有效baseline或停止判讀。

結果仍是preloaded配置整合工作點，不能推成更新／冷恢復能力，也不是兩引擎純因果比較。T兩search＋兩metadata與S四general的拓撲差額、完整SQLite metadata檔成本、首次deadline與全pool fatal後的連鎖失敗均須保留。G3b更新責任尚未解除。

## G2 最終結案 gate 與 G3a 收證

獨立讀六份formal result：兩engine各三block皆passed、failure null、630/630 measured、21shape各30，sourceStatUnchanged true，所有cleanup clean。formal-summary complete true；g2-freeze-formal-after unchanged true，Tantivy索引為6segments。核准G2在既定E合成原生基準範圍結案；同WSL自驗及各engine smoke通過後可進G3a。仍不代表正式語料品質、ES等價、HTTP併發容量或完整DR可用。

g3-summary.py採明列allowlist收證，排除config／env／runtime／project。要求stage狀態同時看result與controller：外部guard／deadline失敗不可被result passed掩蓋，缺controller不升格通過；實作者已修。資源為first-to-last sampled counter差額，memory.peak為cgroup生命週期峰值，不能當獨立stage峰值。collector不等於公開內容清洗批准。

## G3a attempt1 環境中止與最小修復 gate

依主agent回報：SQLite smoke 13項通過，但baseline開始時cgroup cpu.max已不存在；journal顯示reader與MinIO在負載開始前共同被systemd stop。此屬環境／儀器失效，不可判SQLite容量失敗；目前相同boot ID亦不支持WSL重啟說法。user manager離線回收是待確認原因，不以猜測結案。

同意attempt2以單一持續WSL process包住start／smoke／baseline／W／M，保持核心及loader凍結，重新baseline，保留attempt1完整證據。sequence須各階段失敗即停、finally清理兩unit，記錄boot ID與unit狀態；不需修改linger等全域設定。實作完成仍須快速讀碼，修復成功由實際unit持續存活及新stage證據判斷。

sequence.py完成讀碼：fresh attempt／engine／unit狀態gate、exclusive marker、各stage失敗停止、3000s總界限、20s finally stop、boot ID與unit狀態紀錄皆存在。核准sqlite-attempt2執行，不改核心／資源／負載。collector應精確收sequence三份receipt並保留最終cleanup總gate，避免stage通過掩蓋sequence失敗；此收證補充不阻塞啟動。

## G3a attempt2 io.stat 缺席與最後有界修復

主agent回報continuous process後cpu.max仍可讀，但io.stat缺席導致啟動後約1.2秒儀器中止並清理。允許一次最小portability修復及attempt3：僅io.stat的ENOENT記available:false／value:null／原因，CPU、memory、quota、OOM與PID/cgroup仍嚴格，其他permission／parse錯誤不可吞掉。不改宿主controller委派，也不將原因斷言為已確認。

此缺失不阻礙本輪latency／正確性／CPU與memory gate，但本輪不得由缺席IOcounter判IO瓶頸或效率。保留attempt1/2；attempt3需新freeze與完整baseline、原配置及測量窗。若再出現新的儀器阻擋，G3停止為unknown並彙整既有證據，不持續擴修以免失去有界探索。

attempt3實作複核完成：load僅io.stat ENOENT降available:false，其餘錯誤拋出；CPU／memory／OOM／PID gate未放寬。collector已收sequence三份receipt，overall需七stage與sequence全部passed。核准最後attempt3執行；新增儀器失敗則依前述停止unknown。

## G3a SQLite attempt3 結果與下一配置 gate

已讀summary、W1 raw/control、最後status/resources。baseline正式閱讀300/300完成，p95 13.44ms；W1在暖機首web restricted旅程到4s TASK_DEADLINE，接著SSR SEARCH_BUSY及search POOL_CLOSED。最近status為四general busy、queue16、fatal尚null；可確認共享pool堵塞與後續關閉的整合配置失敗，尚無獨立證據定位首worker內部根因。全pool fatal擴散不能當所有請求均為引擎固有失敗。

六個資源樣本無OOM／CPU throttle，reader memory約2.56GB，io不可用；不足以支持擴CPU／RAM可解決或推論IO瓶頸。W正式measure全部未送：不得寫成實測0RPS或100%正式請求錯誤率，應寫暖機中止、正式容量未取得；W2/3與M未測。instrumentInvalid false，sequence cleanup完成。

核准同4CPU8GiB及同loader測Tantivy配置，先完整baseline再依原gate W/M，不新增adapter修正或SQLite擴容。結果仍須明示T兩search＋兩metadata與SQLite四general的拓撲差異。

## Tantivy W1 中途核對與本輪停止策略

唯讀native tantivy-attempt1 baseline／W1 result及controller：identity、config／oracle hash、boot與PID一致；baseline閱讀300/300，p95 11.23ms；W1閱讀300/300，p95 12.54ms，Web1200/1200，p95 23.26ms。零generator miss／failure、instrumentInvalid false，兩controller exit0/pass。此僅W1中途核對，未代替後續三輪與M結果。

若W與M各三輪通過，建議本輪收束為Tantivy候選資格與合成穩態可行證據，不自動展開G3b。本輪合理原生基準及是否值得整合的投資問題已有回答；多artifact更新／回滾是下一工程閘。先彙整Rust build、IPC、兩角色生命週期、雙資料源版本等新增責任，保留正式資料品質與G3b未知。G3b不取消，但未做前不得宣告完整DR落地或維運總成本勝出。

## 結論邊界：SQLite另一條尚未測的能力／成本前緣

SQLite正式結果限定E：精確total與lexical pageId同分排序。其temp sort仍存在，因此不能稱充分最佳化、SQLite極限或全域淘汰。既有L screen僅去掉count、仍保留tie，沒有測原生無tie TopK；不得把它當這條前緣失敗的證據。正式consumer契約仍未知，使用者亦允許需求妥協，這是會改選的具體答案。

下一輪優先級應條件化：若可接受無精確total／不保證同分順序，先做有界L差額gate通常比G3b更便宜且直接影響選型；保留同fixture、eligible／足額／正確欄位及原生score排序，僅放寬已聲明契約，不一次展開完整G3矩陣。若E不可妥協，L沒有本決策價值，才優先T正式資料／語言品質及G3b工程成本。此輪不新增run。T即使通過也只支持E合成配置有餘裕，不能宣告成本最優。
