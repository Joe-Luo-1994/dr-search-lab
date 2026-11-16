# K4 查詢成本分項：獨立結果審查

2026-11-16。只讀 `evidence/c-query-cost-20261116/` 原始結果、EQP、資源及保全檔；未追加SQL、服務或負載。

**裁定：本輪診斷有效且可結案；count不是唯一主因。下一個唯一候選選「新DB副本補metadata統計，查詢不變」，先不改寫SQL。** 此處只選擇後續設計，沒有授權自動執行、替換正式artifact或再跑Web。

## 原始證據與解讀

從raw另算9次reference、45次profile與9組後置EQP，均完成；54個搜尋結果另依source predicate核total、eligible／唯一Top10、metadata、tags、snippet，45次profile與原worker完整有序結果一致，無差異。內部執行27.145秒，外部controller約27.436秒；無deadline、查詢錯誤或修補重跑。

45次worker時間合計21,033.55ms，其中count prepare＋execute為8,932.40ms（42.467%）、Top10 prepare＋execute為12,095.96ms（57.508%）、最後補tags欄位3.016ms（0.0143%）。這是**九shape各做五次的總時間占比**，不是九個百分比的平均，更不是正式流量加權結果。tags補欄位很小，不代表Tags AND filter便宜；其EXISTS條件已計入count和Top10。

| query | worker中位數 ms | count中位數 ms | Top10中位數 ms | worker min–max ms |
|---|---:|---:|---:|---:|
| common | 777.66 | 219.20 | 558.32 | 769.99–782.83 |
| rare | 0.159 | 0.086 | 0.055 | 0.154–0.214 |
| chinese | 372.12 | 145.77 | 227.35 | 371.65–374.87 |
| space | 497.40 | 238.74 | 259.28 | 492.64–502.48 |
| tags | 1040.96 | 486.19 | 554.67 | 1027.30–1052.71 |
| absent | 0.128 | 0.081 | 0.038 | 0.119–0.144 |
| published-marker | 0.346 | 0.109 | 0.163 | 0.290–0.490 |
| restricted | 654.89 | 240.19 | 414.62 | 652.16–672.29 |
| restricted-tags | 858.01 | 452.55 | 405.46 | 857.70–861.54 |

各欄各自取中位數，不能要求分項中位數精確相加等於整體中位數。每shape僅五筆，不作穩定P95或顯著性宣稱。未分配時間含normalize、組裝與計時開銷；不是已獨立量得normalize。即使假設完全消除count，本組合仍保留約57.5%的Top10工作；這也只是單程序成本算術，不能換算Web吞吐收益。

EQP確認common、space與tags先走FTS再查pages；space只回5,051個結果，仍不能由結果量推論實際候選訪問量。restricted-tags的count選pages_space，Top10仍從FTS開始。九個Top10計畫皆顯示 `USE TEMP B-TREE FOR ORDER BY`，但不能因此斷言排序就是57.5%全部成本，或它把所有資料寫到磁碟；Top10分項同時含MATCH、JOIN、filters、snippet與排序。SQLite官方也將EQP定位為高階查詢計畫描述，temp B-tree條目說明排序所需結構，而非逐operator時間。參見 [SQLite EQP](https://www.sqlite.org/eqp.html)。

## 資源、退出與保全

109份資源樣本的有效限額皆為2 CPU／4GiB／swap0，current峰3,256,569,856 bytes，max／OOM事件均0。controller PID1413、reference PID1448、profile PID1479皆在cgroup樣本出現；raw確認reference收到SIGTERM並退出後，才spawn profile，沒有兩個SQL程序重疊。Node controller與child計入配額；外層Python監測在配額外。

Profile ready讀回Node v22.18.0／SQLite3.50.2、query_only=1、cache_size=-8192、mmap_size=0。兩SQL child正常受控SIGTERM退出，外層unit自然完成exit0、MainPID=0，非服務失敗。Reviewer事後另重算全部14個freeze檔，零差異，包括V1 DB原SHA `0b1a4379e317ef59289df3c1218c291d6047d5b3a3b9196600e8c182d8bd9147`。

前後DB hash會暖宿主cache；reference與profile是不同SQLite connection。這是單程序、固定資料、五輪旋轉的分項線索，沒有測Web排隊、MinIO、更新、cold-cache或正式資料品質。它補強「廣泛匹配／篩選查詢工作不小」的判斷，沒有因果證明K3所有閱讀延遲，也沒有解決K2更新失敗。

## 下一個唯一候選：補metadata統計

選擇理由是**改動小、能被否證、先保留結果契約**。已核fixture建立pages_space與tags_reverse等索引，最後做FTS optimize，程式中沒有ANALYZE；不能把FTS optimize當成已收集一般表索引統計。SQLite官方說明ANALYZE會收集表與索引統計，提供planner選擇計畫；這只支持值得檢查，沒有保證一定變快。參見 [SQLite ANALYZE](https://www.sqlite.org/lang_analyze.html)。

若下一輪獲准，最小候選是**只在新副本對pages與page_tags建立統計**，保持SQL、現有索引、BM25權重、pageId第二排序、exact total與授權條件不變；先記實際既有stat表／compile options，再明定ANALYZE指令與範圍，不混測全庫／近似統計／新索引／rank變體。新DB會有新SHA，屬診斷衍生artifact，不可冒充原V1 hash或悄悄回填原cache。需記分析時間、CPU、峰記憶體、DB與暫存增加量，因為這可能成為每版發布的新工作。

下一卡保留同配額及九shape，對照未改副本與統計副本的EQP、分項時間和來源／原有序結果。不要只把新結果與今日數字比較便宣稱統計的純因果效果；對照順序、connection與宿主cache須明列。採納條件應在執行前固定：有值得維護的新收益且必要query沒有不可接受退化，而非看到任一plan改變就採用。若計畫不變或差異在小樣本波動內，可停止此候選，不追加調參救結果。

反例需要先保留：common沒有選擇性metadata filter，補統計未必減少其FTS／Top10工作；space0占一半資料，平均統計未必反映各Space偏斜；已存在的pages_space計畫也不保證較快。EQP中的FTS-first與temp B-tree不是錯誤證據。統計可能不改計畫，也可能讓某類查詢退化。因此本裁定是先排除一個低改造成本的未知，**不是預告ANALYZE能修好Web**。

不先選metadata/filter-first SQL改寫，因為它更容易改動FTS匹配、授權組合與排名結果，需要額外設計及維護驗證；統計候選若沒有收益，再根據證據決定是否值得進入該設計。不取消total，不更換rank，不以單查詢變快宣布C優於A／B。正式exact total需求與成本對口仍未知，K2更新可完成性繼續保留。
