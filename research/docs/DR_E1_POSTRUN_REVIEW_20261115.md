# E1 r2 獨立結果審查

2026-11-15。**E1未閉合，不進E2執行，也沒有淘汰C的證據。** 兩候選的必要內容與搜尋結果獲得有限子證據；時間戳判斷與身份切換UI仍未完成。下一步應先做針對這兩個缺口的最小補驗，不應先重做搜尋或重跑整份矩陣。

本次只讀已保存證據，另寫本檔與 `evidence/v1-e1-20261115/postrun-review.json`。沒有啟動服務、HTTP/UI重播、修改oracle／provider或原結果。原oracle作者是本reviewer；主agent已獨立核oracle並找出R09初版錯誤，修正歷史保留，不能將本次稱為第二份獨立oracle設計。

## 原裁定保持不變

- r1：monitor執行host遭execution policy拒絕，0案例／0請求，屬儀器啟動失敗，不是B/C功能失敗。
- r2：46案例／86請求，正式 `formalPassed=false`。原18案例通過、28失敗；原51請求通過、35失敗。B為20/43請求通過，C為31/43；**這不是引擎品質勝負**。
- 35筆失敗都是AUTH_TIMESTAMP：原server authorizationCheckedAt比parent endedAt晚2–11ms；B有23筆，C有12筆。根因未知，不能直接歸因時鐘精度、Windows、Next或搜尋速度，也不能事後加容差救分。
- 原runner先驗時間戳才驗JSON內容，這35筆後續斷言當時未執行。本次離線核對是新增的來源佐證，不能回填原passed。

## 離線核對能支持什麼

獨立讀取requests.jsonl，逐一對應凍結oracle的request／identity及chain／D02 baseline。86筆全部一對一對應，沒有缺步或重複。82筆保留JSON可核；4筆PDF只保留原量測hash／bytes／headers，不能假裝本次重新hash了HTTP原始下載body。

對JSON重新檢查狀態、snapshot、必要／禁止頁、已明定total、每個hit的可信Space與所有metadata tags、title／snippet投影、完整正文、media membership／欄位／URL及錯誤形狀。另核原紀錄5秒期限、no-store及PDF記錄hash／bytes。**除另行保留的時間戳問題外，未發現內容不符。** 機器可讀逐筆核對在postrun-review.json；這不是新的86次HTTP實驗。

具體有限子證據：

- 24個必要搜尋回應均為200，指定目標都在Top10，涵蓋中文、英文、中英混合、技術碼、title、正文、PDF抽取文字及Space／Tags AND。
- R04用all身份：a-relay命中，只有zephyr而缺primary的b-relay排除。R11只回a-tag-both；單tag、正文假tag、另一Space頁排除。
- 無權Space與none的搜尋為0；跨Space直取與錯page→media關係拒絕；unknown回503，沒有以空結果假裝可用。
- N07兩候選均SEARCH_UNAVAILABLE而本地正文仍200。B lifecycle／server log記錄切至隔離19390及fetch failed；C記錄child失敗。這支持本次故障接縫，不能代替正式MinIO／ReBAC或全故障域驗收。
- 內容鏈的正文與media清單吻合來源，R09及D03的四筆PDF記錄皆為固定677bytes／來源SHA。原UI流程另實際下載並驗hash成功，仍須與完整正式consumer驗收分開。

## 有意義的搜尋差異

| 案例 | B與C已保存結果 | 意義 |
|---|---|---|
| GTX-412 | total2；a-code-near第一，正確a-code第二 | 兩者都出現拆詞AND造成的近似碼命中。完整代碼嚴格性仍未定，不能只淘汰C或宣稱已接受體驗。 |
| silverline certificate | total2；a-pdf-near第一，a-pdf第二 | 否定句仍包含兩詞，是合法詞面命中；PDF目標本身只由附件抽取文字命中。沒有證明搜尋理解否定語意。 |
| relay | total15；a-relay第一，其他干擾頁次序有差異 | 本fixture有辨別力的Top10任務取得子證據；不代表公司語料排序品質或全面ES等價。 |

## Drift：政策符合不等於目前權限安全

D01兩候選仍傳回快照中的a-move搜尋資料與正文；相對模擬目前已移Space b的關係，這是可見暴露。D03仍交付快照保留membership的PDF；相對模擬目前已解除關聯，同樣是暴露。不能將這兩題的政策吻合畫成安全綠燈。

D02 baseline可見b-roles；revoked-b後搜尋0，正文／media清單／下載404。這支持本輪profile切換後的拒絕，不證公司ReBAC撤權時限。D04維持原snapshotCapturedAt與a-sync正文；目前來源內容差異未知。27小時變更時差、28小時snapshot age是固定標籤計算，不是實際長時演練或量到的暴露窗口；正式時效接受仍未取得。

## UI與畫面證據界線

兩候選各有PDF搜尋→閱讀→載入→下載hash→popup→返回焦點、Tags AND兩個task通過。各自另外兩個task在getByLabel('研究身份', exact:true)的selectOption處逾時，原task失敗維持。

從受凍結runner的順序及逾時位置，可確認empty-and-unknown在身份選擇前已完成無結果標題斷言；**unknown畫面、身份變更清除、桌面搜尋的後續步驟未驗**。沒有pageerror／HTTP error不能填補這些缺口。現有資料只定位到locator未解析，未取得當時accessible name／DOM快照，不能宣稱是純測試錯字或產品一定不可操作。

主agent另外回報已看兩候選PDF手機截圖，均能讀到silverline certificate及Match seal內容，並確認C Tags手機圖呈現兩tag與唯一Dispatch Handbook、無橫向溢出。這是主agent的agent畫面核對，本reviewer未再次開圖，也不是真人易用性接受。不可將本輪升格公司editor／正式PDF格式相容。

## 保全及資源

本reviewer重新hash r2 freeze中的120檔，全部相符。postrun-preservation記Role已回baseline、SQLite副本已復原；service-stop記3157／19300已無listener。es-after的8個舊index UUID／doc count／write-block均不變；這不是完整ES內容digest。

原26次採樣中未見設定護欄違反：合計程序RSS峰2,151,305,216bytes，runtime＋evidence邏輯大小峰135,549,785bytes。RSS包含ES／Next／browser等受選程序、排除OS cache且可能有shared頁重計；不是最低Pod配置或B/C成本比較。本卡約51.79秒且每次C搜尋啟短命child，不作容量或延遲排名。

## 下一個最小決策

1. 保留B/C候選，維持A可行基準。沒有證據顯示C需要持續客製語意修補才能完成這組必要任務，也沒有成本證據顯示C較省。
2. 先另立小型診斷卡：以一個快速正文與一個搜尋／Role情境，記client/server各自wall clock及單調計時、request關聯與授權讀取時點，確認AUTH_TIMESTAMP比較是否成立及問題出處。不要先猜容差、直接提高門檻或回改r2。
3. 同一最小補驗只處理共享UI身份控制：檢查實際label／accessible name，再驗必要身份轉換、未知權限訊息與舊結果清除。以失敗路徑為限，不重播PDF／Tags成功流程或全部矩陣。
4. 這兩缺口有可審查新證據後，再決定E1如何有限結案及是否進E2；本次不啟動新卡或授權自動重跑。

證據入口：`evidence/v1-e1-20261115/r1/summary.json`、`r2/summary.json`、`r2/requests.jsonl`、`r2/cases.jsonl`、`r2/ui-b.json`、`r2/ui-c.json`、`r2/resources.jsonl`、`es-after.json`；完整雜湊及逐筆離線判讀見`postrun-review.json`。

