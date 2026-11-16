# C擴容 R1 正式前裁定

2026-11-16，獨立reviewer；只讀本機匯出證據與native檔案，未送HTTP、未啟服務或負載。原設計review、卡、script與既有freeze均未修改。

**Gate通過：可按凍結卡執行唯一R1正式輪次。** 此批准僅適用4 CPU／8GiB／4 workers的R1，不包含R2或任何SQL、期限、oracle調整。

已核 `evidence/c-scale-20261116/r1/` 的ready、limits、prepare、config-public與freeze-before：

- Fresh-ready為V1、fatal=null、testHooks=false；3,312,799,744 bytes下載約5.594秒、觀察ready約10.065秒。這是單次就緒證據，不是正式RTO，也不稱宿主cache冷。
- reader實際cpu.max=400000/100000、memory.max=8589934592、swap0；MinIO為4 CPU／4GiB／swap0。prepare記當時MemAvailable約20.10GB，後續仍受host與磁碟guard約束。
- 四個workers（1497、1498、1499、1505）的cmdline皆指新R1 runtime與新V1 cache，歸屬同reader cgroup；ready無queue或updating。limits檔於worker出生前只有Next PID，另有ready的worker歸屬證據，不能把兩個時點混讀成缺worker。
- Reviewer在native另重算全部80個凍結檔，零差異；freeze記K2 reused mismatches為空。另直接對比新runtime與原project：service／storage／worker相同，pool僅將2個workers改為固定4個；原SQL、query4秒、pool30秒、update150秒與原Next build均未另改。
- 最終靜態修正已在設計review關閉：各lane分母與版本義務、舊pool退役及PID退出、activation後20秒新發送V2任務、未知overlap不填0、內900／外960秒與finally清理。

正式仍按baseline→Web2／4→consumer1／2→bulk→更新順序，首個不合格停止後續階；資料／授權錯誤立即停，不降載救結論。成功達工作點即停止擴容。若R1不合格，保留原結果並先判斷是否確有資源證據；8 CPU／12GiB／8 workers仍需另核宿主餘裕及有限備案條件，不能自動升級。

結案待核raw／資源／持久更新事件、保全與cleanup，並記人工操作／介入與配置維護責任。此時不宣稱容量已通過或DevOps長期工時已降低。
