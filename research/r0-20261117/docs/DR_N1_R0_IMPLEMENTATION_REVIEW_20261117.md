# R0 離線最小實作審查

2026-11-17。獨立review agent，僅讀installer.mjs、server.mjs、deployment.py、runtime/service.mjs、preloaded/storage及離線測試來源；未apply、未啟動服務、未執行正式R0。主agent報告7項TAP通過及syntax/compile通過，本review不將其升格為實際容器驗收。

**結論：增量範圍合理，可保存並繼續離線整合；不可據此放行正式R0。** 已有下載安裝、固定release與健康／退場的可審查實作，不再只是架構草圖；真實image／reader／MinIO整合、容量門與發布旅程仍未完成。

## 可沿用的實作與證據界線

- installer以釘選manifest hash、Node/ICU版本及release ID檢查入口，逐檔串流下載、bytes/hash、fsync/rename，再沿用preloaded來源綁定。config最後發布，避免未驗完即供應用使用。v3已加入可釘選版本，解決先前白名單擋住壞hash測試的問題。
- 固定staging一次嘗試、失敗換Pod是刻意簡化，不是已實作斷點續傳／修復。remoteObjects只驗descriptor集合，receipt明示remoteContentVerified=false；它不證正文附件存在或與SQLite完整對應。
- server實作Ready與live分開、draining拒新請求、最多10秒在途等待及15秒硬退出。這是可讀程式邏輯，尚未驗SIGTERM、長下載、連線關閉或children回收。
- deployment僅render JSON，image必須digest pin；reader兩個worker類別沿用原pool，app預算仍4CPU／8GiB，MinIO改2CPU／2GiB。requests／storage數值是候選，不等於P0已凍結或可排程。
- 離線測試使用合成檔案與mock get，不是實際S3簽名、SQLite quick_check、Tantivy reader、Next route或K8s探針證據。

## 正式apply／發布驗收前的阻擋點

### 1. 啟動時間預算彼此不一致

deployment progressDeadlineSeconds=120；installer網路下載訊號本身允許120秒，後續還有preloaded完整hash／lineage、應用啟動，startupProbe又允許約120秒，另有minReadySeconds=5。合法但較慢的完整啟動可能先被標為rollout未進展。installer的AbortSignal主要傳給下載，並非整段本地驗證的外部硬期限。

需先凍結「image可用→init下載／驗證→reader-ready→minReady」的單一預算，對齊progress、startup及實驗外控。若調整原設計的120秒失敗觀測規則，明記理由與review，不在執行途中默默延長。無法以syntax或小檔測試推定百萬artifact可在120秒完成。

### 2. MinIO本地保存的範圍必須標清

render中的MinIO使用emptyDir；MinIO Pod替換會失去已上傳release集合。它可以支援「MinIO保持不動、只替換reader」的本地實驗，但不是架構中的持久異地來源。若本輪仍用此配置，需在runbook明示其fixture可重新上傳、禁止測試途中改MinIO模板／刪Pod，以及回滾證據只限MinIO存活條件。不能由reader回滾成功宣稱MinIO故障後也能恢復。

## 必須記帳的維運責任／整合驗證

| 項目 | 現行行為 | 後續要明定或驗證 |
|---|---|---|
| init失敗 | staging留在emptyDir，init container自行重試時會EEXIST | 原始首因需保存；operator如何換Pod／取消壞rollout。不能只展示最後一次EEXIST而失去hash錯誤 |
| runtime fatal | readiness失敗，但live仍200；固定pool不自癒 | 明示需要operator重建或另定平台恢復政策。不要稱已完成自動恢復；不要求現在新增supervisor |
| release下載與本地校驗 | 逐檔下載後又全量驗證，最多6GiB集合，空間預留1GiB | 記錄二次讀取成本、實際時間／磁碟峰；ephemeral volume限制與statfs不能互相冒充 |
| 遠端正文完整性 | remoteObjects僅descriptor，實際讀取驗bytes/hash | publisher及fixture oracle需保證選定正文／附件完整；不把manifest清單當存在性證明 |
| 健康模組一致性 | custom server import service，Next routes由CAP_SERVICE_URL載入 | image整合需確認兩者引用同一runtime instance；否則health可能觀測錯pool |
| 退場 | 10秒等待、銷毀socket、closeRuntime、最遲15秒退出；K8s grace20秒 | 真連線／程序樹驗證，保存forced與退出碼；長下載被中斷是需揭露的體驗 |
| 憑證及artifact | bootstrap secret寫入本地config；自製S3 adapter仍沿用 | config／log／receipt公開清洗，secret生命週期與正式SDK重用仍是待辦 |

不能因init installer重試策略簡單就稱無維護：它將修復責任轉成Pod替換與明確操作流程。也不能因live200就把fatal視為健康；此次Ready設計只代表停止接新Service流量。

## 建議下一個有界步驟

先對齊啟動預算、寫清MinIO fixture保存條件及operator恢復契約，再完成離線image／入口整合與針對性測試。其後才審受控安裝／單reader與雙reader容量預檢。正式R0仍未放行；不擴展worker數、搜尋契約、熱切版或最大RPS測試。

## 預算與責任收斂複核

主agent提出維持progressDeadline120秒，將installer CLI整段（含verify）設硬60秒、app startupProbe40秒、minReady5秒，留下15秒其他進度開銷；不延長原實驗判準。**此收斂可接受作待實作契約**，仍需量測能否達成；15秒不能當作已證image pull／排程必定足夠。硬期限須在CLI工作前開始，實際截止能使程序失敗退出，不只是下載AbortSignal；正常結束清timer。

首次installer失敗以wx保存原因且不被init重試EEXIST覆寫，能支持原首因診斷。若首次記錄也失敗須保留stderr，不以記錄失敗掩蓋原錯誤。MinIO emptyDir明定只為lab fixture，正式依賴既有持久MinIO；poolfatal明定operator換Pod、不自癒，已回應責任歸屬疑慮。

主agent回報Linux Node22 stub Next/runtime測試驗live200、ready由503變200及SIGTERM讓在途300ms body完成／呼叫worker close，總8 TAP tests通過。可支持server控制流程的受控驗證，但不是實際Next路由／Rust children／K8s終止證據。本review未重新執行此測試。可繼續離線整合；真image、受控資源門及正式R0仍未放行。

## 自主整合前再審

使用者後續授權自主規劃／完成必要實驗，並非每一步需重新確認。再次只讀installer／server／deployment及原Next API／SSR wrappers：60秒CLI timer、first-error wx、v3 pin與40秒startup已落實，未發現需要另起架構重寫的新增阻擋。以下是既定真整合／P0 gate，主agent可在授權範圍完成並提交證據，不是新增權限要求：

1. image檔案布局需讓`/app/server.mjs`可解析`next`，不能只在`/app/project/node_modules`放套件；server的相對runtime import與`CAP_SERVICE_URL=file:///app/runtime/service.mjs`須指向同一實體模組。真image觀測應只有2 search＋2 metadata workers，避免health監督一套pool而Next路由另建一套。
2. image內Node/ICU與manifest精確一致，Rust binary可在該Linux／libc執行；image須事先預載。60＋40＋5是限制不是性能承諾；碰到合法慢啟動也保留失敗，不臨場調大。
3. 壞hash首次錯誤經init重試後仍保留，config沒有被發布；保存首因與後續EEXIST分別的紀錄。不要只證mock install函式reject。
4. V1/V2 oracle先凍結，至少具可辨識query/title/body/tag與附件bytes差異，完整遠端物件先發布再manifest。V3獨立key，故意壞的檔案不能原地覆寫V2；其錯誤路徑要確實是hash拒絕。
5. 至少一條真Next API與SSR成功讀取，同一release header／內容版本正確，並用真children觀測SIGTERM清理。stub HTTP測試不替代這些整合證據。原UI仍是合成身份，不宣稱正式登入／ReBAC使用者旅程。

目前可繼續真image／fixture與有界預檢準備；正式R0是否放行等下一批preflight證據，本review沒有啟動任何實驗。

## 本機無registry映像身份策略

主agent提出本地tag `r0-reader:sha256-<完整image-config-id>`、imagePullPolicy=Never、preload前後與每Pod init／reader imageID核對，以避免另建registry；正式方案仍用repo@manifestdigest。

**接受作為隔離、非對抗本機lab的可追溯替代**，不要求為此增加registry部署單位。必要條件：tag完整包含config SHA且不重指；preload前後核對實際container runtime可解析的映像；保存artifact／image ID與Pod init／reader身份。任一不符停止並將run標無效，不自動改tag／pull／重跑掩蓋。

Pod.status.imageID可能表示runtime ID或manifest digest，不能假定它與Docker config SHA是同一種字串；需以CRI inspecti等可核對資料建立對應，使用同種digest比較，不能靠tag名稱證明內容。啟動後imageID檢查是觀測校驗，並非Kubernetes在執行前強制tag不可變；本地假設無其他actor重指tag必須明示。generator顯式local模式，不能讓此例外默默取代正式digest策略。

此接受只解除本機image封裝障礙，可進既定受控preflight；不代表正式R0、容量或發布驗收已放行。真image相容性讀回由主agent另留證據，本review未重跑image。

## 受控整合 preflight 控制器初審

已只讀 integration_guard.py／pipeline.py。**當前暫不放行執行**，需先修以下安全及證據阻擋；不要求增加RPS或改資源判準。

1. **既有namespace會被誤刪。** 起始NAMESPACE_EXISTS失敗仍進finally，最後無條件delete同名namespace。必須本輪create成功才取得所有權，以run label／UID記錄；清理前核UID，非本輪namespace完全不碰。以create拒絕競態，不能apply到別人同名namespace後自認擁有。
2. **外控unit清理缺read-back。** systemctl stop失敗僅寫檔、result仍可能passed；需確認本輪unit inactive／不存在且無殘留cgroup程序，否則cleanup未過。專用cluster停止不能替代Linux pipeline程序清理。不能為修復而停止整個WSL或其他unit。
3. **逐請求證據不能等整段結束才落盤。** 現load把所有future保留到最後才write JSON；外控kill可能使該段所有證據消失。改即時追加NDJSON並先落planned schedule；限制pending不超12，超額明記missed，不以ThreadPoolExecutor僅限制執行thread來冒充bounded queue。
4. **雙Pod拓撲需逐Pod核。** Service的status只可能抽到其中一Pod，且一個module回報4worker不排除custom server另一個module已建立第二pool。每個reader Pod需自身status及OS child tree／數量證據，核只有2search＋2metadata，另保存實際Pod／container CPU-memory限制，不只看render欄位與外層限制。
5. **真實功能驗收範圍要精確。** SSR只搜尋title substring不夠，應核pageId／version標記與可辨body內容。SIGTERM在load結束後執行，只證閒置退場／重啟，不是下載或在途請求排空；可保留作idle smoke，但結果須如實標示，更新中的在途旅程仍待正式R0驗證。

原120秒進度等研究期限可保持；如累計前置工作耗盡780／900秒，保留失敗，不在途中加時。此次審查未執行控制器或服務。

### 控制器修訂複核

已讀新版：namespace改create並保存owned UID／run label，非本輪不讀刪；負載有planned＋即時NDJSON及12 pending上限；逐Pod核status與/proc workers及cgroup；SSR核pageId／version／revision，SIGTERM明示idle-only。上述已回應初審。

尚一個cleanup證據阻擋：unit cgroup的`find ... -exec ...`使用多層反斜線且尾端`2>/dev/null || true`吞錯，執行／權限失敗可能被當「空、無程序」。需改可靠的遞迴讀取（例如Python pathlib），不存在路徑明示、其他錯誤fail-closed，不用空輸出推斷成功。此修正後支持一次原範圍受控preflight；正式R0仍待其證據，不擴資源或時限。本review未執行程式。

### 準備階段兩次失敗與串流映像修復

主agent回報093319啟動API尚未ready即失敗、未啟pipeline；現已加入有界本次lease／Ready啟動等待。直接讀093352 pipeline log及unit-cleanup：systemd結果oom-kill，控制器Memory peak1.0G、swap0、約6.276秒，清理MainPID0、無cgroup參照。該失敗在image load且尚未建立namespace／研究服務，不能當作app／MinIO容量結果，也未證明minikube內部必然把整個映像buffer到RAM。

已讀改用`docker save → docker exec -i ... docker load`串流，維持1GiB控制器及原研究配置、180秒載入期限、雙方退出碼與節點imageID核對。支持同範圍再驗一次；執行前應將producer stderr改導向本輪檔案，不留未讀PIPE，避免pipe填滿阻塞與錯誤證據遺失。此為準備工具實作修復，不是調高資源或放寬應用驗收。已讀unit_state.py以pathlib核程序清理，前項find吞錯問題已修正。本review沒有啟動環境。

## Transition loader／正式P2–P4預審

只讀transition_load.py與release_artifacts.py，正式階段尚未放行；正在執行的受控preflight待結果另審。V1/V2採共同uniquep000003 query，能用各版凍結title/body/media oracle比較，不是拿回應自行改期待值。

正式執行前有三項loader證據缺口：

1. summary目前planned=len(rows)，不是獨立分母。需要在排程時記scheduled count／slot，finish核(i,lane)唯一且完成／missed集合等於所有預定slot；不能由已回傳rows倒推全部發送成功。
2. futures過濾會直接丟棄已完成future而未檢查exception；append寫檔失敗可被吞掉。收割done future時必須.result或.exception並使窗口失敗；先寫成功再記完成，不能只靠記憶體rows報passed。
3. set_version要留下時間、要求版本、allowed集合的phase事件；首次非預期失敗要通知controller，使其停止後續變更並保存證據，不等長步驟全部跑完才finish發現。

正式controller仍需落實原卡：P2一次V2 build＋完整上傳後才發布manifest，更新只改release pin；新舊Pod與Ready/endpoint事件可關聯到逐請求；V2全就緒後再觀察60秒。P3明確辨識預期hash首因、V3不Ready與ProgressDeadlineExceeded期限，V2三路操作零錯誤；取消壞rollout需回desired V2、清掉V3後才計P4。P4須實際V1讀回與60秒穩態；任何漏發、錯誤或部分通過不進下一階段。

fixture有changeQuery與tagChanged oracle，但Window目前只驗共同query；P2/P4另需smoke驗新增詞命中／回滾後不命中，以及變更tags的AND篩選，不把存在oracle檔案當作已驗證。舊URL409應獨立transition probe，不能以一般load中的409數量替代「切版後可明確重新搜尋」驗收。必須保留壞版/回滾與取消步驟各自人工操作及時限，仍不擴應用內熱切版。

## 094213 受控preflight結果：單Pod局部證據成立，資源門停止

獨立讀本輪Windows result／host／cluster、unit-cleanup／cleanup及native single-load／startup／namespace-owner：

- V1啟動23.4788秒；single-load共90個唯一(i,lane)，search/page/media各30，零失敗，最大12.4634ms。這是30秒、3請求/秒的合成單Pod工作點；可沿用，不是最大容量。
- host最低5,552,492,544 bytes，低於6 GiB門檻；最後cluster樣本9,238,736,896 bytes。watchdog為HOST_AVAILABLE，整體passed=false；雙Pod階段未完成，不放行正式R0。
- 最後memory.events的max=12208，oom/oom_kill=0、swap.current=0。無OOM不等於無記憶體壓力；max事件可能含子cgroup，無memory.events.local與逐容器樣本不能歸因外層、app或MinIO，也不能只依末筆9.24GB說從未接近限制。
- unit已inactive／MainPID0／無cgroup參照，clusterStopped=true；確認運算資源已停止。本輪native沒有最終result或namespace刪除證據，systemd stop造成的pipelineExit0不能當正常完成。

**停止點：** 維持原資源修訂的規則，先與使用者討論具體資源／設計選項，不自動加RAM、降低門檻或重跑。不能由本次斷言Tantivy容量不足或整個固定Pod方案不可行；實際受限的是此本機資源環境下尚未完成的雙Pod更新前提。

**安全清理界線：** namespace-owner保存UID bf3c056f-e00d-4e38-b3fa-366665f5ced8／run20261117-094213，刪除未證。標記專用profile為stopped、contained、dirty；不為了刪namespace直接重啟整個cluster，因可能復活保留的雙Pod與MinIO。後續恢復或重建專用profile需先有不重現資源壓力的方案並核對該UID；不動其他profile／專案，原證據保留。程序停止與邏輯資源清理分開報告，不宣稱完整cleanup通過。

### Transition loader修訂再審

現已增加slots分母／唯一性比對、phase事件與failure event。仍需在正式前修一個競態：先掃done.result，再以第二輪done過濾，future可在兩輪間完成而未檢例外即被丟。用單次partition處理done/keep；append改成寫檔成功才加rows，I/O失敗直接設failure/error。這只是離線小修，不構成重啟資源實驗的理由。

## 使用者選擇Recreate後的最小修訂審查

使用者明確選擇先停舊Pod再啟新Pod、量測短暫中斷。**支持作新修訂，不沿用原rolling-update的可用性承諾。** 保留單reader的2＋2／4CPU8Gi、原host6Gi／cluster10Gi等護欄；此選擇只減少新舊reader並存需求，不預先保證實際記憶體足夠。

必要契約調整：

- P2新版本publish完成後Recreate；保存舊Pod停止、Service endpoint移除、新Pod啟動／Ready與逐請求時間。仍要量測終止時的在途失敗，不能以設定Recreate就推定無重疊／已排空。
- 預期停機窗口內5xx／連線失敗等是**失敗請求與中斷成本**，不是成功；它們可在這個降級契約下不阻擋phase通過，但須保留完整分母、首尾失敗、最長連續中斷、恢復時間。成功200必須內容／版本oracle正確；錯版、hash錯、超資源或缺證據仍立即停止。窗口有15分鐘硬界線，不能以「預期停機」容忍無限失敗。
- Ready後固定60秒穩態零錯、零漏發；切入穩態時明確切要求版本，舊URL409另驗。新版本一直無法恢復不算合法成功。
- 壞V3在Recreate下會使服務不可用，**原『拒壞版但V2不中斷』驗收作廢**。改驗hash首因與ProgressDeadlineExceeded可辨識，再明確重新指定V2、量測下載重啟與60秒穩態。將壞版安裝、診斷等待、操作恢復及總停機分段記錄，再決定是否回V1；恢復失敗停止。
- V2 build在cluster停止時、獨立4CPU4Gi準備，是本機環境約束。其時間／資源／人工步驟另列，不聲稱已驗live服務同機建置。凍結build自己的期限與清理；正式各phase15分鐘／總60分鐘的計時起點明定，不能把離線建置成本從整體維運比較中刪掉。

### dirty profile的簡潔安全處理

不建議為一次性lab打造「刪內層研究containers、獨立啟etcd/apiserver、跳過kubelet、API刪namespace再復原」流程。它新增控制平面生命週期責任，且在API尚不可用時容易需要更多手動修復。

**優先方案：證據及fixture保全後，刪除並重建本案專用`dr-search-r0` profile。** 前提先核對這是本案建立的一次性profile、沒有其他專案資源，所有需保存的原始證據、manifest、oracle、來源／image均已在profile外；MinIO emptyDir原本就是可重新發布的lab fixture。保留當前namespace UID/run紀錄，明記此輪是profile層級清理，而非已證namespace API刪除。

只處理明確命名`dr-search-r0`，不使用delete-all／prune、不碰原`minikube` profile或全域WSL。若存在獨有且未備份的profile內證據，先保全或停止，不為了清理而復活原雙reader。重建後重新核空載限制／身份及namespace空白，才做Recreate候選；不能沿用舊cluster UID的read-back。本review尚未執行清理或實驗。

### 獨立V2 builder預審

已只讀prepare_v2.py與原export-source.mjs。停止cluster、frozen來源RO、network none、專用Docker4CPU4Gi／swap0、host14Gi開始／6Gi停止、15分鐘期限及新輸出拒覆寫，符合離線建置範圍。

執行前需修cleanup：不能只在Windows proc還活時stop容器，Docker／WSL客戶端先退出不代表容器停止。應按容器實際Running狀態決定停止，最後stopped=false必須使結果失敗，保留停止後容器與log。另保存實際Docker資源設定與image configID，不以result宣告limits代替讀回。現`/work`掛載整個dr-r0-work可寫，與「只新v2輸出」敘述不同；優先掛獨立新build父目錄，或明確收窄寫入範圍，原release/private不需可寫。

上述小修後可執行一次有界離線build；成功不代表live服務同機建置或正式R0通過。本review未啟動builder。

### Recreate正式控制器首版審查

已讀formal_recreate.py：publish期間維持steady不可容忍outage，發出Recreate前才切換transition；5xx／網路失敗計outage而非ok；200對凍結內容oracle，steady60秒零錯；slots與即時NDJSON、單次future partition及phase／總截止已納入。新增詞、AND tags、舊URL409、壞V3 hash＋PDE與恢復V2再回V1，均有明確程式檢查。P3僅複製search.sqlite新V3 key、其他引用已驗V2不可變key，是合理減少重複發布的候選；publisher HEAD已存在則驗hash不覆寫，需保留其receipt。

正式前仍需保存每個新Pod的init／reader imageID並對iid核對，以及成功安裝log／receipt；Recreate刪舊Pod後無法只靠最後剩餘Pod重建各版成本。P3壞Pod也要留init映像與首因。此項已通知實作者，其他主流程未發現需另增架構的阻擋，資源gate仍由主agent持續確認。

另審rebuild_profile.py：在超時路徑僅terminate Windows wsl客戶端，不能證Linux minikube子程序已停止；子程序可能在node stop後再啟動。建議沿既有模式以唯一systemd unit管建立程序，finally先停unit確認無殘留，再停專用node，保持原300秒與host護欄。本review未執行profile建立。

主agent後續回報Windows記憶體自然回到17.30GiB，未執行先前討論的檔案級fadvise；不要將未執行的cache建議寫成已做或當結果變因。

## Recreate 執行前 final gate

已只讀最新pipeline.py／formal_recreate.py／integration_guard.py與DR_N1_R0_RECREATE_PLAN_20261117.md。主agent回報當下host available16.07GiB、profile stopped、V2離線build與manifest完成，新profile正常建立20.23秒且停止，minikube程序唯讀核對無殘留；這些回報不替代執行當下腳本14GiB門檻。

**放行一次接受停機的合成Recreate候選實驗。** 已核recreate分支不啟double，namespace存在會拒且非owned不清理；2＋2／app4CPU8Gi與host／cluster護欄保持；各版本Pod映像身份與installer receipt／壞版首因有保存；outage和成功分開，steady60秒零錯，錯誤200／漏發／觀測缺口停止。保留codefreeze與所有之前失敗，不將此放行擴張成rolling availability、高RPS或正式資料／ReBAC驗收。

時限限制需保留：systemd RuntimeMax3000秒／TimeoutStop5秒是外部硬截止，若觸發可能來不及執行namespace finally，因此不能宣稱已保證「50分鐘停止工作後一定有10分鐘優雅清理」。建議正常控制器於50分鐘受控abort進finally，外硬截止另保留cleanup餘裕；若本輪未走該路徑，標示未驗，不為此重跑已成功的環境準備。任何資源停止都必須分開報程序contained與namespace清理，不掩蓋dirty狀態。本review沒有啟動實驗。

## 095705結果與memory.high候選審查

直接讀本輪result、cleanup、unit-cleanup、native檔案集合及最後cluster樣本：HOST_AVAILABLE停止，unit inactive／MainPID0／無殘留，clusterStopped=true。native只有image／publish等前置紀錄，沒有startup或正式P1結果。**這是Recreate執行前冷安裝前提未完成，不能稱Recreate切版策略已驗失敗。** 邏輯namespace清理仍未證，保留dirty／stopped標記。

最後cluster memory.current7,691,808,768 bytes，其中file6,568,574,976、inactive_file6,372,704,256、anon913,797,120；memory.events max7651、oom/swap0。支持「此時檔案類記憶體佔大宗」，不證全部可立即回收、不證回收後Windows可用RAM會立刻增加，也不能單靠這個樣本將壓力歸因於某個Pod。仍有writeback/refault等活動，不能把file cache當作零成本空閒空間。

**memory.high=6GiB可作下一個具體候選，尚未放行執行。** Linux官方定義為超過時節流並施加回收壓力，可短暫超過，不是硬上限，也不是只清檔案cache的無成本開關；可能延長下載／校驗與啟動。來源：[Linux cgroup v2 memory.high](https://docs.kernel.org/admin-guide/cgroup-v2.html)。

依已確認「再次觸線即停止討論」規則，建議先向使用者提出此設計調整，與保持配置／停止本機探索等選項比較，不自動run。這是既定實驗停止邊界，不是新增通用批准要求。

若採納，最小範圍為：外層high6Gi、max仍12Gi、app8Gi、hostfloor6Gi與原deadline不變；只做single-reader冷安裝＋60秒穩態，不做正式發布／壞版／回滾。寫入需限定專用cluster cgroup，讀回memory.high及原限制；記memory.events.local、高壓事件、PSI／refault與啟動時間，區分回收是否改善主機餘裕及增加多少延遲。成功才重新評估正式gate；觸線或超時保留失敗，不自動調high或延時。不要將其他Docker參數名稱當作memory.high已生效的證據，須核實cgroup檔案實值。原兩次hostfloor失敗仍保留，不以新配置覆寫。

### Profile清理更新與high-single實作審查

直接讀preserved-preparation/profile-reset-20261117-095705/result.json：僅刪dr-search-r0、otherProfileUnchanged=true、保全14檔真實log。**上一輪已完成profile層清理**，不再標dirty；這不是namespace API deletion驗收。

使用者已明確選high-single診斷。已讀guard／pipeline：只在專用容器啟動後、kubelet／pipeline前寫high6Gi並read-back；執行期間核high不漂移，保留hard12Gi／app8Gi／hostfloor6Gi／installer60秒，記local events、PSI與refault；stage只single cold＋smoke／pod probes／60秒load，不進double／formal，範圍符合。

rebuild改systemd unit的方向正確，但讀到兩個需先修的小阻擋：unit_state.py只允許dr-r0-日期，會拒新dr-r0-rebuild-日期；rebuild finally同一try的unit_state失敗會跳過後面的docker stop。應將unit名稱驗證限定擴為可選rebuild前綴，並讓node stop/read-back在獨立finally／try無條件嘗試，即使unit清理檢查失敗仍停專用node，結果繼續標失敗。這兩點修正後支持一次rebuild及high-single，不放寬護欄，不放行正式R0。本review未執行環境。

### memory.high設定位置修復審查

主agent回報100531／100610在負載啟動前即因high讀回max而fail-closed，cluster已停止，未執行single-load。原`sh -c`末尾cat可掩蓋前方write錯誤，應先用`sh -ec`保留原stderr，不將read-back失敗稱作kernel不支援或high無效。

支持將寫入位置改為WSL host對**專用Docker node的精確cgroup**，屬已授權設定的修復，不是改資源門檻。必要核對：Docker inspect取得`dr-search-r0`完整ID及Running PID；只接受`/proc/PID/cgroup`的`0::/system.slice/docker-<同一完整ID>.scope`；resolved path必須在`/sys/fs/cgroup`且非root／祖先。寫前後核ID/PID未變、memory.max12Gi／swap0未變，僅memory.high寫6Gi並讀回；其他形式／路徑／權限錯誤一律停止，不fallback到全域root或其他cgroup。

high有效以前不啟kubelet／pipeline。設定失敗attempt分別保存，不當應用負載失敗或single-load重跑；成功後仍只執行已核准的一次single診斷。不得只依container名稱或未驗證的路徑作root寫入。本review未執行寫入或環境。

宿主唯讀盤點補充：PID1實際位於matching Docker scope的`/init.scope`。接受精確兩種輸入：`0::/system.slice/docker-<同一完整ID>.scope`或其固定`/init.scope`；寫入目標仍由已核完整Docker ID直接組成Docker scope，不做任意parent／向上搜尋。此scope是專用node資源邊界，不是全域祖先。寫前後核ID/PID及max12Gi／swap0／CPU12不變，保存PID實際cgroup、固定target與high讀回；其他path仍拒絕。

## 100845 high-single結果與recreate-high gate

獨立讀100845原始證據：outer/native皆passed，V1 startup21.44897秒；single-load有180唯一slot、search/page/media各60、零錯，最大12.2535ms，排程0–59秒。每Pod status與/proc核同一2metadata＋2search，app cgroup4CPU／8GiB／swap0；MinIO／init／reader三個imageID均解析到已釘選e6fe41…ac00。installer、API／SSR驗證及正常namespace清理已由pipeline完成；unit inactive／MainPID0／無殘留，clusterStopped=true。

high由專用host Docker scope的max改6GiB，CPU12／hard12GiB／swap0讀回一致。host最低6.49733GiB；末筆local_high2667、local_max0、local_oom0，但hierarchical max6812仍存在，不能稱整個子樹毫無壓力。記錄的refault／PSI為回收活動證據，不是high無效能代價或唯一成功原因的對照實驗。

已讀新增明示`recreate-high`stage：每次啟動重新設並讀回high6Gi，持續核high不漂移，進相同Recreate正式分支而非double；原`recreate`保留無high歷史語意。主agent回報當下host17.43GiB，仍須腳本當下14GiB門檻。

**放行一次recreate-high的P1–P4合成實驗**，作為自主研究目標的下一個受控步驟。不得擴RPS、worker、app／host限額；任何原guard觸線、內容錯誤、漏發／觀測缺口即停，不自動改high或重跑。host裕度不是穩定保證，single成功不代表更新／拒壞版／恢復已過；正式平台cgroup配置可否沿用及其維運責任仍未知。本review未執行實驗。

## 101241 recreate-high 最終獨立審查

結論：可結案於「受控合成資料、單 reader Recreate 發布生命週期」，不放大為正式 DR 上線／容量／零停機證明。本次只讀本機回存檔案，未另發 WSL、啟動服務或實驗。

- 直接重新彙整 P1–P4-load.ndjson 及 slots：183＋294＋645＋255＝1377 筆，各 phase 的 (i,lane) 唯一數與排程數一致。839 ok、507 outage、31 version-mismatch；零 invalid/missed，非 transition 請求零錯誤。不能稱 1377 筆全部成功。
- 成功版本：P1 全 V1；P2 V1 42／V2 190；P3 全 V2 234；P4 V2 3／V1 187。每個 200 的程式 oracle 要求 release header、搜尋 pageId/title/version，以及閱讀／附件長度和 SHA 相符。四份 semantics receipt 驗 V1→V2→V2恢復→V1回滾的改動查詢與 tags；舊 URL 的 409 已另外留證。這是指定合成 oracle，非正式搜尋品質證明。
- V3 installer receipt 的 firstError 明確為 ARTIFACT_HASH:search.sqlite、installed=false；拒絕記錄含 ProgressDeadlineExceeded，122.603 秒內辨識。V3 未成為成功服務版本。成功的四次安裝有 manifest pin、Pod UID、init/reader 映像 config ID 留證。
- P2／P3／P4 最長連續失敗取樣跨度分別 14–15／136–137／16–18 秒；是各 lane 每秒一次採樣，不是精確持續停機時間。31 次 409 也是需要使用者／client 處理的版本拒絕，不算成功。P3 包含等候 PDE 後才主動恢復的實驗政策，不能視為故障最短可能復原時間；平台沒有自動回滾。
- 四個階段恢復後各有至少 60 秒穩態；主機最低 available 7.066 GiB、cluster 最大取樣 6.00058 GiB；high 6 GiB 被觸發（local high 17782），local max 0、階層 max 18487，沒有 OOM。此結果只支持這次有界設定，不能證 memory.high 是唯一改善原因或沒有回收壓力。
- native result passed 且無 cleanupError；程式最後依 namespace UID/run label 核對後 wait=true 刪除成功才寫結果。外層 cleanup 顯示 clusterStopped=true；unit inactive/MainPID0、remainingPids=[]。已驗本次正常路徑清理；硬截止或任意故障時的優雅清理仍不在證明範圍。

剩餘決策：團隊是否接受更新／壞包的停機與舊連結 409、誰處理壞版回復及產物保存、正式平台是否提供對應資源與監控。3.31 GB SQLite 沿用完整 fixture（含正文／FTS），不可把全部下載／快取成本歸為 Tantivy 必要成本；精簡 metadata 是下一個可能降低成本的獨立變更，尚未驗證。沒有必要為本次結案再跑相同低頻實驗。

證據入口：evidence/r0-release-20261117/integration-20261117-101241/，包含原始 load、phase/state journal、安裝記錄、資源取樣及清理紀錄；review-summary.json 為便利彙整，不取代原始證據。
