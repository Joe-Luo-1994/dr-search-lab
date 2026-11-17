# R0 最小發布實驗設計獨立審查

2026-11-17。Reviewer：獨立 agent `/root/release_design_review`。範圍：設計卡 R0、pool／preloaded 原碼及主 agent 的唯讀環境盤點；沒有啟動服務、安裝工具或執行實驗。環境盤點為主 agent 證據，本 reviewer 未獨立重測。

**結論：方向支持，修正以下設計歧義後可作為未來實作的設計基準；目前不可開始實驗。** 原因除了使用者明確要求不開始，也包括本地 cluster 尚不可用與資源前提未凍結。本審查不是執行授權，也不是正式 DR 驗收。

## 必要修正

1. **V2 不是只改 deployment digest 就能啟動。** `g3a/preloaded.mjs:12` 現有 `G3A_V1_ONLY` 固定 v1。應在允許工程明列：最小 release 參數化、保持 manifest/source/hash/protocol 綁定、拒絕要求版本與實際版本不同；不得僅移除 guard 而失去防混版保護。原 frozen 實驗來源保留，新版另留 diff/hash。本輪不改 runtime。
2. **P3 的成功觀察時點須獨立定義。** 有限混載段的「成功就緒後各再 60 秒」不適用故意不 Ready 的 V3。P3 應以收到預期 installer hash 拒絕且確認 V3 未 Ready 為觀察起點，再持續驗 V2 60 秒；明確讓 deployment 回報 stalled/failed 的等待界線。不要等待壞版 Ready，或把正常的預期拒絕當整輪截止失敗。
3. **定義負載的版本選擇與 oracle。** page/media API 強制帶 version。每秒獨立發送時，需要說清楚所帶 release 來自哪筆結果／測試排程，否則 mismatch 數字無法解讀。建議凍結 transition probe（刻意用舊版）與正常讀取 lane（使用已知版本及該版 oracle），按請求要求版本、實際服務版本分別記錄；不得以 server 回傳版本動態改期待值。僅獨立 V1 URL 的單筆測試不足以定義整段混載。V1/V2 合法跨 Pod 共存也應與單回應混版分開，避免表格的「混版即停」誤判預期 rollout。
4. **清楚處理部分通過後是否繼續。** 文內「每階段先通過才往下」與 P2/P4「機制可部分成立、服務保留未過」應對齊：建議部分成立仍停止後續階段並清理，報告保留已取得的機制證據；不得自行降級驗收門檻繼續。
5. **資源預算須含退場與回滾重疊。** 兩個 app 的16 GiB只是理想新舊並存限制，不是所有時間的絕對總峰值。P3 壞 Pod、終止中的 Pod 與 P4 新 Pod 可能短時重疊。建議開始 P4 前核對壞 V3 已終止／回收，保留 V2 正常服務；全程量測所有本輪 Pod，包括 terminating。記憶體上限不是 requests，也不是可排程容量；原文這項界定正確，須延伸到總峰值。

## 不阻擋設計、但實作預檢要凍結

- 15 分鐘階段與60分鐘總上限是研究預算，不是產品 SLO；V2 中央 build 是否計入 P2 應明列，避免為了完成百萬重建臨場延長。清理需另保留截止餘裕，超總時限後仍必須完成安全清理。
- 2＋2、E契約及 queue/failure 策略保持不變是正確範圍控制；新增 probes 與啟動參數化是明示 adapter 變更，不應冒稱 byte-identical runtime。
- 容器映像、工具鏈與相容 guard 需在 P0 留可核對值。禁止本輪順帶改 metadata 格式、worker 數或重啟策略。
- 壞 hash 一例可證該拒絕路徑，不能推廣成所有 release 錯誤都能安全拒絕；缺檔等變體不需為了覆蓋率自動追加。
- 本機具工具而無現成可用 context/runtime 的結論合理；未查 WSL 內工具應保留未知，不等同完全未安裝 Kubernetes。空閒 RAM 僅瞬間讀數，不據此宣稱硬體必定不足。

## 審查後的前進條件

先修正文案上述五點，再由主 agent 核對。之後若使用者授權實作，可先處理最小 installer／probe／release 參數化及隔離測試環境；只有 P0 容量、context、oracle、終止／清理護欄凍結後，才可進實驗。當前僅交付設計，不啟動 G3b-lite。
# 複核補充

主 agent 已納入五項必要修正。複核另指出取消壞 V3 不能只刪 Pod；設計已明定先恢復 desired release=V2、等待 V3 退場與 V2 穩定，再計時執行 V2→V1。設計問題已處理，可作後續實作基準；本地環境、資源凍結與執行授權仍是未滿足前提。未啟動實驗。

## P0 資源複核：先討論預算，不啟動環境

主 agent 提供後續唯讀盤點：實體 RAM 33,289,368 KiB、當時空閒16,815,556 KiB（約16.04 GiB）；20 cores／28 logical processors；`.wslconfig` memory=20GB；Ubuntu／docker-desktop 停止；兩個 mysqld 與多個 Node 服務仍在運作。本 reviewer 未重測環境，亦未啟動或修改服務。

**P0 尚未通過；應停在環境啟動前，討論資源／設計選項。** 新授權以「資源足且不影響其他專案」為條件。原卡兩個 app memory limits 合計16 GiB，加 MinIO4 GiB，尚無明確 WSL 平台／核心／loader／退場重疊餘裕；主機當時空閒量也低於總上限。requests 尚未凍結，不能證明可排程及主機保護條件成立。

這不是「一定跑不了」：limits 不等於實際用量，WSL memory 是上限而非立即保留，空閒 RAM 亦會變動。但不能以尚未量測的新配置，宣稱符合不影響既有 MySQL／Node 專案的條件。不得為了補足預算停止既有服務、擅調其限額或直接提高 WSL 上限。

可供使用者選擇：

1. **修訂本機研究資源預算。** 保留 app 每 Pod 4 CPU／8 GiB 上限及2＋2 workers；討論允許降低 MinIO 上限、設定保守環境總預算，再以有界預檢量測平台／MinIO／單 Pod 實際需求，凍結 requests、主機可用 RAM 下限、WSL／容器壓力停止門檻與監控週期。降低 MinIO 是設計變更，不能預先宣稱它仍不成瓶頸；僅縮 MinIO 也不保證16 GiB app加平台已有安全餘裕。預檢不足即停，不進雙 Pod rollout。
2. **改用有餘裕的另一台／隔離測試主機。** 保留原配置，重新核對 allocatable、主機保留量與授權；不以直接調大本機 WSL 上限代替資源充足證據。

若另行同意只建立低預算 cluster、不實作或壓測，可列為獨立環境準備範圍，但仍非原實驗 P0 通過。當前下一步是先決定範圍與資源預算，不啟動 Docker／WSL／Kubernetes。

## 本地 minikube smoke 後複核

後續使用者授權本機準備與關閉不必要服務。主 agent 回報已發現既有 minikube，另建隔離 `dr-search-r0` profile（4 CPU／6144 MB、Kubernetes1.31、Docker driver、keep-context）。Node Ready／系統 Pod Running；舊 current-context 仍為 `minikube`，舊 profile／舊 containers 未當作本輪測試目標。新 cluster 當時容器用量約682.6 MiB／6 GiB；Windows free約13.74 GiB，WSL memory上限20 GB，無swap用量。未部署研究 app／MinIO，未縮研究配額。本 reviewer 僅審核此回報，未獨立量測或操作環境。

**結論：環境 smoke 通過，原 R0 容量門未過。** Ready只證明這個小型 cluster 已可啟動，不證原實驗可安全部署。Node allocatable 顯示28 CPU／20,478,008 Ki memory，不能當實際預算。後續 Docker inspect 補正：minikube 的4 CPU為請求參數，cpuQuota=0、cpuPeriod=0、cpuset空、nanoCpus=0，未形成外層CPU硬限；memory=6 GiB有生效，但memorySwap=12 GiB允許額外swap。故當時CPU／swap隔離尚未滿足。也不能以系統空載約0.67 GiB推估兩個 app、MinIO、下載及退場期間峰值。主 agent 已停止專用profile、docker ps空，未刪profile。

建議先保存 profile 與唯讀狀態證據，**停止本輪建立的 `dr-search-r0` cluster，不刪 profile**，不動舊 `minikube`／既有專案。停機由主 agent 依既有授權執行，本 reviewer 不操作。理由是目前沒有下一個已通過容量門的部署工作，讓測試 cluster 持續運作只會占用主機資源；不能把這次6 GiB環境 smoke當原20 GiB以上上限配置的驗收。

下一步需要具體資源設計決策：是否保留原app配額與2＋2、調整MinIO及環境總預算，先做有界容量預檢；或者另找足夠餘裕的主機。前者仍須先凍結實際容器限制、K8s requests、主機保留量、下載／build／loader位置、監測及停止門檻。不得直接部署到6 GiB cluster後用成功排程代替安全容量證據，也不得以降限額的新結果冒充N1相同資源配置。執行時所有命令仍必須明示 `dr-search-r0` context/profile，避免未切換的舊context被誤用。

## 有界空載預檢修訂審查

已讀 `DR_N1_R0_RESOURCE_AMENDMENT_20261117.md`。使用者同意較小MinIO與有界預檢。**有條件支持僅外層12 CPU／12 GiB／swap0的空載環境預檢**；不等於研究app部署或完整R0通過。266.5 MiB reader、511.7 MiB MinIO歷史peak可支持先量測，但未獨立重測，且不涵蓋此輪下載、校驗、雙Pod或builder。

14 GiB開始／6 GiB停止的主機門檻可作本輪空載護欄，不是「完全不影響其他程序」的保證；2秒取樣仍有瞬間下降風險。12 GiB外層上限也不代表已保留12 GiB。兩app limits合計16 GiB高於外層12 GiB，文件已誠實標示超配，不可將後續成功描述成兩app可同時用滿原上限。

執行前需落實下列三項（不需擴大研究內容）：

1. **監控涵蓋啟動階段。** 14 GiB條件須在啟動流程前判定，主機每2秒監控先開始，再啟動專用cluster；WSL／Docker啟動中同樣受6 GiB／監控中斷門檻保護。不得等minikube start返回才啟動監測。若前置runtime已啟動，開始cluster前再核一次門檻。
2. **300秒為外部獨立watchdog。** 在阻塞式start之前開始計時；不能只靠同一阻塞執行緒的finally。正常、失敗、超時都須停止專用profile並read-back；stop超時的後備僅作用於本輪命名容器，不停止整個WSL／Docker或舊profile。清理失敗標示未結案。
3. **限制與指標逐項read-back。** 外層cpu.max比值確認12CPU、memory.max=12GiB、memory.swap.max=0，記初始memory.events基線；壓力條件判斷用增量。監控cgroup不存在／讀取失敗不當0，而按監控缺口停止。啟動前容器尚未存在的階段以主機監控與外控期限保護，容器出現後立即核限制；不符立即停止，絕不進後續部署。

上述護欄進控制器後即可做本輪空載預檢；本 reviewer 不執行環境。空載通過最多支持下一步最小實作，受控安裝／雙reader與MinIO瓶頸、ephemeral storage與requests仍須另過容量門。建議不因空載成功便長時間留cluster運作，按原300秒範圍停止並保存證據。

### 預檢控制器初稿（尚未執行）

已讀 `scripts/r0-release-20261117/environment-preflight.ps1` 初稿。主 agent 正修補外部呼叫timeout；本次讀到的版本尚有裸WSL呼叫，不可開始。需落實獨立主機監控／總watchdog（先於start）、全部WSL及清理呼叫有界、停止後read-back、OOM基線增量。逐次8秒timeout本身不保證每2秒主機監測或10秒缺口停止，串行呼叫可能累加超限；應由獨立控制路徑維持護欄。cgroup必要欄位缺失也應失敗，不能跳過記憶體檢查。建議Ready後另固定短觀察窗口並確認系統Pod狀態，避免僅單次Ready快照被敘述成持續空載穩定。

### Python 控制器複核

已讀替代 `environment_preflight.py`，獨立主機watchdog、外部呼叫timeout、60秒Ready觀察、系統Pod檢查、指標缺失拒絕、OOM增量及finally停止read-back已回應前述問題。剩啟動競態需先修：watchdog若在update期間abort並stop，main不得之後再start。需以生命週期鎖序列化檢abort＋start與watchdog stop（watchdog先設abort，再取鎖停止）；初次WSL inspect前即啟動watchdog以涵蓋WSL可能被喚醒的階段。修正後支持執行僅空載預檢，不擴充工作負載；本審查未執行控制器。

### 儀器修復後再次執行審查

已複核修正版 Python：主機watchdog移到首次WSL呼叫前，start與watchdog stop以生命週期鎖序列化；cgroup指令改固定欄位避免跨shell變數展開；每次WSL呼叫設定本profile私有KUBECONFIG，憑證僅引用路徑；docker start後啟動專用容器內kubelet。不更動全域context、不啟動app／MinIO、不放寬限額或驗收門檻。

主 agent 回報前兩次失敗083053（cgroup指令引用）與083114（kubelet未啟動／context不可用）已保留且清理停止；本 reviewer 未將失敗當作容量證據。**支持在同一既定護欄下再次執行一次空載預檢**，目的限於驗證修好的環境觀測／啟動路徑。仍需最終cgroup read-back、60秒Ready、系統Pod與cleanup證據才可報通過；不因前次已見limits便跳過本次校驗。

從容器啟動至第一筆cgroup樣本的bootstrap間隔只受主機監控與總deadline保護，應在報告中保留時間差，不宣稱全程已有2秒cgroup取樣。若仍有新啟動／儀器問題，停下保存結果再診斷，不自動增加期限或改成工作負載實驗。本次僅讀控制器與更新審查文件，未執行環境。

### 第三次空載預檢結果審查：停止並補觀測，不重跑

直接讀取 `evidence/r0-release-20261117/environment-20261117-083445/` 的 result、cleanup、cgroup與host紀錄：結果為 `failed / NODE_LOST_READY`，cleanup顯示 `stopped: true`。已存樣本可確認cpu.max=1200000/100000（12CPU）、memory.max=12GiB、memory.swap.max=0、swap.current=0，所見OOM計數為0；最後樣本memory.current約1.14GB。這些支持外層限制讀回成功與本次清理完成，不支持60秒Ready通過、發布環境穩定或研究工作負載容量。

控制器以 `kubectl ... 2>/dev/null || true` 隱去API錯誤，並把空輸出、JSON解析失敗、節點條件非True全部合成ready=false。原始nodes回應未落盤。因此 **NODE_LOST_READY只是控制器分支標記，不能歸因為節點真掉Ready、API故障或資源不足**。也未留下證據判斷首次Ready是否為先前保留的Node狀態。不得將noOOM當成排除其他資源或平台問題的充分證據。

審查結論：本次停止符合設計；保留失敗與清理證據，**不追加執行，不啟動app／MinIO**。原P0環境穩定性門仍未過。三次失敗是啟動／觀測路徑的未完成證據，不能拼成通過。

最小下一步只修診斷契約並靜態審查：

- 每次API probe保存起迄時間、exit code、stderr與原始stdout，移除錯誤抹除；輸出不含kubeconfig／憑證。
- 區分command timeout、非零exit、空回應／invalid JSON、無node、Ready=False、Ready=Unknown及有效Ready=True，保留reason/message/conditions。觀測失敗仍按原規則停止，不增加自動重試或放寬門檻。
- 以本次容器啟動時間／run id記錄Node UID、resourceVersion、Ready的lastHeartbeatTime／lastTransitionTime；如需確認kubelet活性，再觀察本次Node lease renew進展。不要將舊的Ready=True直接當本次啟動成功，也不要要求lastTransitionTime必然刷新（狀態未轉換時可保持舊值）。開始60秒窗口需有本次新鮮活性證據及Ready=True；時間比較需處理host/cluster時鐘差。
- 保存停止前可取得的有限診斷，不讓診斷突破原總期限或耽誤清理。能否再次執行待修正審查與主agent決策，本次不主張以更多重跑代替缺失觀測。

### Ready 診斷修訂複核

使用者後續授權必要Ready診斷。已讀新增node-observations、lease-observations及boot_wall的控制器：有效JSON的Ready條件與本次啟動後lease續租共同決定60秒窗口；Ready後API觀測失敗、Ready失去True、lease不新鮮均停止。原12CPU／12GiB／swap0、主機護欄、10秒cgroup監測缺口及300秒總期限不變。**支持執行一次同範圍空載診斷，不進研究工作負載。**

兩個API串行可能使cgroup取樣間隔超10秒，watchdog仍應fail-closed，不為了診斷而延長門檻。需如實描述bootstrap行為：首次Ready之前node API失敗會落紀錄後繼續有界輪詢；Ready之後才立即停止，不能寫成「所有API失敗皆立即停止」。

lease fresh判斷使用Windows wall clock與cluster lease時間；跨時鐘不一致時只能說新鮮度前提未通過，不能直接歸因kubelet故障。已保存raw lease與boot wall可供後續判讀。建議timeout例外亦保留類型及captured stdout/stderr，避免`TimeoutExpired`字串丟失部分診斷。初次非Ready不啟動60秒窗口，不把持久化舊Ready直接視作本次成功。本 reviewer 未執行程式。

### API alias 修復審查

直接讀084103的kubelet-diagnostic與cleanup：kubelet多次記錄 `lookup control-plane.minikube.internal ... no such host`，無法註冊Node／更新lease；cleanup為stopped=true。該次診斷足以支持檢查並修復專用容器API alias，而不是推論資源不足。result末筆container not running是主agent主動停止後的控制器結果，不能用來抹去前面的DNS錯誤證據。

**支持一次相同判準的修復驗證。** 範圍限每次啟動後，將經IPv4Address驗證的本profile IP補入`dr-search-r0`容器`/etc/hosts`，不修改Windows／WSL主機DNS或其他profile。getent結果保存且應核對只有預期IP，若存在不同IP則拒絕而非宣稱修復成功。這是專用環境啟動適配，不是資源配置變更；仍必須通過既定lease、Ready60秒、cgroup限制、系統Pod及cleanup全部判準。本 reviewer未執行環境。

### 084246 結果獨立複核：空載門通過，可進最小實作

直接解析 `environment-20261117-084246` 的result、start、alias、node／lease逐筆原始回應、cgroup、host、pods與cleanup：

- result passed，控制器記錄70.4828秒；cleanup stopped=true。這是本次停止後read-back證據，不是本review重新啟動或量測。
- 26筆node觀測，首筆啟動期connection refused有保留；其後25筆有效回應全部為本節點Ready=True，時間7.9770–70.0555秒。沒有Ready窗口內API失敗被忽略。
- 25筆lease觀測時間8.1890–70.2627秒，跨度62.0737秒；renewTime從00:42:53.843390Z進展至00:43:55.143888Z，均屬本次啟動之後，支持不是沿用舊Ready快照。控制器同時執行age<=40秒檢查；逐樣本未額外保存Windows wall time，因此獨立核對主要依boot wall、lease原值與monotonic窗口，不能將其稱作獨立時鐘校準驗證。
- 26筆cgroup樣本均為12CPU／12GiB／swap0；swap.current皆0，所見memory.events各計數皆0。首樣5.3737秒，最大樣本間隔2.7987秒，未逾10秒缺口門檻；記憶體樣本峰1341.140625 MiB，主機最低可用14.2963 GiB。峰值僅取樣峰，不是內核lifetime peak。
- pods.json七個Pod均在kube-system、Running且Ready=True，未列研究workload。alias解析為本profile IP；cleanup已停止專用容器。

**判定：本次固定護欄下的空載環境門通過，可以進入已授權的最小installer／probe／版本參數化實作。** 不需繼續重跑空載確認；保留所有先前失敗，將API alias啟動適配計入本地環境維護成本。此結果仍不是安裝／雙reader資源門、MinIO瓶頸驗收或正式R0發布實驗通過；研究服務／雙Pod實驗須經後續受控預檢與審查，不因空載通過自動開始。本review僅讀證據，未操作環境。

### 離線 adapter 第一部分審查

已讀prepare_runtime.py、生成的preloaded片段、runtime-contract.test.mjs與receipt，並獨立比對pool／metadata-worker／sqlite-worker／storage四檔原件和副本hash相同。scope符合最小第一部分：保留原N1來源，新增Tantivy release pin、fatal/closed狀態503及實驗response metadata。未執行服務或重跑測試；主agent報告1個test含5個情境通過及兩檔syntax check通過。

測試只驗合成bytes的pin/hash/lineage/unlisted file契約，不能代表SQLite/Tantivy真reader、HTTP status503、response headers或K8s probes已驗證。S1分支仍沿用原碼並繞過新Tantivy pin，故此adapter結論限Tantivy路徑，不泛稱所有engine都有相同保證。

**一項正式P3之前必須修的範圍衝突：** 新guard僅允許v1/v2；若P3按原計畫使用v3，會先得到R0_RELEASE_ID_MISMATCH，無法證明預期的壞hash拒絕。後續生成V3／installer時需明定release id政策（例如允許已釘選的v3並由hash驗證拒絕），保持要求版本與manifest/reader綁定，並確認實際拒絕原因。不能把版本白名單拒絕當作P3的hash拒絕通過。

此問題不阻擋保存目前離線增量，但阻擋將它稱作完整V1→V2→壞V3能力。installer／deployment／probes配置／termination／真release oracle／容量門均未完成；可繼續既定最小實作，不直接開始正式R0。

