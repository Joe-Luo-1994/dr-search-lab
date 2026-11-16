# K2 百萬頁與 Web 干擾：獨立設計 gate

2026-11-16。已讀 `C_MILLION_PLAN_20261116.md`，沿用 K1 有限結果與保全界線。**主體設計可進實作；下列兩項補明後可凍結設計，正式執行仍待 code／artifact／limits preflight。** Reviewer 本輪未啟服務、執行負載或修改卡／實作／K1凍結檔。

## 凍結前兩項必要補充

1. **Web旅程要真接上搜尋結果，且保留更新造成的未完成。** 固定一組來源可推導、確保至少有合法已發布hotset命中的Web查詢；search→page必須使用該次返回hit的pageId／version／URL，不可在搜尋完成後另讀已知page湊成完整鏈。SSR HTML、search及page各自依回應版本核來源，更新中的合法409是needs-research／未完成旅程，不是品質錯，也不是成功；整鏈成功率分母包含該旅程，不能只報成功P95便判Web無干擾。卡需明示更新階的失敗／未完成靶點如何處理409，與越權／錯資料立即停止分開。
2. **bulk lane也需要事先固定的有效負載／停止門檻。** 目前Web／consumer門檻明確，但「下載混合仍合格」尚未定義下載自身是否完成。請明示完整body的deadline、bytes／hash、拒絕／timeout分母與合格門檻，以及bulk不合格時是否停止進update。否則2/s全被拒仍可能留下Web／consumer成功，誤稱已承受下載競爭。可沿用已有研究錯誤率／截止值，不必新增productionSLO；記每種附件的offered與成功數、實際bytes，避免大小混合只有名目到達量。

## 已接受的設計收斂

- 正式只一百萬工作集、兩版真delta，小1000只preflight。來源函式按ID重建metadata／摘要與eligibility、query total不從SQL取得，避免全百萬metadata JSON進工具記憶體。Oracle實作仍需在code review核與builder的獨立計算邊界。
- Reader先保留2 CPU／1GiB／swap0，2個workers共享queue，SSR／consumer／metadata／新舊版本與更新均列入。這使Web是否受consumer拖慢可直接觀察；不是已承諾足夠。MinIO4 CPU／4GiB及Go heap軟靶分開列成本，不能因配置較大便宣稱非瓶頸。
- 真SSR每次走同授權／metadata／遠端正文路徑、no-store並render；Web journey open-loop1/s且旅程可重疊。Browser只在smoke驗可點／DOM，正式只稱HTTP SSR與合成任務延遲，不稱browser互動／正式editor品質。
- Web baseline30秒，consumer1／2／4／8／16每階30秒，最高雙方合格率才加入2下載/s，再做更新；分lane、分步與整鏈統計，明確排程遲到與漏送。Web相對baseline門檻有500ms floor，是事前研究政策，不是假裝已取得使用者容忍度。低樣本與固定先後／暖cache仍應限制結論。
- 更新phase180秒，第5秒開始、外層150秒共同截止，下載100秒、pool-start／quick_check30秒；最遲155秒啟用後仍留V2觀察窗，時間口徑已相容。下載64MiB/s是應用節流，不作WAN模型。實作需讓外層取消覆蓋所有子工作，不能只讓client停止等待。
- 900秒總deadline、16秒drain、CPU／記憶體／磁碟guard與finally收尾有界。單SQL4秒確實終止後可分類capacity stop；錯資料／越權／混版仍是品質停止。正確分類不能用來繼續施壓已無法服務的worker。
- 最多一次evidence-driven fallback，先依失敗原因新卡；不默改exact total、資料、到達率或Web任務。只改reader資源、admission隔離或更新策略之一仍需記額外成本；沒有充分原因時可停止而不使用額度。

## 實作 preflight 應查什麼

只查以上設計是否落實，不追加研究矩陣：

- 實際1M／1M+1 artifact bytes／hash、source與熱集oracle、完整stream PUT／GET驗證及安裝；不可在publisher或HTTP library內重新聚成3GB Buffer。Builder／publisher／generator資源另列。
- SSR的身份／canonical page／version pin、escaped內容與error狀態、返回搜尋連結的旅程銜接；額外status／browser探針頻率與開銷明示，baseline和干擾階同口徑。
- 實際cgroup limits與新舊PID歸屬，pool queue／run／event-loop量測各自有單位；CPU quota不是專用核心，I/O缺值須保留。
- queue／內容admission、查詢真取消、安裝失敗保舊、長截止與磁碟兩版／staging投影、錯誤後不繼續下一階；讀回final freeze與cleanup。
- Raw每條旅程有穩定ID連接各步，consumer／Web／bulk／控制探針可分離，所有offered有終態；成功與未完成、各自P95樣本數及實際bytes可重算。

## 允許的結果與停止理由

本輪回答「這個百萬C候選在固定reader預算下，consumer及下載／更新是否讓Web合成任務不符合事先靶點，以及主要可觀察原因」。不把更大MinIO配置當免費、不拿K1與K2不同資料／SSR／依賴配置拼成單變因速度比較；不以B代表A，不推正式TCO。

若最高預定階皆合格，報已測範圍即可，不為找上限自動加壓。若失敗，先看各lane、query shape、queue/run／event-loop、cgroup及更新事件，選是否值得唯一備案；證據不足就保留未解，不把單一相關性說成根因。K1原結果與K2所有失敗保持獨立。

## Runner靜態複核（待兩項小修）

已讀K2 `load.mjs`與`source.mjs`，並對照service回應代碼。原兩個設計finding大致落實：Web以真搜尋first hit與回應版本選頁，409列needs-research且進未fulfilled分母；bulk另有5秒完整bytes／SHA截止、2秒P95／1%失敗門檻，不合格不進更新。各lane分開到達、900秒共用abort、16秒drain、來源predicate／snippet、更新155秒內啟用及20秒V2觀察均有對應。這不是runtime／artifact gate已通過。

凍結前僅需定向修正：

1. Web page步驟目前仍自行組合URL，verifySearch只核hit.url的version。應核返回URL與允許origin／canonical pageId／path／version相符，並實際follow返回URL，避免broken link被runner硬編路徑掩蓋。
2. 非admission的503目前除了HASH／INTEGRITY／IDENTITY外全部列capacity；例如`OBJECT_SIZE`錯bytes會錯歸容量。應明列capacity代碼，完整性代碼歸quality，其餘未知service／transport失敗停下並保留未分類，不把未知錯誤直接變成增加CPU／RAM備案的理由。

本次未啟服務、執行smoke或負載；修正後只定向核這兩項，不追加矩陣。

## Runner修正關閉與runtime靜態核對

兩項runner finding **closed**：hit.url已核同origin、canonical path／pageId／version與唯一參數，Web實際follow該URL；OBJECT_SIZE／ARTIFACT_SIZE等完整性錯誤歸quality，明列capacity代碼，其餘未知service／transport停止保留未分類。409未fulfilled分母、bulk完整下載及自身門檻已落實，runner無剩餘靜態阻擋。

另已讀pool／worker／storage／publisher／environment及SSR頁：整體pool ready＋quick_check30秒、一般query從admission含queue4秒且真kill／記原因；metadata與SSR走同pool、canonical授權與真MinIO正文，缺身份拒絕；publisher用createReadStream與流式GET校驗，不把整DB讀成Buffer。來源函式／predicate與小oracle不讀SQL結果，builder記輸入hash並拒覆寫目錄。資源設定、5秒disk guard及formal finally停止自有units有對應。**可先做新目錄1M離線prepare／build，這不是正式load批准。**

runtime凍結前只剩一項卡對齊：`service.update`目前只從client close取消，未見server整條150秒共用deadline；應將150秒timeout與client cancel合併傳安裝，finally清timer並在active替換前檢signal。子下載100秒／pool30秒不能單獨代替外層deadline。已取消後不得啟用新版；pool可以在自己的有界start結束後清理，不能留下候選children。

完成上述後，依已定smoke／browser、artifact與cgroup讀回、正式freeze核對收斂，不新增測試矩陣。對pool timings的結果解讀須注意status回傳最近256筆的滑動窗可能重複；不得把多個status窗口直接串成獨立job樣本。可用jobs累積差額／版本或後續明示job識別處理，不據重複樣本下根因結論。

## 最終正式 gate（2026-11-16）

server更新已加入150秒timer與client-close共用abort，finally清timer；pool-start後及active替換前檢signal，**最後一項runtime finding closed**。

已讀本機smoke-1 result：1000頁、35.29秒、stop=null，Web baseline／consumer／bulk／update四phase均符合各lane靶點；真V2下載與兩版服務證據成立，smoke自然跨activation仍為0。reader與MinIO讀回分別2 CPU／1GiB與4 CPU／4GiB，swap0。另已讀browser-smoke結果：作者以明示mock身份完成真Edge390 SSR→搜尋→返回hit→SSR正文，無JS error；此為隔離browser preflight，不算正式容量或真人證據，reviewer沒有再操作browser。

百萬builder報告記兩版65.97秒、maxRSS187,036KiB、DB 3,312,799,744及3,313,811,456 bytes；source／fixture目前hash與build-inputs報告相符，160,100-byte compact oracle的source hash一致。這些是準備證據，不是reader在1GiB下已可承受百萬查詢。

**裁定：無剩餘設計／靜態實作阻擋。** 完成既定串流publish／GET讀回、正式fresh V1安裝／ready、實際limits與PID歸屬，以及實際native程式／build／dependencies／兩版DB／manifest／oracle／非機密設定hash freeze後，可依卡單次執行原配置正式負載。此處沒有假稱尚未產生的正式freeze已驗；準備／ready若失敗應保存並依同一容量／品質分類停止，不繞過gate。無需新增smoke或擴研究矩陣。
