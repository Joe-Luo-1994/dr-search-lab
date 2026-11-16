# 批准版本的startup恢復：設計審查

2026-11-16，獨立reviewer；只讀既有installer、publisher與K5程式，未啟服務或執行SQL。**Scope通過，可準備；具體bootstrap／controller／runner仍待靜態與產物gate。** 本輪只驗新版發布後，程序重啟能選取並恢復已批准版本，不再做容量或整套維運演練。

## 重用與新增邊界

- native `scripts/minio-release-experiment/install.mjs` 已有stream hash、unique staging、fsync、immutable release rename及原子local `active.json`；`minio-release-api/serve.mjs`有重啟讀active並pin manifest的模式。可借機制，不能整份直接移植：舊installer由外部傳prefix、沒有獨立manifest pin，舊serve只核payload大小。
- E2的manifest schema／SQLite身份核對與last-attempt／last-success可借用；last-success是成功安裝receipt，不是批准來源。remote-content既有installer依本機publication receipt，不能放到fresh Pod旁再宣稱獨立發現版本。
- 新的必要接縫是固定MinIO `control/approved.json` 指向已批准的manifest descriptor，與local active分開。採K2既有1000頁V1／1001頁V2及已出版hotset，不新建百萬資料。K5R2 runtime只在隔離副本改startup；原凍結runtime／build不動。

## 正式前必須鎖定的契約

1. **批准來源與immutable release。** Fresh config只有固定endpoint／bucket／approvedKey、cache及憑證，不含本機publication receipt或預填release descriptors。使用研究共用帳密、單publisher與每cache單startup writer假設，明示未驗正式IAM、簽章、多人發布競爭或跨區交易。一次startup只讀取並pin一份approved；它是「這次啟動讀到的批准版本」，不承諾啟動期間另一publisher改指標後仍追到最新。

2. **完整信任鏈。** approved schema／releaseId／manifest key、bytes、SHA有效且有大小界線；manifest經hash／schema檢查，releaseId=manifest.snapshotId=DB metadata；DB bytes／hash完整驗證後才啟pool。物件key限制合法release namespace，local安裝使用固定檔名，不能將manifest中的任意路徑直接拼接寫入。Hash是完整性證據，不自行證明發布者已被公司授權。

3. **publisher不能直接照搬原腳本就稱閉包完成。** 已核K2 `publish.mjs`：objects／DB有PUT後GET驗證，但manifest只有PUT；新版本必須補manifest GET bytes／hash驗證，完成後最後才PUT／GET approved。原PUT可覆寫key，新publisher應在單writer假設下拒絕同release ID不同內容，既有相同內容僅可驗證後冪等使用；不能一邊稱不可變、一邊覆寫v2/search.sqlite。這不需要本輪另加多writer或killfault矩陣。

4. **先ready能力，後寫local active。** `prepareApproved → Pool.start（含原check）→ commitActive → in-memory active/ready`；commit失敗關閉新pool，不宣布ready。local active以暫存＋rename與適用fsync借用舊機制，內容綁release及manifest hash。cache reuse也要核已批准manifest與DB hash／身份，不能只看receipt或同檔案長度。壞approved／manifest pin一律不偷偷退回local舊版；保留cache與active bytes及明確錯誤。這次未驗斷電durability或任意時點中斷恢復。

5. **startup-only不冒充hot update整合。** 舊 `/update` 仍依賴 `config.releases`，而新fresh config沒有該欄。這個隔離研究服務應明確拒絕／關閉hot-update入口，不以執行到缺欄位的TypeError當正常支援行為。既有熱切換、排空、rollback與GC責任不因startup成功自動閉合。

## 五個必要案例

| 案例 | 判定 |
|---|---|
| 批准V1，首次啟動 | 新PID ready V1，搜尋／一個正文與附件的版號、身份及hash正確 |
| 同cache保留V1，批准V2後重啟 | 新PID讀遠端approved並安裝V2，local active改V2；不能只沿用舊active |
| 真emptycache新程序 | 無producer／本機receipt依賴，從同approved恢復V2；搜尋、已變更metadata／正文與附件鏈同版 |
| V2同cache再次重啟 | 新PID核同一批准鏈與local payload後ready V2；IO記錄證明沒有重新GET DB，不把讀approved／manifest省略掉 |
| 同cache壞manifest pin | readiness不成立、沒有ready事件／成功服務回應；local active bytes及原release不變，原因明確 |

可以再用真正空cache覆用同一壞指標做廉價拒絕檢查，但不擴展整個故障矩陣。判「不ready」看明確健康／回應與事件，不只看port是否存在；Next可能已listen但尚不能服務批准版本。每個成功案例只需少量能辨認V1／V2的source oracle；不要重跑九query容量工作集或完整E1。

舊K5 init固定V1已由程式證明，不需重演預期反例。每次restart要保存舊PID退出與新PID、cache是否預存、approved／manifest／active hash、DB下載或reuse來源、逐步耗時、失敗原因及介入。版本選擇不能由test driver直接傳v2替代bootstrap discovery。

## 停損與結論

具體卡凍結單request／bootstrap總期限、資源／磁碟護欄及finally清理；沿用原pool／SQL期限，不為小案例失敗而自動改產品或指標政策。來源／身份／hash錯誤立即停，保留原attempt；原凍結檔及新輸入前後核hash。

成功只證這個小fixture可從批准指標完成startup選版、驗證、安裝與cache reuse。可以因此刪掉「每次重啟人工指定版本」這一項研究操作；不能直接量成正式DevOps月工時節省。沒有驗auto polling、任意版本連續發布、hot update整合、GC／rollback、故障worker自癒、正式IAM／ReBAC或跨站發現。這些仍留在維運責任表，不本輪順便加做。

## 具體程式靜態審查

已讀 `scripts/c-restart-20261116/bootstrap.mjs`、`publisher.mjs`、`environment.py`、本輪plan，並對照原service／pool／storage／fixture。**可進行不啟服務的prepare；正式freeze與執行前，controller有以下兩項必修。** 尚未核實native產物、實際runtime差異、hash freeze或配額，未執行服務／SQL／HTTP。

1. **資源護欄失敗必須不可逆地停止主流程。** 現在guard thread只寫 `guard-failure.json` 並stopall，主流程沒有共享失敗狀態，仍可能publish或啟下一個unit；最後passed也沒檢查護欄失敗。最小修正是共享stop reason／停止事件，觸發時先鎖定，再停units；每個publish、case、unit啟動及request前後檢查，最終passed必須包含沒有guard failure。監測例外使用同一路徑，不能只停一次後繼續。
2. **readiness 60秒須是完整期限。** `urllib.request.urlopen(timeout=60)`只提供socket操作等待限制，不能把它當作含waitport、回應body的整條readiness硬截止。以case啟動時的monotonic deadline或獨立timer守住60秒，到期停止本case unit並保留明確失敗；一般HTTP也明列自己的期限，不以controller 600秒替代單次readiness。

其餘核心接縫靜態對應到位：approved固定key／16KiB上限、manifest完整pin／1MiB上限、release與DB key限制、cache全檔hash／身份一致性、candidate不先改active、Pool.start檢DB snapshot及quick_check後才commit；publisher具既存內容衝突拒絕、manifest讀回及最後approved讀回。隔離service明確回 `STARTUP_ONLY`，不依缺失的release catalog誤宣稱hot update支援。

controller六案例與最小範圍一致。startup storage method/key紀錄只支持「client沒有發DB GET」，不是server端audit；正向回應核source oracle，負向核無ready且cache／active不變。產物gate還須確認prepare產生的service只改指定init／入口、storage只加無憑證紀錄、pool仍8workers，以及舊K5凍結檔未變；準備通過不代表這些產物已經核實。

### 定向修正與prepare產物複核

兩項finding均 **closed**。controller已使用不可逆STOP／首個reason，guard先鎖定再stop；publish、case、unit啟動及HTTP前後ensure，最終passed含STOP與guard檔檢查。readiness獨立60秒timer從unit啟動前涵蓋完整status response，到期鎖定失敗並停unit；成功回應後取消timer並另核elapsed小於60秒。整輪600秒也鎖定停止原因。一般HTTP仍是60秒socket等待設定，未宣稱每條HTTP具有額外60秒端到端硬截止；本輪另受總controller期限約束。

已唯讀比較native `.lab/c-restart-20261116/runtime` 與K5 R2實際副本：pool／worker逐位元相同；service只有bootstrap import、init順序與STARTUP_ONLY拒絕；storage只有method/key client紀錄。bootstrap／publisher與Windows來源逐位元相同，SHA分別為 `d114b9db169729309986f7b511b4ca9cc1f3572172813070bf782806bdaf8644`、`b97761f64cbbe52adbff613d8b87004809dd7ac4d65142fdfe231a3c791e8cf7`。prepare只建立隔離副本，未啟服務。

**可freeze。** 本輪靜態與指定副本gate已通過；freeze還需保存原K5比對、新sources／小fixture／build等輸入hash。實際limits與六案例仍是後續唯一controller執行要產出的證據，不能先稱已驗成功。本review自freeze起不再修改。
