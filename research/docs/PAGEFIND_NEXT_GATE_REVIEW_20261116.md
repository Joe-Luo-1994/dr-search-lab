# Pagefind下一輪gate：獨立設計審查

2026-11-16。已讀 `PAGEFIND_NEXT_GATE_20261116.md`、既有團隊重判及MS1證據脈絡。本次只做設計審查，未build、啟服務或執行查詢；沒有修改主卡。

**裁定：方向有判別力，可準備隔離程式與oracle；整輪執行前有兩項必要補點。** 主卡明確把100k建置成功與reader／完整C資格分開，值得用一次固定中央預算檢查舊建置邊界，不能由本審查直接當作runtime執行批准。

## 必要補點

1. **G2也必須有完整且可停止的預算。** G1有4CPU／12GiB／swap0／30分鐘及產物護欄，G2卻未定reader程序群組限額、單query硬截止、全G2期限與小fixture案例總數上限；舊browser反例也可能留下程序。請在freeze前定義這些值，含Next／本地資產listener／WASM所屬程序；由外部controller在超時時真正停止所屬程序樹，finally清理。不得把HTTP abort當作同步工作已取消。G1「主機available低4GiB」需指明Windows及WSL各自監測、取樣間隔、監測例外與觸限後不可再啟下一階；不可將兩者available相加當不同實體餘裕。這是既有工作量的邊界，不新增容量階梯。
2. **G2必要契約要在看結果前可判定。** 12題100k短測與≤100頁能力fixture可保留，但需要凍結request、identity、預期status／error、必要／禁止pageId、total及實際輸出metadata契約。unknown不得變allow；空scope與未授權必須核total／hits及不洩漏欄位，而非只看指定目標有無出現。實際回傳title、Space、Tags、snippet或URL等，都應由來源oracle核同版與授權；沒有回傳的欄位不新增義務。Tags AND需來源反例僅具一tag，Space+Tags需跨Space同詞反例；可放在原小fixture，不增矩陣。必要差異必須明列並由對口接受，不能用「highlight／精確排序非先決」掩蓋授權或指定文件缺失。

兩項為執行前要求，不把目前尚待填的正式owner或production成本當成設計不能討論的理由。原始100頁中文反例若找不到，記未重現即可；不應阻擋有獨立價值的G1，但G2結案要保留這個未閉合項，不能宣稱舊parity問題已解。

## 已可接受的設計

- **建置gate的價值與預算：** 100k／一次固定4CPU、12GiB配置，包含mapping與完整性驗證，有機會判定較大中央預算能否買到完整可用產物。相對盤點的WSL約19.5GiB，保留宿主餘裕的設計合理；實際Windows／WSL餘裕與cgroup仍必須執行前readback。本審查沒有自行重查或保證該時刻可用資源。
- **來源及比較公平：** 固定Pagefind1.6.0與舊MS1來源／adapter bytes，可將新結果限定為另一預算下同路徑的表現；硬cgroup與舊RSS軟停止差異已明列，不算比例提升。SQLite後獲擴容不構成Pagefind已失敗的理由，也不構成必須給builder同一reader預算的理由。
- **產物閉包：** 全新輸出、不接舊成功manifest、streaming SHA、雙向page／mapping與Space一致性，能避免把partial build誤報成成功。多檔數／allocated bytes／mapping與hash時間均是有用成本，不只看builder RSS。
- **架構界線：** Pagefind索引位於Next Pod可存取的私有本地版本，server查詢；舊本地listener與loader仍有維護成本，不把browser卸載計算優點套來。G1舊MS1含本地正文／附件、無Tags；G2另fixture補能力，不冒充已接遠端內容的新C，亦不複製SQLite已有通過數據給Pagefind。
- **歷史證據：** 小型Next成功、已修fragment／依賴問題可沿用，不必整輪重做；舊中文1對3反例只做原bundle固定query，不能用新fixture洗掉。必要功能確認與效能量測分開，短測不產QPS承諾。

## 結果如何改變決策

G1超預算／無完整產物：保留此次配置不合的證據，停止本輪，不加RAM或跳1M；不永久淘汰Pagefind。G1成功但G2必要契約失敗：先分類資料／授權／語意或adapter問題，報修補責任，不改oracle救通過。兩者通過：只取得更強的候選資格，仍未證reader常駐負擔、Web干擾或總維運更低。

下一階應由這輪實際新增loader／mapping／發布負擔及潛在每站收益，選最能翻轉決策的一個未知。主卡列出的Web／consumer／下載／更新應視為未來公平對照的契約清單，**不是G1/G2成功後自動執行整套矩陣**。若沒有可解釋的收益假說，已有能力成功也允許停止投入。正式API／ReBAC／團隊工時未知，不以builder秒數或少一個服務代填。

## 定向修正複核：設計closed

已重新讀主卡。G2現明列整組4CPU／4GiB／swap0、含小fixture與清理15分鐘、最多36案例／48搜尋請求、外部5秒query硬截止、browser導覽30秒及全部子程序finally清理；Windows／WSL available各自低4GiB即停。授權契約明列無身份401、unknown503不帶hits／total、無可讀Space為200空結果／total0，所有實際回傳欄位同版且屬允許集合，total在授權與篩選後計算；oracle須事前獨立review。後續reader問題改為擇一，不自動矩陣。

**兩項設計finding均closed，可按此卡準備實作與獨立oracle，無需擴張案例。** 這是設計批准，非未讀程式的執行批准。正式前只需核對具體controller確實包含兩端監測的取樣間隔／例外停止、不可逆stop及整樹終止，凍結case與來源預期，取得實際cgroup／宿主餘裕readback及隔離輸入hash；不以準備欄位尚未完成反向宣稱本設計無法討論。尚未執行任何build或load。
