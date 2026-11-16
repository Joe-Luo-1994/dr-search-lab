# C 擴容：以減少長期維運工作為目的的設計審查

2026-11-16。已讀 `DR_OPERATIONS_PRIORITY_20261116.md`、K2 pool／service／storage與K3 runner設計。只讀與設計，未啟服務、建置或負載；正式卡與實作仍待preflight。

**裁定：可準備一個4 CPU／8GiB／4 workers的部署preset，先看是否足以完成目標任務。** 不先保留2 workers多跑一輪純資源歸因；使用者要的是可維護的配置，而非CPU因果論文。若足夠即停止，不追求最高QPS或最低RAM。SQL、資料／授權、排序／total、timeout及一致性不變；增加worker與資源共同構成配置差異，不能稱單純加CPU的效果。

## 配置邊界與第二階

首階總reader額度涵蓋Next、4個SQLite workers、下載／hash、staging、新舊pool與版本重疊，swap0。MinIO維持4 CPU／4GiB另列；中央建置本輪不重做。沿用凍結K2百萬V1/V2與已出版物件、Node／SQLite／Next版本；使用隔離新runtime／config／evidence，不改K2/K3產物。

主agent最新主機讀值為28 CPU、RAM20,969,484,288 bytes（約19.53GiB）、磁碟約927GB free；此為主agent提供的當次盤點，本review未自行重讀。**8 CPU／16GiB reader加4GiB MinIO已無合理宿主餘裕，不接受該提案。** 最多下一階改為8 CPU／12GiB／8 workers，兩服務額度合16GiB，仍須在開跑前重讀可用RAM、既有程序、cgroup與磁碟，證明宿主仍有餘裕；不能靠擴WSL、降MinIO或swap湊額。

第二階只在第一階失敗且CPU／memory／worker競爭證據支持資源或併發不足時成立。品質／授權錯誤、壞hash、未知服務問題、固定slot限制、程式錯誤不能盲升。單個同步SQL在低CPU／無記憶體壓力下仍很慢，也不自動支持更多核。資料不足時保留未定位並先review；不能把任何timeout都解釋為值得擴容。最多一次新配置，原失敗完整保留，第二階仍不合格即停止本輪擴容路線。

更新時首階最多可短暫存在4舊＋4新workers，第二階8舊＋8新；兩pool全部在同一reader父cgroup。必須記實際數目／PID及舊pool排空，不能只報active pool的常駐數量而漏掉更新成本。

## 最小任務流程

目標是Web一般搜尋4/s＋獨立閱讀1/s，並能承擔少量consumer、下載與正常更新。它是研究工作點，不是正式業務需求SLO。

| 順序 | 同時工作 | 時窗與目的 |
|---|---|---|
| Ready／baseline | fresh V1就緒；只有閱讀1/s | 閱讀30秒；確認來源、實際限額、4 workers及正常起點 |
| Web工作點 | 九shape Web SSR→搜尋結果4/s；閱讀1/s | 30秒；直接測已知K3失效點，不重跑1/2/s階梯 |
| 少量consumer | 維持上述Web／閱讀，加consumer1/s | 30秒；consumer獨立lane及九shape輪替 |
| 較多consumer | 同上，consumer2/s | 30秒；前階合格才執行 |
| 下載背景 | 同上，再加已固定附件組合2/s | 30秒；先辨認下載本身能否承受，避免把新增下載與更新一次混在一起無法分辨 |
| 正常更新 | 維持上一共同背景，第5秒真下載並啟用V2 | 180秒；沿K2啟用期限與V2觀察窗，核服務重疊、同版內容、舊鏈與pool排空 |

依序全部通過才稱此配置完成研究任務。首個不合格停止後續階；不為讓更新成功先降Web或consumer率而沿用同一「合格配置」標籤。若未到更新，明示更新未驗。較低背景的更新可以是另一個未來問題，不能當本輪自動補驗。

門檻沿既有研究卡：baseline閱讀P95≤500ms且失敗≤1%；後續閱讀P95≤max(2×合格baseline,500ms)，Web整鏈P95≤2秒，consumer／下載P95≤2秒，各lane失敗≤1%。各自包含排程延遲，不混成總P95；完整回應、正文／PDF hash與source oracle皆核。短窗小樣本不表示正式承諾，單次慢例另報。

保留queue16、query從admission起4秒、pool整體start／quick_check30秒、下載100秒且更新64MiB/s、server update150秒。更新階180秒，第5秒觸發，須在第155秒前啟用並有至少20秒V2觀察；不能把下載完成當啟用完成。HTTP5秒、Web兩步整鏈10秒、drain16秒、整個單次runner最多600秒；外層controller獨立deadline與finally清理。600秒是本輪流程總護欄，不放寬任何既有單操作期限。

版本切換若產生409，要分列needs-research與實際重搜完成，不能當原請求成功；故意的舊URL probe與正常業務到達率分開。自然inflight跨activation的樣本數如實報，沒有就保留未觀察；既有hold機制證據與本輪容量結果分開，不為湊樣本在正式負載人工hold。新版本正文仍限已出版hotset，不能借此宣稱任意長尾內容驗收。

## 最小可重用程式方向

1. **Runtime只參數化worker數。** 原 `c-million-20261116/pool.mjs` 使用硬編碼 `[0,1]`。在新隔離副本將數量變為先驗驗證的config值（此輪4，條件式下一階8），由service.install傳入；兩版本使用同一preset。原worker SQL／source、queue、deadline、版本pin與回收流程不改。status／事件需足以核對初始化、新舊pool及實際PID，不增加排程優先權、cache或SQL優化。
2. **重用既有harness責任。** K3的SSR→九query、獨立reading、source/canonical URL校驗；K2的consumer、完整下載、update、resources與持久event觀察合到新runner。共享abort與完整planned/sent/fulfilled/failed/canceled終態保留，未送取消不算HTTP錯誤也不進延遲分布。不要為新配置另造oracle或改回傳義務。
3. **產物與build先界定。** 若凍結Next build確實透過外部 `CAP_SERVICE_URL` 載入新runtime，可核引用及hash後重用；若任何改動已被bundle進build，則只做一次必要build並有input/output receipt。不能拿舊build hash假證新pool已生效。資料庫與MinIO物件無需重建／重新發布。
4. **記錄配置及最小diff。** 原／新程式差異、config、來源、DB、build、Node與MinIO hash在正式前freeze；核對既有檔保全。reader／MinIO limits、所有worker歸屬與更新雙pool峰值可觀察，外層資源／磁碟guard不受內層abort取消。正式後確認退出／listener、舊pool排空或失敗保舊及artifact hash；不要求重演所有歷史故障矩陣。

## 如何連到DevOps工時，而不是只交付跑分

本輪可以回答：是否只需要調整部署參數，就能避免目前為查詢效能繼續客製，以及正常下載更新是否在既有自動路徑完成。若成功，這是「值得保留的部署配置」，不是已證長期少工。

隨實作與唯一正式輪次記一張短ledger：preset需改哪些模板／設定；fresh建站與正常更新由哪些腳本觸發；成功路徑的人工步驟；失敗告警能否定位；重試／求援／作者介入；等待wall time與可辨認active操作時間分開。增加4／8 workers是否只多一個受管參數，或引出新調參／監控責任，必須如實記。沒有正式工時就留未知，agent花費不能代替DevOps成本。

多一點RAM／CPU但不新增deployment unit，可能是有價值取捨；自製pool、版本installer、producer與中央排程的維護並未因此消失。現有admin-triggered更新成功也不等於已驗自動排程、告警、GC／磁碟回收、rollback或非作者交接。這些沿operations-priority列成後續需確認事項，**不在這次容量輪次順便新增故障／回滾演練**。

達成上述共同工作點就停止擴容，接著評估可交接操作與維護責任，保留ES等路線作對照。若首階不合且次階有證據可測，才用唯一較大preset；若次階仍不合，回到SQL／排程隔離或引擎替代的設計選擇，不再加第三階。任何結果都不宣稱完整A成本較高，或正式owner已接受C。

## 實際卡／environment第一輪靜態複核

已讀 `C_SCALE_PLAN_20261116.md` 與 `scripts/c-scale-20261116/environment.py`，runner尚待完成；未啟服務。接受實際卡多一個Web2/s起跑階，以及沿用900秒runner總護欄，取代上文建議600秒；單操作期限不變。新隔離pool副本固定4／8 workers而非新增config接口，改動更小，prepare應記最小diff並以ready／cgroup讀回。Web搜尋SSR改用兩版都在space0且已發布的p000002、同query身份；獨立閱讀all仍可用p000001，避免把V2合法撤權404誤認為容量錯誤。

正式前尚有兩項必修：

- host／disk guard須涵蓋fresh下載與ready，而非只在load啟動；觸限或監測例外須由外層直接停止本輪units，不能只寫guard檔依賴runner繼續正常輪詢。外層controller也要有涵蓋900秒內層及有限清理餘量的獨立deadline，不能讓失去回應的runner等到5400秒unit上限。
- 更新要求分成「請求與真index下載窗重疊」和「≤155秒啟用，啟用後至少20秒V2觀察」。索引下載先完成才啟用，不把文字合成要求下載必須延續至啟用後；bulk下載背景則另有自己的lane。

其餘環境設計方向符合卡；此為靜態待修紀錄，不是準備產物或正式load批准。等helper修正、新runner與fresh-ready／freeze證據到齊，再作定向關閉。

## 最終靜態preflight：修正已關閉

已定向複核穩定版 `scripts/c-scale-20261116/load.mjs`、environment與實際卡。上述兩項closed：ready與load都有外層host／disk監測，觸限或監測例外可停止本輪units；load另有960秒外層期限及finally清理，內層900秒不變。更新下載重疊與啟用後觀察已分開。

Runner補強也已closed：保存初始V1 worker PIDs；更新資格須有V1 `retired-drained`事件、舊PIDs全部離開reader cgroup、新pool為預期4／8個互異且不同於舊pool的PID，並仍在reader cgroup。每個lane均須有V1、V2成功任務，以及至少一個在activation後20秒才送出的V2成功任務；另核≤155秒啟用、最終active V2及真下載重疊。沒有success receipt時overlap與跨activation數為null／未知，保留events供離線重算，不偽填0。

取消與未送arrival保留完整planned／terminal／failure分母；延遲資格改用已送出的P95及成功任務P95，不把未送占位值混入。409仍未完成。正式前跳過九種昂貴搜尋預熱可接受，主階每shape仍逐筆驗source；拒絕與小型內容hash檢查保留並明示可能暖cache。p000002兩版身份／正文hash契約已事前assert。

**靜態關卡通過，可完成隔離準備／fresh-ready／freeze；尚未批准正式load。** 最後只需提供實際reader4 CPU／8GiB、MinIO4 CPU／4GiB、四個新runtime worker歸屬、ready V1與輸入hash供產物gate。不再修改本文件或已凍結script；後續裁定另回覆或另檔。R2仍需R1結果與當時宿主餘裕支持，沒有在此自動批准。
