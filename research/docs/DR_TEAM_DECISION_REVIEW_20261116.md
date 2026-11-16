# 團隊選型報告：獨立內容審查

2026-11-16。已讀主報告HTML、同名MD索引、`scripts/team-decision-20261116/build.mjs`與六工作包JSON，對照最新落地範圍、選型差額、K5／O1及Pagefind歷史重判。未啟服務、查詢、壓測或瀏覽器；主agent另負責UI。

**裁定：內容方向與研究範圍符合，兩項文字／驗收條件待最小修正；不需要新實驗。**

## 必改

1. 同名MD「百萬頁混合流量＋更新」列寫「R1更新失敗5/1620」，會把任務拒絕誤讀成更新未啟用。應改「R1更新完成，但更新階5/1620任務被拒，體驗門檻未全過」。R1啟用與退役證據成立，失敗的是共同工作點資格；HTML正文已有正確區分，索引須一致。
2. 六工作包02的accept「不同排名與未支援功能可解釋」不足以作驗收。改為必要功能與consumer任務成立，排名差異／省略功能由對口明確接受，未接受差異不算通過；不能只因作者解釋得出原因就降低必要需求。同步builder、JSON與生成HTML，不要求ES每個結果等價。

另首屏「保留A為替代方案」建議統一成「保留A為完整可行基準」，以符合全文定位；這不是要求改回以A資料阻塞C盤點。

## 已對應的內容要求

- **目標先行與就地證據：** 搜尋、閱讀／下載、更新／重啟各有機制、受控證據、反例與正式未知。E1時間戳／UI失敗保留，近似頁排名不當語意等價；遠端失聯時只搜尋可用、內容不可用，PDF下載不當視覺預覽驗收。
- **容量與重啟界線：** K5 R1反例與R2有限通過並列；reader和MinIO配額分列，短窗／hotset／混合資源與cache差異可見。O1小fixture startup不拼成K5同build全通過，壞pin拒絕服務與未驗復原清楚。
- **最新scope優先：** 「A主要只剩ES移轉」標為使用者目前理解，非公司已驗事實；A輸入暫缺不阻塞C六包盤點。沒有延續舊selection將所有後續工作鎖死在取得A資料，也沒有因此虛填A成本。
- **應用與引擎分開：** A是完整stack，B不是A；移除Backend／MariaDB的正式資料、授權與API轉接責任未全歸SQLite。中央與每站責任分開，C不是只剩MinIO；本地可重取不等於沒有磁碟、下載或復原成本。
- **六包具體可估：** 沿用／適配／新增、建議角色、驗收、持續責任與未知均有欄位；研究機制不冒充production組件，owner不冒充已承諾。先估範圍並找會翻轉決策的未知，不要求先做完六包。
- **候選公平：** Pagefind的小型Next成功、100k／6GiB建置預算失敗、舊中文parity反例及後來修補均保留；不將builder失敗當reader淘汰。A自動化不歸零責任，也不背全部既有平台研發；共同成本僅同範圍／配置／增量相消。沒有假造人日、頻率或成本排名。

## ES機制與來源核對

本次另讀Elastic官方文件：snapshot可跨cluster恢復並需版本相容；alias單次多action可切換，但亦有部分action失敗的回應與前置條件，不能只憑acknowledged判定整組成功；同repository只一個cluster writer，其餘唯讀。報告保留候選設計／實際版本待核及錯誤檢查，未把alias當MariaDB／MinIO的跨系統原子切換，內容口徑可接受。

來源：[Restore](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/restore-snapshot)、[Aliases](https://www.elastic.co/docs/manage-data/data-store/aliases)、[Repository](https://www.elastic.co/docs/deploy-manage/tools/snapshot-and-restore/self-managed)。這是官方能力核對，不是本次或公司ES實驗。

## 產物與交付邊界

在記憶體執行builder的純生成部分、攔截檔案寫入後比對，生成HTML及六包JSON均與現檔逐字一致，未改主資料。兩項必改完成後只需定向核對，不重開研究矩陣。可交付的成果是團隊能討論必要差異、交付範圍、owner與下一個關鍵未知；不是正式採用批准、全套DR驗收或C成本勝出。UI／列印／手機操作與真人理解不由本次靜態review背書。

## 定向複核：全部closed

已核目前MD明示R1更新完成、5/1620任務被拒與體驗門檻未全過；六包02驗收改為排名差異／省略功能須對口明確接受，未接受不算通過，builder、JSON及HTML一致。首屏亦統一保留A為可行基準。再次以記憶體生成比對，HTML與JSON均逐字符合目前來源。

**兩項必改全部closed，首屏一致性修正完成；無剩餘內容審查阻擋，可作團隊選型討論報告交付。** 最新scope修正、A／B／Pagefind界線、跨build不拼接、成本未知與owner待確認均保留。本輪未追加任何實驗或瀏覽器操作。
