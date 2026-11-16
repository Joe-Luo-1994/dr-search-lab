# 遠端內容R1–R3執行卡

2026-11-15。**設計及獨立預期已定，環境／產物／runner仍待freeze與preflight。** 使用者已授權繼續準備；本卡不把準備完成當正式實驗通過。主要V3／V5，V6不讓步，兼記V8。

要判斷的是：本地搜尋index／metadata搭配異地MinIO按需正文／附件，能否維持可信版本及canonical授權，依賴故障時能否清楚降級、恢復；新增工作是否值得後續採用比較。A完整stack、B保留ES、Pagefind候選均保留，不作引擎排名。

## 固定來源、交付與保全

- 新程式`scripts/v1-remote-content-20261115/`、runtime `.lab/v1-remote-content-20261115/`、證據`evidence/v1-remote-content-20261115/`。原E1 120與E2 132凍結檔不改，正式前後核hash；新輸出create-only，所有失敗保留。
- 來源沿E2的37／38頁新副本，只將snapshotId改成`v1-remote-content-20261115-v1`／`v1-remote-content-20261115-v2`；合成capture label及其他內容不變。以獨立oracle的來源hash／公式核對，不從查詢結果產生期望。
- 原source維持schemaVersion 2；遠端manifest使用明示的獨立schema版本，具source SHA、index身份、canonical pages及remote object descriptors。正文JSON固定`{schemaVersion:1,snapshotId,pageId,body}`的key順序，body為來源paragraphs以LF串接；UTF-8 `JSON.stringify(object)+LF`、無BOM。PDF bytes沿E2獨立hash。
- 本地可以保留paragraphs、PDF抽取文字與FTS content，供搜尋／snippet用並列帳；**沒有page.body欄與本地PDF bytes，readPage／download不得由搜尋文字重建或故障fallback**。這不聲稱純倒排索引，也不為省空間展開contentless FTS或摘要重設計。
- 每正文／PDF物件上限1MiB；Next用signed fetch取得完整bytes，核實際長度、SHA及正文schema／snapshotId／pageId後才交付。超限中止，不能只信Content-Length；本輪不stream、不Range、不驗大檔。共享body／PDF完整性helper列為preflight必要項。
- object key採`<snapshotId>/pages/<pageId>/<sha256>.json`及`<snapshotId>/media/<mediaId>/<sha256>.pdf`。publisher PUT後真GET逐物件核hash，manifest／commit最後；index artifact同存MinIO，installer只取manifest及SQLite／receipt，不批次下載正文／PDF。準備發布的GET不算正式按需閱讀成功。完整小fixture閉包證據不等於正式物件鎖／多publisher原子性或公司保留政策。

獨立期望：`scripts/v1-remote-content-20261115/review/oracle.json`，17組案例。來源副本實際落點由主agent補入freeze；oracle內fixture path為預定位置，內容／hash不因路徑改變。a-pdf遠端正文V1為236bytes、SHA`aeb4f04fae1bbe12347b8c14bdc84802342f66bebe1779e114399b6bcba7be98`；V2為199bytes、SHA`91c30df6aac39ae5b694b7eb7a227fe9eaef82dc4f2cd90e857735caa6ed0a1d`。這些是離線來源公式值，未執行服務。

## HTTP及授權契約

沿E2 `x-e1-identity`與metadata／URL形狀。正文、media-list及下載必須帶`?version=<snapshotId>`；Role unknown先回503 AUTHORIZATION_UNKNOWN，缺版本400 VERSION_REQUIRED、不符409 VERSION_MISMATCH，同版無權或非canonical membership回404 NOT_FOUND。錯誤只含`{error:{code}}`，不得混入正文／附件或憑證。全部API no-store；授權時間只核有效ISO，不再跨程序毫秒包含斷言。

Next每次依local canonical page→Space→當次Role及page→media list判斷，再取服務端固定descriptor的物件。client不能提交任意MinIO key。私有bucket不發公開／presigned下載鏈；匿名GET兩個已知真物件均403 AccessDenied。metadata是快照關係，mock Role仍非正式ReBAC，也不代表即時page移動關係；原已知漂移界線保留。

遠端GET可成功但bytes／hash／正文格式或身份不合：503 CONTENT_INTEGRITY_MISMATCH；遠端連線或物件不可取：正文503 CONTENT_UNAVAILABLE、PDF503 MEDIA_UNAVAILABLE，不能假404／零結果。空cache installer取不到MinIO index artifact：非零退出、ARTIFACT_UNAVAILABLE、無已提交release或last-success、不得ready。隨後用有效參數`serve v2 3166 fresh`確認因缺receipt／release拒啟動，無ready事件及listener；參數驗證失敗或端口衝突不能算通過。

## 一次序列與必要門檻

| 階段／oracle ID | 固定操作 | 通過條件 |
| --- | --- | --- |
| R1-01 | V1實際search e2packet→page→media→PDF，瀏覽器保留舊結果 | exact V1正文／metadata／membership／PDFhash；保存實際回傳URL與真MinIO body／PDF GET證據 |
| R1-02 | 獨立wrong-v2 reader：a-pdf bodyObject指到同V2真a-pdf-near key，兩者皆199bytes，但保留a-pdf expected hash | 真完整GET200後因SHA不符明確CONTENT_INTEGRITY_MISMATCH，不交付錯內容；正常V1／V2物件不破壞。不要求另外錯PDF矩陣，但共用完整性路徑須靜態核實 |
| R1-04–07 | 安裝有效V2、啟新reader及明示切proxy；新鏈、三種實際舊URL409、固定V1 reader仍讀保留V1；原Web重搜後V2閱讀／下載 | index／metadata／遠端內容同版；沒有透明去token重試。V1保留只驗固定reader，未驗GC或任意rollback。Web可讀exact正文／下載hash；PDF iframe視覺非本卡門檻 |
| R2-01–03 | b身份baseline完成Falcon→b-export／pdf-ledger；all身份拿a-pdf配有效pdf-ledger；a身份直取b-export正文及附件 | 合法鏈成功；跨page案例即使可看兩Space仍404；跨Space拒絕不洩漏內容 |
| R2-04–06 | b搜尋後改revoked-b，用舊真鏈讀正文／list／PDF；unknown讀正文／PDF；匿名GET真body／PDF物件 | 撤權三項404、unknown兩項503、匿名兩項403；finally恢復baseline並驗b正文／PDF成功。憑證與signed Authorization不進log |
| R3-01–03 | 一次真MinIO停機窗；已裝V2的e2packet、dispatch AND Tags與media-list；讀正文／PDF；新empty cache安裝 | 本地查詢／list仍正確；正文503 CONTENT_UNAVAILABLE、附件503 MEDIA_UNAVAILABLE且無fallback；空cache明確失敗且不ready。保存MinIO PID／連線失敗／故障窗證據，不用錯key或fake404替代 |
| R3-04–05 | 同窗Web新讀顯示內容不可用；同store恢復後按「重試載入頁面」並閱讀／下載；API再完整一鏈 | 明確可重試，不能顯示找不到／假成功；恢復同版exact內容與PDF；無索引重建、source改動或本地全文fallback。故障前已開頁不可當成新的成功讀取 |

案例ID保留R1-03空缺，是freeze前刪除重複的錯PDF注入，**未執行／未略過失敗案例**。schemaVersion不相容、body身份不符及size/hash helper在preflight靜態核，若看不出確實拒絕便阻擋正式執行，不靠多跑查詢掩蓋。

wrong-v2所用a-pdf-near物件已由reviewer獨立從來源算得199bytes、SHA`73ced4e9b81046e0b695b078ffda39af792e5ae92d893adf2d2713c6f74a1eac`；這是在freeze前選擇同長反例，不由引擎輸出反推。UI正文錯誤字串為「目前無法讀取頁面正文。你仍可搜尋。」、PDF為「目前無法載入這份 PDF。」；對應重試button exact名稱「重試載入頁面」／「重試載入 PDF」。

## 環境、期限與停止

目前指定：Windows既有Node22／Next／SQLite。真MinIO使用已保全WSL binary `/PUBLIC/LINUX_HOME/dr-search-lab-e1-20261115/repo/work/minio-official-build/bin/minio`，新store為Windows runtime的`minio-data`、WSL以`/mnt/c`對應讀寫。loopback 19440 API／19441 console；Windows Next3162 V1、3163 V2、proxy3164、wrong-v2 3165。正式前主agent記binary SHA／版本、絕對store映射、private bucket／namespace、憑證配置位置（不記secret）、程序owner及空cache路徑；有既有占用即停，不碰舊MinIO／ES／native研究資料。

Fresh缺receipt拒啟的專用候選端口為3166，須先核無占用；它不能與正在服務的3163或wrong-v2的3165共用以製造假失敗。

- 一次production build，300秒watchdog；先記input hashes，成功後核未變並保存outputs receipt。source／oracle／contract／卡／runner／runbook及prepared artifact、MinIO object inventory在正式前freeze；不偷偷重build。
- 每個完整HTTP含body5秒；Web每任務30秒；唯一正式序列300秒。Web故障顯示與恢復各算一個任務；蓄意停機窗歸整體300秒。期限共用停止機制須取消fetch／命令、關browser／自己children、阻止後續case，不只事後assert耗時。
- 資源暫沿E2：free RAM≥2GiB、free disk≥10GiB、新runtime＋evidence≤512MiB、相關程序合計RSS≤6GiB；正式前／每階段後採樣，不稱硬quota。主agent補Windows／WSL採樣範圍、共享RAM不可重複加總、binary是否位於保全範圍及磁碟掛載；若工具無法可靠量到，先記缺口並review，不用假0。
- 預期wrong-v2／撤權／失聯拒絕算事先案例；任何非預期產品／授權／錯版失敗立即停、保留raw，不改scope／oracle修成通過。只允許一次經獨立review的儀器修補，原attempt原樣保留、另輸出／新freeze，不把兩次成功片段冒充同一次正式通過。
- 故障只停本輪已核PID／command/store的MinIO，恢復同一store；finally還原Role，停止本輪MinIO／reader／proxy及browser並保存無listener收據。未完成後續不標通過。保留所有source、產物、錯candidate及原失敗，不公開服務或提交secret。

## 證據與結果口徑

每request記case／identity／實際URL／status／headers／raw JSON或PDF、單一observer單調耗時；真remote GET另記phase／object identity／狀態／bytes／hash，不能只相信adapter自報「遠端」。publisher、installer、正式閱讀分開計GET。保留UI錯誤及恢復截圖、pageerrors、版本鏈、私有object直取拒絕、停機／恢復及保全收據。

成本分列local SQLite／metadata／搜尋全文副本、遠端內容與版本、staging、發布GET校驗、按需閱讀GET／bytes、啟程序／切流／憑證／診斷／介入。主站→異地與異地→reader兩層不重複計價；builder成本不乘成每Pod需求。未測真人、正式ReBAC、跨區／雙fz隔離、正式consumer、SLO／RTO／RPO或TCO。沒有E1／clock重播、Pagefind／ES矩陣、百萬壓測、額外非作者G4或自動E3。

待freeze：上述環境與資源測量實址、manifest schema及installer／not-ready精確綁定、實際來源檔hash、build receipt、object inventory、driver與17組案例對照、HTTP預算清單和preflight裁定。主agent與實作者對齊後才能開始唯一正式序列。
