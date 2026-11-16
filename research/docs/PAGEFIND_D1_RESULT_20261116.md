# Pagefind 首題診斷：停在 pf.search 返回前

2026-11-16。**同一筆 100k 查詢再次達到 5 秒截止；本輪已定位到 `pf.search()` 尚未返回，自有結果映射尚未開始。** 不再以整段 HTTP timeout 推測 SQLite mapping、初始化或純 WASM 是根因。這是定位證據，沒有完成搜尋正確性或容量驗收。

本輪只有一筆 query：`huge / commonterm / page=1 / pageSize=10`，oracle 預期 total=50,000。同 G1 產物、G2 query/oracle、Node22.18.0、4 CPU quota／4 GiB／swap0／5秒外部截止；新 server，無預熱或第二題。原 G2 逾時結果保留。這次複製已完成的 Next production build、只加入 trace，沒有重建索引/Next；不是完全相同準備流程的效能 A/B。

## 一條請求走到哪裡

以下相對時間，以 server 收到 HTTP request 為起點，來自同一程序 monotonic clock；client 5秒截止另列，不混用程序起點。

| 階段 | 本輪觀察 | 能得出的判斷 |
|---|---|---|
| Next 收到 request → adapter 進入 | 約24 ms | HTTP 已進入正確 handler，不是一直停在路由之前 |
| manifest、SQLite 開啟/設定 | 有 start/end；state約10 ms | 這次初始化完成，沒有一直卡在DB開啟 |
| Pagefind import/options | 都完成，約5 ms與1 ms | 不能把後面整段等待稱為模組 import 未完成 |
| `pf.search()` 開始 | request後約46.7 ms | 進入引擎 API，包括其內部資產/解碼/搜尋/結果處理 |
| 五個資產 listener request | 合計 **843,740 bytes**；皆200，最後server finish在request後約 **145.8 ms** | 已觀察資產在server端快速完成送出；不是證明client已消費/解碼完成，也不保證不存在其他內部等待 |
| `pf.search()` 返回 | **沒有 end event** | 至截止尚未觀察到返回 |
| 自有 mapping、Space核對/去重、十筆正文組裝 | **沒有 start event** | 這次尚未進入這些階段，不應先優化它們來解釋這次等待 |
| client 完整操作 | **5,005.051 ms TimeoutError，未取得response** | 仍未滿足本次5秒研究界線，不等於正式產品SLO判決 |

五個資產為 entry JSON、語言 metadata、WASM、index shard、Space filter。trace 中 WASM 路徑是 `wasm.unknown.pagefind`；這只是一個實際檔名，**未驗證它是否異常或與本次逾時有關**，不得直接歸因為中文語言問題。本題關鍵字是英文 `commonterm`。

原始證據：[階段 trace 目錄](../evidence/pagefind-diagnostic-20261116/traces/)／[唯一案例](../evidence/pagefind-diagnostic-20261116/case.json)／[runner里程碑](../evidence/pagefind-diagnostic-20261116/runner.ndjson)／[控制器結果](../evidence/pagefind-diagnostic-20261116/control/result.json)／[實際差異](../evidence/pagefind-diagnostic-20261116/instrumentation.patch)。

## 證據的邊界

- 40筆trace。最後一筆攜帶前39筆累計同步寫入/fsync **58.746 ms**、helper總成本 **59.537 ms**；最後一筆自身成本尚未回填，不填0。這只量直接觀測成本，不保證沒有間接擾動，不能扣除後稱為無trace真實延遲。
- `asset.finish` 是本地資產HTTP server端完成，不代表 Pagefind 完成讀取、解壓、WASM或JS處理。`pf.search`未返回不能再細分為「純搜尋計算慢」或「特定WASM函式慢」。
- 映射迴圈仍會處理全部命中，這項既有成本並未消失；只是在這次觀察中未執行到它。
- 前置完整性讀取會暖OS檔案cache，只有新server/provider狀態可稱未暖機；不是磁碟cold-cache測試。
- 全組停止與清理 **40.077秒**，含凍結/產物核驗與啟動，不是query耗時。監測最後記錄memory.peak **1,657,253,888 bytes**（含前置hash檔案cache等），未記錄memory max/OOM/CPU quota throttling。這些數字不證明reader最低資源或加CPU無效。
- controller reason `QUERY_TIMEOUT`，remainingPids／cleanupErrors皆空。外部kill使runner最終result.json未落盤，不能補造正常完成；case.json與40筆連續seq的trace、控制器結果已保存。沒有重試、加RAM、延長5秒或改exact total；未完成span不捏造耗時。

## 這對選型有什麼幫助

現在較不值得的是盲目增加RAM、先改SQLite mapping或直接做百萬頁完整矩陣。可觀察的阻塞範圍已縮到 Pagefind search API 呼叫內；中央100k建置成功仍有效，但reader候選資格仍未完成，不能排除或採用Pagefind，更不能與成熟度/來源不同的SQLite或完整A排名。

如果繼續，下一項只應是 **同首題的一次 Pagefind 呼叫內部階段觀測**，在少數 await／WASM 呼叫邊界留下可耐停止的記錄，辨識資產接收/解碼、WASM搜尋與JS結果產生等階段。仍需獨立卡與review，不為了取樣偷偷延長本次5秒。依定位結果再選一項改動；本輪沒有執行這個下一步，也沒有修改正式adapter。

新增責任只有隔離副本/精確差異產生器、可耐停止的phase trace與單題runner，屬研究成本；並未讓正式DevOps維運責任自動變少。Agent token/帳務與正式人力成本未取得，保持未知。來源/產物事後保全與獨立裁定見[reviewer結論](PAGEFIND_D1_POSTREVIEW_20261116.md)；其用途是確認證據保全，不把停止結果改成通過。

Reviewer 已獨立核對 10,586 凍結檔及 101,571 產物檔之 SHA／清單均相符，見[事後保全 receipt](../evidence/pagefind-diagnostic-20261116/reviewer-poststop-preservation.json)。本輪已結束，沒有啟動下一個診斷。
