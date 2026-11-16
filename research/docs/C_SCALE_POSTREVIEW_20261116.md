# C擴容事後審查

2026-11-16，獨立reviewer。已完成R1與唯一R2的正式結案審查。只讀匯出raw／resources／status／events／freeze／cleanup，不追加HTTP或服務，不改凍結檔。

**最終裁定：R2（reader8 CPU／12GiB／8 workers，另有MinIO4 CPU／4GiB）通過本輪全部研究工作點；停止擴容，不進第三階。** R1不合格完整保留。這是可行部署preset，沒有證明最低資源、正式容量、純CPU改善因果或DevOps長期工時下降。

## R1裁定：更新完成，但共同工作點未全部合格

4 CPU／8GiB／4 workers完成前六個30秒階段，包含Web4/s＋reading1/s＋consumer2/s＋bulk2/s。最後180秒更新亦完成V2啟用及舊pool排空，但reading與Web搜尋門檻未過，**保留 `allTargetPhasesQualified=false`**。`stop=null`只表示沒有致命中止，不表示整輪合格。

獨立由raw重算更新階，成功任務的排程至完成P95如下：

| lane | 成功／原定 | 成功P95 | 未完成 |
|---|---:|---:|---|
| reading | 178/180 | 862.53ms | 2次CONTENT_BUSY，1.11% |
| Web搜尋整鏈 | 718/720 | 2074.07ms | SEARCH_BUSY、CONTENT_BUSY各1 |
| consumer | 360/360 | 1671.92ms | 0 |
| bulk | 359/360 | 834.84ms | 1次CONTENT_BUSY |

reading超500ms且失敗比例超1%；Web搜尋超2秒。合計五個任務未完成，不能把Web的HTTP子步與journey重複算成更多失敗。沒有未送取消、oracle錯誤或版本409；有意的拒絕契約probe另計，不能混入上述失敗分母。前六階合格是可用子證據，不抵銷更新階不合格。

V2 3,313,811,456 bytes索引真下載約49.535秒；由receipt下載開始至啟用約56.236秒，不是整站RTO。454個任務與下載窗重疊；各lane均服務V1、V2且有activation後20秒才發送的V2成功任務。新pool為3130／3131／3132／3135，原1497／1498／1499／1505全部離開reader cgroup，`retired-drained`在activation後約2.64秒出現。自然跨activation樣本16個，只按已存版本／hash結果解讀，不替代其他故障演練。

## 是否值得唯一R2：有條件支持

更新階362份reader樣本獨立重算平均3.732 CPU cores、`throttled_usec`累計增40,751,027，status queue觀察最大12。reader current峰7,148,716,032 bytes（約6.66GiB），memory.max／OOM增量0。這支持「現有4核／4 workers在共同更新工作點的CPU與併發餘裕不足」值得以另一部署preset檢驗，**不是已證純CPU根因，也不是記憶體不足已證**。節流累計值是cgroup計數，不直接解讀成相同長度的全服務停止。

因此支持原先允許的唯一下一階：**reader8 CPU／12GiB／8 workers**，其餘SQL、queue16、content4、timeouts、MinIO4 CPU／4GiB及全部負載不變。這同時改資源與worker，是部署配置對比；不另加SQL優化、content槽數或priority來混淆。開跑前須重讀宿主餘裕、fresh-ready與實際限額／八workers／freeze，再給正式gate；不使用先前已否決的16GiB reader配置。

必須保留兩個反例：四次CONTENT_BUSY是在固定內容slot的拒絕，不是直接的CPU飽和量測；更多worker可能降低等待，也可能增加同時到達內容槽的請求而更差。另MinIO更新階current近4GiB，memory.max事件增1,040，CPU平均約0.025核且無OOM；這不支持說它完全沒有cache／I/O影響。本輪維持MinIO不動，才能知道是否僅靠一個reader部署preset足以達標，而不是先宣告所有問題都可由reader擴容解決。

R2若全部達標，停止擴容，報可行配置與新增資源／維護責任；不再找上限。若仍不合格，停止此輪擴容路線並保留結果，回到內容admission／搜尋隔離／更新競爭或引擎替代設計；**沒有第三階、沒有測後放寬門檻或固定槽數的授權**。品質／未知服務錯誤也不得解讀為繼續加資源的理由。

## 保全、成本與限制

Reviewer事後另在native重算R1全部80個freeze輸入，零差異。已讀cleanup：V1、V2安裝DB hash符合原pin，本輪ports無listener、兩unit MainPID=0；MinIO正常exit0，Next受控SIGTERM保留exit143／failed狀態，與負載失敗分開。未覆寫R1、K2、K3或K4證據。

R1的實質收益是：沒有SQL改造，固定較大的preset即可維持非更新的目標背景，且更新能正常啟用／自動排空，不再像K2停於新pool start。但共同背景下的體驗仍未達門檻，不能稱第一版已完成。新配置沒有增加獨立搜尋deployment unit；producer、installer、pool、監測與版本維護責任仍在。這不等於DevOps工時已下降，也不等於A／B成本較高。

固定九shape、p000002搜尋前SSR與p000001獨立閱讀、256頁／8附件hotset、固定到達相位與cache／順序限制沿原卡。原始P95是短窗server任務，非browser／正式consumer SLO。上述R2候選裁定保留為R1結束時的決策；實際R2結果如下。

## R2最終結果：可行preset，停止擴容

從R2 raw獨立按phase／lane與HTTP或journey層級重算：七階合計**2550個任務全部成功**，每階P95與result相符，無錯資料、拒絕、未送取消、致命stop或thresholdStop。最後更新階為1620個任務，不是161筆；其中Web的兩個HTTP步驟不能重複算任務。前六階維持共同背景逐步加入負載，沒有降載或更改契約救結果。

| 更新階固定lane | 成功／原定 | 排程至完成P95 |
|---|---:|---:|
| reading 1/s | 180/180 | 12.87ms |
| Web九shape搜尋4/s | 720/720 | 1205.82ms |
| consumer九shape搜尋2/s | 360/360 | 1271.56ms |
| bulk下載2/s | 360/360 | 26.19ms |

V2下載3,313,811,456 bytes約49.420秒，下載開始至activation約54.607秒；均不是正式RTO。另由raw與receipt核447個任務和真下載重疊、自然跨activation4個。四lane的V1／V2成功數分別為60/120、239/481、120/240、120/240；activation後20秒才發送且成功的V2任務分別100、401、200、200。phase保留約120.378秒啟用後觀察，符合既定義務。

持久event顯示V1在activation後約1.091秒 `retired-drained`；原八worker退出reader cgroup，新八worker不同於舊PID且均在該cgroup，最終active V2。更新沒有靠殘留舊pool繼續占用資源換成功。這只證單次V1→V2安裝、切換與排空，不是任意版本連續更新或GC的證據。

更新階361份reader資源樣本重算平均3.655核、current峰6,924,996,608 bytes（約6.45GiB），該階memory.max／OOM／CPU節流增量均0，status queue觀察最大0。**觀察為0不代表所有瞬間都零排隊。** MinIO該階峰3,789,914,112 bytes、max／OOM增量0、平均約0.0246核；R1卻有max事件1040，顯示依賴cache／執行順序狀態也不同。兩配置還同時改worker／CPU／RAM，不能把R1→R2全部改善歸因於某一個資源。

Reviewer在native另重算R2全部80個freeze輸入，零差異；兩installed DB也另算符合原V1／V2 SHA。已讀cleanup：本輪ports無listener、units MainPID=0；MinIO exit0，Next受控SIGTERM保留exit143。R1自己的80檔保全與失敗結論不變。全程新目錄峰約13.28GB，free最低約914GB，已存host／磁碟guard紀錄無觸限；不把這些研究目錄總量當單站正式儲存需求。

## 維運價值與仍需付出的工作

本輪回答了使用者的擴容問題：**不改SQL、queue16、content4或既有timeout，使用一個較大的固定部署preset，足以完成此合成共同工作點與一次正常更新。** 因此暫無必要為達到這個研究工作點再客製SQL或提高第三階資源。它沒有增加獨立搜尋deployment unit，但中央producer／排程、artifact、安裝器、worker、監控與測試仍需維護；硬體額度與MinIO依賴另列，不能因實際峰值小於12GiB就宣稱較低額度也會通過。

對長期DevOps工作，以下仍不能寫成「已自動化驗收」：

- **連續版本與重啟：** 現行研究service只提供V1初始化與V2更新，init固定安裝V1；沒有證明V2之後重啟會發現並恢復最新已批准版，也沒有V3等連續更新演練。
- **GC／保留：** 關閉舊pool不等於刪除舊DB、處理中斷的part檔或完成磁碟保留策略。兩版資料留存可見，但長期回收與保留上限未驗。
- **rollback／發布失敗復原：** 本輪是正常更新路徑，沒有證明自動回滾、重試冪等、跨站發布交易或正式MinIO／ReBAC故障的復原；舊小型故障證據須按適用接縫引用，不能直接當新版長期演練。
- **告警與fatal worker：** 研究sampler與外層stop不是正式告警及on-call處理。現有pool會將worker退出／執行逾時標fatal，未見自動補worker；實際部署如何重啟、避免回到舊版本及驗收健康尚需設計／驗證。
- **交接與工時：** 作者agent驅動成功不代表非作者／團隊可直接維護。設定、更新觸發、排錯介入、等待與active操作、升級責任及公司現有自動化重用量仍需ledger與對口確認；不能用此次等待秒數或token填正式DevOps工時。

以上是第一版正式化的剩餘工作，不反向改判此次容量研究失敗，也不在結案時自動啟動新實驗。建議下一個決策轉向「版本生命周期與可交接runbook需要補多少工、公司既有ES／A自動化可重用多少」，再判斷C是否仍值得。保留其他引擎候選，不因R2通過就宣布C是成本最優。

**本輪無結案阻擋。** 停止擴容，保留R1反例與R2有限通過，交付可行配置、證據與上述維運缺口；不追加負載或第三個preset。
