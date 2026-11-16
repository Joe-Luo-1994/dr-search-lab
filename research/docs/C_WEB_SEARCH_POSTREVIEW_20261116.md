# K3 獨立結果審查

2026-11-16；唯讀原始紀錄與程式，未追加 HTTP、服務或負載。核對範圍為 `evidence/c-web-search-20261116/` 的 raw、status、resources、ready、limits、freeze、cleanup 與 browser-smoke；analysis 只供對照。

## 裁定

**本輪可以結案為有效的容量限制證據，不能稱全階合格。** 在本次百萬頁、reader 2 CPU／4GiB、共享兩 workers、固定合成查詢組合下，沒有獨立 API consumer，Web 所需搜尋與閱讀仍會互相競爭。4 次搜尋任務／秒加1次閱讀／秒時，搜尋 P95 未超2秒，但閱讀超過500ms研究門檻。最高已測合格組合是2次搜尋任務／秒加1次閱讀／秒；不是公司容量承諾或實際上限。

獨立由 raw 的 `doneMs - scheduledMs` 重算各 lane：

| 30秒階段 | 搜尋完成／原定 | 搜尋整鏈 P95 | 閱讀完成／原定 | 閱讀 P95 | 階段裁定 |
|---|---:|---:|---:|---:|---|
| 僅閱讀1/s | — | — | 30/30 | 11.85ms | 合格 baseline |
| 搜尋1/s＋閱讀1/s | 30/30 | 1074.47ms | 30/30 | 15.66ms | 合格 |
| 搜尋2/s＋閱讀1/s | 60/60 | 1045.95ms | 30/30 | 13.32ms | 合格 |
| 搜尋4/s＋閱讀1/s | 120/120 | 1475.30ms | 30/30 | 818.34ms | 閱讀不合格 |

共210個搜尋 journey 與120個閱讀任務全部成功，沒有 missed、未送取消或失敗。541筆 HTTP 是420個搜尋子步、120次閱讀與1次 preflight；另210筆 journey 是聚合紀錄，不能相加稱751次 HTTP。`stop=null` 表示沒有致命中止，最後一階仍因閱讀門檻不合格而結束；`highestQualifiedSearchRate=2` 正確。計畫全部四階已執行，不需要補跑。

P95 合格不保證每次搜尋都在2秒內：1/s階有一筆約2296.92ms，仍符合事前 P95 規則。不得事後改門檻判它失敗，也不得把整階合格改寫成所有查詢都快於2秒。

## 支持的機制與尚未證明的部分

獨立核243份資源記錄、121份status。4/s階 reader 平均約1.924 CPU cores、current峰3,331,293,184 bytes，該階 memory.max與OOM事件增量均0；CPU節流累計增約0.365秒，queue觀察最大3。status中的頁面工作有數百毫秒排隊，但實際worker page步驟常約0.03–0.1ms；event-loop最大約22.12ms。這支持共享pool中的長搜尋佔用與CPU競爭是值得優先處理的方向，不支持先把本輪閱讀延遲解釋為記憶體不足。

MinIO同階平均約0.0035核、current峰約325MB、無max／OOM增量。此工作集的內容需求很小，沒有明顯MinIO資源壓力訊號；不等於它在一般下載或更新時不會成為瓶頸。status timings為重疊的末256筆視窗，沒有將它們直接串接成獨立樣本或精確的逐HTTP因果證據。`web-ssr`亦合併搜尋前開頁與獨立閱讀的內部步驟。

程式確認每次搜尋在同一worker依序執行帶篩選的 exact count、帶同樣篩選的 BM25 Top10，再補10筆tags；現有 workerMs沒有拆出這些成本。因此「count 很可能有代價」是可檢查假說，**尚不能說 exact count 就是主要瓶頸**。

## 可沿用範圍與保全

這是同一V1上的短窗、固定到達相位與九shape輪替，閱讀只有p000001熱頁。兩lane排程同起點、整數頻率會反覆形成相同相遇模式；結果不是隨機流量分布，也不能據此說2/s在所有突發或長尾閱讀下安全。每個搜尋任務重新開SSR頁，再查結果，並不代表人在已開頁上連續搜尋的成本。1/s至4/s階的cache與順序不同，不能解釋成純率差的精確因果或由K2/K3差異推導caller效應。

五種text query確有browser表單操作與可見結果驗證，無pageerror；filter／identity仍由HTTP harness模擬，現有UI只有q輸入與固定all身份。正式計時是SSR→結果回應，不含browser渲染、hydration或真人理解時間。空結果以空list通過，不代表已有清楚的無結果提示。來源oracle涵蓋合成total、eligible Top10、metadata／snippet／canonical URL；沒有測正式搜尋品質或任意長尾正文閉包，marker也不等於新驗PDF-only搜尋。

Reviewer事後在native另重算全部74個freeze檔，零差異；實際匯入的source／load均在範圍內。已安裝V1另算SHA為 `0b1a4379e317ef59289df3c1218c291d6047d5b3a3b9196600e8c182d8bd9147`，與原pin相同。ready為V1、兩workers、fatal null、testHooks false；讀回限額符合reader2 CPU／4GiB與MinIO4 CPU／4GiB、swap0。cleanup已讀：本輪三ports無listener、兩unit MainPID=0；MinIO正常退出，Next受控停止保留exit143／unit failed，與負載失敗分開。未改K2證據或K3凍結檔。

## 下一個決定

**同意暫緩4→8GiB更新補驗，先用現有程式與紀錄拆解搜尋成本，再選一個可否證的改進。** 這符合使用者目前優先確認一般Web搜尋風險；不是宣告K2更新問題已不重要。更新仍未完成，是持續維運的獨立阻擋，待本次診斷形成選擇後應回到決策清單，不能無限延後。

最小下一步先是唯讀整理：各query的候選量／filters、count與Top10重複工作、BM25排序、Top10補tags，以及現有pool等待如何影響閱讀。若靜態資訊不足，才另立有界分項計時卡，保持exact total、授權、排序及結果欄位不變；本review不額外授權執行。Exact total是本輪合成契約，是否為正式產品需求仍未知；可以向對口確認，但不能為讓本輪通過而默改契約。

不要過早只選SQL優化：若長搜尋即使優化仍足以佔滿兩workers，閱讀admission／排程保護也是候選；單純優先排隊不能搶占已在執行的同步SQL，隔離又會占用或重新分配既有CPU／worker預算。另一方面，只提高CPU額度且保持兩個同步workers，收益也未必線性。下一張卡應只選有證據支持的一項改動，量閱讀收益與搜尋吞吐／拒絕的代價，不同時加RAM、加worker又改SQL。

已核主Markdown結果的數字與上述主要結論相符，無阻擋交付的必改事項；HTML視覺驗收由主agent另負責。本輪支持辨認C的限制，沒有A／B同需求成本或公司需求吞吐證據，不能宣布C勝出、淘汰A或承諾第一版已可正式承載。
