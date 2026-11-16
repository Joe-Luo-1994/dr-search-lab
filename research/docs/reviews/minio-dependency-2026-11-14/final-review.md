# MR2 獨立審查：完整 cache 的 MinIO 故障與限速更新

2026-11-14。**本版有界 MR2 功能與資源門檻通過，執行程序有一項來源凍結時序偏差需保留。** 405 HTTP全符合預期：391個200、14個明確拒絕。這提高了對「完整本地副本在MinIO暫停時仍能工作、受控下載不拖垮小型舊reader」的信心，沒有證明公司現行遠端正文架構、正式DR或總維運成本已較低。

標準／oracle先由reviewer凍結，實作由另一agent完成，reviewer讀原始時間線、核獨立正文／附件oracle、事後全檔SHA及程式不變。兩組agent不等於DevOps、GM或consumer owner已接受方案。證據在 `evidence/minio-dependency-2026-11-14/`。

## 通過的固定工作與實際故障

| 階段 | 實際證據 | HTTP |
|---|---|---:|
| baseline | MinIO在線；v1 reader每秒一條輪替身份的完整鏈，共10 ticks | 30／30 |
| outage | 真TERM MinIO PID18877，port連線ECONNREFUSED；舊reader同10 ticks、ready、auth拒絕／越權防護 | 34／34 |
| empty | 空cache installer真ECONNREFUSED，active仍不存在；reader health/search/body/media均503 | 4／4 |
| recovered | 同本輪MinIO data以新PID18993重啟；安裝小v2並啟新Next，完整鏈與防護 | 19／19 |
| paced | 20MiB/s接收2.133GB DB時，舊v1 reader100 ticks三步鏈 | 300／300 |
| retained | 新active已提交後，原v1程序仍正確服務舊版三身份鏈 | 9／9 |
| new-large | 新Next對百萬來源三身份搜尋／正文、防護及引用附件SHA | 9／9 |
| 合計 | 包含預期拒絕，並非405種能力或405次使用者成功 | 405／405 |

MinIO確認不可達至重新ready為11:17:53.185Z–11:18:03.222Z，約10.037秒。獨立分析確認outage與empty每個HTTP完整落在這段真停機窗口，非用mock替代連線故障。outage原reader的30次成功操作仍核對同版授權集合、搜尋metadata／highlight、正文和附件exact SHA；三個拒絕與health另計。

空cache安裝失敗原因是具體ECONNREFUSED，installer內部約7.79ms、父程序整段94.15ms，沒有依賴15秒watchdog來假裝正確拒絕。SDK事先固定disableRetry，這是有界測試執行策略，不是正式生產重試／恢復策略。MinIO重新ready後，到小v2安裝、新Next及19項HTTP完成約0.891秒；包含MinIO啟動的recovered case約1.307秒，兩個量測口徑不同。空reader被停止，再安裝／啟新reader；不是原空reader自動轉ready，也不是自動reconciliation或公司事故RTO。

## 限速更新有真實重疊，但負載範圍有限

固定20MiB/s＝20,971,520 bytes/s；2,133,065,728-byte DB純payload下界101.7125秒。實際object開始11:18:18.579Z，完整GET結束11:20:00.293Z，約101.714秒；整個installer含manifest／附件／hash／fsync／activation約102.003秒。下載開始至新Next完成百萬九項HTTP約105.945秒，低於沿用的120秒研究參考；不代表正式RTO，也沒有用更長期限改判性能失敗。

獨立對照installer事件與reviewer wallclock：100個tick的開始，以及100條search→body→attachment完整鏈，全部落在真DB GET窗口。不是下載結束才跑服務測試。每秒一條輪替all/small/huge鏈，與baseline/outage同節奏；paced約99.009秒觀測，最大排程lag約1.33ms，沒有堆積大量client來掩蓋截止期限。

| 舊reader成功操作延遲 | baseline（10鏈） | MinIO離線（10鏈） | 限速下載（100鏈） |
|---|---:|---:|---:|
| search P95／max | 108.06／108.06ms | 9.03／9.03ms | 17.49／32.13ms |
| body P95 | 7.73ms | 3.25ms | 3.01ms |
| attachment P95 | 8.48ms | 3.48ms | 3.41ms |

樣本量不同、baseline含首次worker與cache成本，因此不能由這張表推論停MinIO使服務更快或精確因果退化倍數。能說的是本卡有限工作流沒有非預期錯誤或5秒期限失敗。舊reader僅24頁、附件各88 bytes；新下載雖是百萬資料，但**不代表百萬舊reader在高併發更新時通過**。前輪百萬mixed P95約2.436秒超過2秒參考的缺口仍維持。

限速施於client Transform的累積bytes/time，靠stream backpressure控制消費速率；不是kernel網路整形，socket／MinIO緩衝仍存在。沒有模擬公司TLS、丟包、抖動、多reader搶頻寬或真硬體磁碟爭用。只用一個預先凍結rate，沒有挑最好看的重試結果。

## 新版內容閉包與落盤核對

凍結前readonly掃描確認百萬DB只有p000000000一頁引用非空附件，attachments表只有a000000000/s0000，其schema符合既有API。獨立corpus.attachmentText與DB文字一致，實際68 bytes；本輪manifest補此獨立media物件並真PUT/GET，最後另驗一次attachment HTTP與SHA。MR1百萬版本原本只測搜尋／正文八HTTP，未驗附件，本輪補足不追溯擴張MR1能力。

正式測時結束後，reviewer另唯讀核落盤新DB與附件：DB SHA256為 `bdd4a22ca136ee7112540c6a6a4c670d2871b55517ae5cdf811c0f713d21eaa0`，bytes2,133,065,728；附件SHA為 `01a16802c89b38533692532b207dbefa75f187346eac5dedfda06cc9fe658256`，bytes68，均吻合獨立來源及manifest。這是postcheck，不混入恢復時間或算功能重播。

MR2 core／queries／pool／highlight／search-child五個檔與MR1 SHA完全相同，沒有調SQL、worker或期限求通過。完整物件驗證後才提交新active；原程序仍固定v1，新Next固定large。版本409契約維持，本輪沒有重新驗透明跨reader切版或消除consumer重搜成本。

## 成本、程序偏差及保全

候選採樣RSS峰880.289MiB，包含Next、MinIO、transfer與測試程序，排除OS page cache且可能重複計shared pages；MinIO單PID峰296.434MiB。共享cgroup峰10.468GiB含背景ES／cache／其他程序，不能全部歸因候選，也不能拿880MiB當最低Pod記憶體。新產物峰4.034GiB、free最低11.010GiB，未超6GiB RSS／6GiB新產物／free4GiB護欄。主要磁碟仍是MinIO一份與完整本地cache一份；新增本地cache可重建，不等於Web零儲存或沒有清理責任。

唯一正式build13.096秒，180秒watchdog正確。**實作的freeze/edit prelude使用錯誤cwd，出現FileNotFound／MODULE_NOT_FOUND，但shell繼續執行build；實作source hash實際在build後、driver前保存。** 原錯誤在implementation/prepare-launch-issue.json。reviewer八項標準／oracle輸入先於build凍結且未變；實作核心檔與MR1一致、mtime等只能作輔助，不能補成build前歷史crypto證明。沒有為此重build，沒有實質功能失敗後修碼重播。這項程序偏差與功能pass分列，不能隱藏。

driver共142.073秒，包括多階段安裝、啟停與探測，不是整段持續服務驗收；root約424.721秒monitor另含準備idle，更不能當服務存活時間。root核29個本輪PID都已退出，3137/3138/19410/19411關閉，既有DR19300仍ready。52保護檔hash（原23＋MR1 cache29）、4封存索引完整digest、小S1完整digest、3容量ES metadata/count保持；容量ES全內容本輪未重掃。歷史失敗與本輪預期故障log保存，未commit/push、未公開服務、未新增付費資源。

## 價值與下一個決定

V3取得完整local cache在一段真MinIO停機下工作的有限證據，空cache則清楚不可用並可依runbook恢復；V4取得受控下載與小工作流隔離證據；V5/V6仍維持本卡同版與mock Space底線。這不能自動套到公司現行按需讀MinIO JSON／附件的架構，更不包含GM失效、撤權時效、DNS、MinIO HA、長期資料age或正式RPO。

最有價值的下一個決定是：正文／附件也保留完整本地副本，還是維持遠端讀並接受相應故障降級。DevOps需接受完整cache／暫存多版／頻寬／清理責任，核心consumer需確認409重搜或要求server版本路由；準備者不能把這些成本推給別人當作已解。若對口選擇完整副本且資源範圍確定，再驗百萬舊reader在該限制下同時更新的混合工作流；若維持遠端正文，應先驗其MinIO故障降級，不繼續用全本地bundle成績代替。
