# K2 百萬頁：獨立事後裁定

2026-11-16。**本輪得到可用的失敗邊界，但K2完整目標未通過：2 CPU／1GiB原配置不能完成ready；唯一2 CPU／4GiB備案可以服務，卻在consumer4/s時拖慢Web，且混合更新未能啟用V2。** 唯一備案已用完，停止本輪，不追加實驗。Reviewer只讀原始檔、重算與hash，未起服務或送HTTP。

## Web被拖慢的門檻已出現

以下由fallback-1 raw按lane重新計數並重算成功旅程／請求的含排程P95，與result相符。Web維持1條journey/s，每條SSR→搜尋→實際hit正文；consumer是搜尋HTTP/s，bulk是完整附件下載/s，三者不能混成單一QPS。

| 階段（各30秒） | Web完成／預定 | Web整鏈P95 | Consumer完成／預定、P95 | 裁定 |
| --- | ---: | ---: | --- | --- |
| Web-only | 30／30 | 22.78ms | 無consumer | baseline成立 |
| Consumer1/s | 30／30 | 19.15ms | 30／30，1078.98ms | 符合 |
| Consumer2/s | 30／30 | 439.16ms | 60／60，1082.60ms | 符合，但Web明顯變慢 |
| Consumer4/s | 30／30 | 2978.22ms | 120／120，1806.01ms | Web不符合500ms門檻 |
| 降回consumer2/s＋bulk2/s | 30／30 | 444.46ms | 60／60，1077.06ms | 符合；bulk60／60、P95431.83ms |

Web的有效門檻是`min(3000, max(2×22.78,500)) = 500ms`。4/s階所有任務仍正確完成，且P95略低於3秒絕對上限；失敗的是事前相對退化／500ms研究門檻，不應寫成HTTP大量失敗或Web完全不能用。Consumer本身仍符合2秒門檻，不能用其成功掩蓋Web受影響。

**8/s與16/s未執行，是consumer4/s階Web不合格後按卡停止升階；不是後來更新失敗才跳過。** 隨後回到先前兩邊合格的2/s測bulk，符合原卡，非失敗後偷偷降參數救同一階。

4/s階reader平均CPU約1.975核，接近2 CPU配額；status可見共享pool排隊到秒量級，而已完成Web／SSR的worker工作本身多在毫秒內。整輪記錄的Next event-loop最大delay約39.52ms，沒有對應的秒級主執行緒停頓證據。這支持**consumer佔用共享worker與CPU，讓Web等候**的解釋；不是單憑總P95猜SQLite慢。Pool timings是最近256筆滑動窗，本審查按累積jobs增量去重；poll時間仍使階段邊界歸屬有約一個採樣間隔的不確定，不能把窗口拼接樣本當每個job精準起迄或嚴格因果證明。

## 更新失敗與取消，不能混報成任務錯誤率

更新階原定180秒，約第5秒開始V2下載；3,313,811,456 bytes真下載／hash於49.397秒完成，接著新pool在30秒共同start／quick_check gate超時。階段約84.442秒時全域停止，原因為`WORKER_START_TIMEOUT`；沒有activated事件，最後status仍是V1／舊workers，故**沒有完成更新，不能稱失敗後已自動恢復或已驗V2服務**。

| 更新階lane | 原定工作 | 已送出且完成ok | 停止後未送出 | 已送出成功樣本P95 |
| --- | ---: | ---: | ---: | ---: |
| Web journey | 180 | 85 | 95 | 553.15ms |
| Consumer搜尋 | 360 | 169 | 191 | 1111.78ms |
| Bulk下載 | 360 | 169 | 191 | 459.28ms |

已送出三條lane在此片段全部完成，沒有把未送出的95／191／191筆偽稱HTTP失敗、timeout或正確性錯誤；它們是`aborted-after-stop`，仍保留在原定任務分母，表示180秒計畫未完成。真正觸發停止的是控制面的更新失敗。Web片段P95已超500ms，但這不是完整180秒分布；整階也不能因只看已送出成功率100%就判合格。Raw含HTTP步驟、journey與arrival等記錄，不能直接把整檔行數稱HTTP數。

依持久events的download-start／end與raw lane終態獨立重算，423個已送出成功任務中有246個與真V2下載窗重疊。原result因更新失敗沒有success receipt而填overlap0，不能據此稱沒有重疊；保留原result並另作分析修正合理。未送出arrival具有零長度占位值，不使用原allOfferedP95推論使用者延遲；其數量仍用來揭露整個計畫未完成。

更新時reader採樣current到4GiB、memory.max events階段增28,778、file refault增805,716；末次file約4.00GB，兩版DB合計約6.63GB。這與新舊版本／cache競爭的假說一致，但沒有把pool-start與quick_check各子步時間完全分解，仍不能宣布已證根因。MinIO同階max events增1,334，無OOM；CPU使用低且沒有CPU節流證據，但記憶體／cache仍有壓力，不能稱其絕無瓶頸。沒有block I/O計數（io皆null），logical bytes與refault也不是裝置I/O的替代測量。

## 原配置、保全與證據範圍

原`formal-1`的2 CPU／1GiB失敗停在ready前，未開始負載：3.3128GB下載／hash完成，30秒pool gate逾時。後產的freeze-before只作provenance，沒有追溯成事前freeze。記憶體-only備案保持程式／兩workers／SQL／query4秒／pool30秒／負載與MinIO配置，改reader至4GiB；ready約14.071秒成功，其中下載9.000秒、check約5.031秒。快取與執行順序不同，不把這一次前後成功差異全歸因於RAM。

已讀fallback實際limits，482份資源記錄的reader2 CPU／4GiB／swap0與MinIO4 CPU／4GiB／swap0相符，無OOM。Reviewer另在native唯讀重hash全部68個freeze輸入，無差異；兩份installed DB的bytes與SHA也與pin相符。V2下載檔正確不代表V2已啟用。磁碟採樣峰23,365,405,562 bytes、free最低930,688,057,344 bytes，未觸40GiB／20GiB護欄；目錄包含研究產物，不是單reader需求。

只接受合成來源predicate的exact total、eligible Top10、metadata／prefix snippet及內容hash；沒有BM25等價、PDF-only新builder品質、真實editor／ReBAC／consumer接受。256正文及8附件是hotset；正式HTTP SSR不是browser互動SLO，browser只有事前小型smoke。A／B本輪未測，K1／K2不同資料與依賴配置不可當單變因性能比較。原1GiB失敗與唯一fallback結果均保留。

已讀根目錄`cleanup.json`：3174／19640／19641沒有剩餘listener，最後觀察的1637／2237／2257／2258均不存在；MinIO正常退出，reader保留Next受控SIGTERM的exit143／unit failed狀態，與負載中的WORKER_START_TIMEOUT分開。兩installed DB hash亦與reviewer重算相符，V2 activated=false。原始證據位於 `evidence/c-million-20261116/{formal-1,fallback-1}/`，主要核fallback的raw／status／resources／events／disk／freeze；analysis僅作輔助對照。

## 下一個最有價值的單變因：先完成更新

**優先更新可完成性，再改善更高consumer率下的Web保護。** 已有2/s consumer＋2/s bulk下的短窗Web合格子證據，可作暫時研究操作範圍；但不能啟用新快照，直接阻斷持續同步／日常維護。這不是認定2/s已滿足公司需求，而是按目前已知阻擋排序。

若使用者之後另行授權，最乾淨的下一個候選是**只把reader記憶體4→8GiB，維持2 CPU、同SQL／workers／30秒gate、同2/s consumer＋2/s bulk與更新方式**，檢驗新舊版本重疊在更高記憶體預算下是否能啟用，並量新增每reader4GiB規劃上限是否值得。這不是本輪第二備案批准；若這個成本已不能接受，就先不跑，轉討論更新架構／保留策略，不默放寬驗證或期限。即使成功仍保留cache／order confound，不單次宣稱純RAM因果。

Web保護是另一獨立問題：若正式需求超過目前可觀察的consumer2/s，後續才以同總資源下的有界admission／排程隔離作單變因，承認可能降低consumer吞吐或增加拒絕；優先權本身不會創造CPU。不要同時加記憶體、改SQL又改pool，否則失去選擇依據。

成本上，C已新增stream publisher、長駐worker與背壓、SSR及版本pin、更新驗證／排空與資源監測責任；備案又增加每reader3GiB上限，尚未換來更新完成。中央兩版發布PUT／GET各約6.657GB、publisher峰約117.87MiB是另一成本桶；MinIO4 CPU／4GiB不能省略或視為C相對A獨有節省。公司工程人時與A既有自動化增量未知，**不能由這輪宣稱C較省或應淘汰A**。

已限定複核主結果稿`C_MILLION_RESULT_20261116.md`主要結論：4/s升階停止、更新84.44／180秒、423成功／477未送取消、246下載重疊、原freeze時序與下一步未授權界線均與本裁定相符，無必改結論。HTML／手機呈現由主agent另驗，不以此文字複核代替browser驗收。
