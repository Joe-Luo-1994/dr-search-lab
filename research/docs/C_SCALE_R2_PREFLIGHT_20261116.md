# C擴容 R2 唯一備案正式前裁定

2026-11-16。唯讀 `evidence/c-scale-20261116/r2/` 及native檔案，未執行HTTP、負載或修改任何freeze輸入。

**Gate通過，可執行唯一R2正式輪次：reader8 CPU／12GiB／8 workers，MinIO維持4 CPU／4GiB。** 依R1可觀察的CPU／worker競爭提出部署preset假說，不是已證純CPU根因，不預告CONTENT_BUSY或MinIO壓力會改善。

已核實：

- Fresh-ready為V1，觀察約17.356秒，fatal=null、testHooks=false；八個worker PID皆指向新R2 runtime與cache，歸屬同reader cgroup。
- 實際cpu.max為reader800000/100000、MinIO400000/100000；memory.max分別12884901888與4294967296 bytes，兩者swap0。limits於worker出生前讀回，ready另補八worker歸屬。
- prepare記MemAvailable為19,991,990,272 bytes；已審helper在start強制要求reader＋MinIO＋1.5GiB餘裕（17.5GiB），本次已越過此gate。ready階無guard觸發，正式仍保留host／磁碟監測。這不是允許使用被否決的16GiB reader。
- Reviewer在native獨立重算全部80個freeze檔，零差異；與R1共用的73個輸入hash亦相同。直接核新runtime：service／worker／storage與K2原檔相同，pool只固定worker數2→8，沒有改SQL、queue16、content4或timeout。
- 既定工作點、七階順序、門檻、版本／退役義務與內900／外960秒護欄沿R1，不降負載或另加調參。

R1整體不合格與五個未完成任務完整保留。R2若全過則停止擴容，進入可維護性與操作成本判斷；若仍不合格或遇品質／未知服務錯誤，也停止本輪擴容，不執行第三階、不偷偷調content槽／SQL或放寬驗收。正式結果、保全及cleanup尚待事後審查，本文件不是容量成功證明。
