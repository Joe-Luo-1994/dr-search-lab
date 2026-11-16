# Spec v0.1 → v0.2：第一輪 finding 處置與第二輪反例

2026-11-14。v0.1保留於[spec-v1.md](spec-v1.md)，v0.2見[spec-v2.md](spec-v2.md)。以下是作者處置，是否足夠由R2獨立判斷；沒有新測試或正式對口接受。

| R1 ID | v0.2處置 | 產品代價／仍開啟的工程缺口 |
|---|---|---|
| JA-01 clocks | 分search/body API P95與5s deadline、網站可讀、下載首byte2s/總10s；鏈總20s，排隊包含，重試不重置時計 | 20MiB/網站時計未實測；舊5s小檔HTTP不升格支持新範圍 |
| JA-02 age/lease | 安全/當前授權→age→鏈→retention；保留完整15min提案，但只有age餘額≥15min且必要物件可保留才開新鏈；不足明確DATA_EXPIRING保留上下文；P-I同樣檢查餘額 | 接近24h前15min會提早停止新鏈，是未接受的可用性代價；來源cut/clock可信度、routing/GC/age UI未實作 |
| JA-03 arrivals/denominator | 固定到達2鏈/s＋4直接body/s、30min；10 in-flight、pending100；所有scheduled obligations含超限/漏送/blocked；完整鏈/各操作成功率分列≥99%，每項必要任務須能完成，拒絕另列 | 舊closed-loop與MR2資料不能填新負載達標；新的排程/排隊與30min成本未驗 |
| JA-04 existence | 系統AUTH_UNAVAILABLE503與授權範圍零結果分開；單一物件不存在/無權共用404及外顯文案；可信診斷另層；不能依物件是否存在改變系統故障訊號 | 正式consumer錯誤碼／UI尚未接受，完整存在性與側信道審查未做 |
| JA-05 authority/binding/stream | 定T_eff權威生效、t_auth當前決策、T_seen僅診斷；同policy epoch的current decision/current membership約束search total/rank/snippet及body/media；unknown可拒但記可用缺口。stream明示admission grant最多10s，非即時逐byte撤回 | GM是否可提供一致可信資訊仍未知；page搬移、epoch相容、反映最新政策未實作。in-flight最多10s風險待owner接受；更強stream取消另profile |
| JA-06 P-C degradation | 來源可用是正向前提，不免除失聯錯誤/能力狀態/上下文保留與恢復重試；正確503不算完成工作 | Remote JSON路徑與恢復上下文未做；P-I仍是額外完成承諾 |
| JA-07 change boundary | 下方四個具體需求調整，架構作者提供對應重用/最小改動/翻轉條件及唯一下一輪候選卡；不把模糊「可談」當改設定即可 | 文件推導不是新效能證據；下一輪卡尚未執行 |
| JA-08 evidence link | Spec本身既有review與posthoc links核對；架構E06失效由架構作者修v2，v1保持歷史 | 只修可追溯，不新增Pagefind能力或消除舊失敗 |

## 四個新反例：調需求不只是調數字

| 需求調整 | 使用者會得到／失去什麼 | 既有證據能保留什麼 | 不能直接承諾的部分 |
|---|---|---|---|
| 搜尋API P95 2s→5s | 接受更久等待，可能放寬候選的延遲餘裕 | 原同S1功能oracle與search分段；SQLite既有64search短樣本P95約2.446s | 不代表10-slot固定到達/30min通過；網站結果3s目標不會自動放寬，若API實際變3–5s仍需另談人端體驗 |
| 必要附件20MiB→1GiB | 更完整支援大型檔案，但下載等待增加 | 小物件完整性與同版授權機制是起點 | 同100Mbps純payload下界約85.90s，原10s總下載無法僅調buffer解決；需談總時間/續傳及in-flight授權窗口，磁碟/流量亦要量 |
| 同鏈15min→24h | 操作可跨班次，不需重搜 | releaseId、完整性與跨版問題的oracle仍有用 | maxAge同為24h時，只要sourceCut已過去便無完整24h新鏈餘額；須改age政策、續鏈語意或承認不可開鏈，不能只保留檔一天 |
| reader冷恢復120s，另要求下載鏈路100Mbps | 更貼近較慢鏈路時的使用者等待 | MR1/MR2真GET/hash及小/大副本啟動證據 | 2,133,065,728B純payload約170.65s，未含驗證/啟動；若此帶寬確為恢復前提，需改準備方式/傳輸量/頻寬或承諾。Q4附件100Mbps原本不自動套Q8 |

三個固定底線仍不因上述調整讓步：不越權、不靜默混版、不把錯誤或漏送當成功。任何允許過期內容、跨請求權限cache或更長in-flight下載授權，都需明列政策及受影響owner；本輪沒有替他們同意。

## 未解清單（R2不得因文件完整而改成已完成）

J01入口/登入/DNS與age UI、J02正式relevance與新負載、J03實際Lexical renderer、J04大型附件/續傳、J05正式API/owner、J06透明跨reader15min、J07 remote正文失聯/P-I15min、J08真隔離冷恢復/非作者操作、J09 GM/current binding/revocation/stream政策皆仍有缺口。Spec v0.2提供可談的安全預設及反例，沒有候選因此正式驗收。
