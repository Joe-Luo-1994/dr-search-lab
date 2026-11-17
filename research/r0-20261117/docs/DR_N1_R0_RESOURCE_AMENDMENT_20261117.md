# R0 本機有界預檢修訂

使用者「繼續」承接較小MinIO與有界預檢方向。保留2 Rust＋2 metadata、E契約、每app 4CPU/8GiB limits；不修改原N1證據。下列是預檢配置，不是正式R0已通過。

## 依據與限制

既有G3a Tantivy summary各階段reader cgroup lifetime peak最大266.5MiB，MinIO511.7MiB。支持先量測而非要求limits總和全額預留，但不涵蓋安裝、下載、校驗、雙Pod、建V2，也不是正式工作集。不能由此保證12GiB足夠。

## 專用環境與預算

- 僅dr-search-r0 profile；外層Docker明確設CPU12、memory12GiB、memory-swap12GiB（swap額度0），在cgroup讀回cpu.max、memory.max、memory.swap.max；不能採node虛高allocatable作預算。
- 不修改全域WSL20GB上限、不停止其他服務。單cluster包含控制平面及研究服務。app requests先候選1CPU/2GiB、limits4CPU/8GiB；最多兩個app同時存活。MinIO requests0.5CPU/512MiB、limits2CPU/2GiB。loader留在cluster外單獨記帳。此配置容許limits超配，並不保證兩app各能同時用滿8GiB。
- 預檢只驗外層控制與平台空載，最多5分鐘；暫不部署app/MinIO或產製新release。開始時Windows available至少14GiB；啟動後每2秒監測，低於6GiB即停止專用cluster。外層memory.current>10GiB、memory.events oom/oom_kill增加、swap.current非0、監測中斷超10秒，皆停止。外控總期限300秒，finally停止專用cluster。原始取樣保留。
- 容器cgroup限制若不符，不進下一階段；不得用swap或降低app上限混過驗收。這一階段只提供最小實作的環境前提，不提供正式發布實驗容量認證。

## 後續門檻

外層預檢過後才做installer／probe／版本參數化與部署最小實作。正式R0前另需reviewer確認受控安裝與雙reader預檢證據：實際記憶體、磁碟及MinIO無瓶頸；若不能滿足12GiB護欄即停止討論，不自動升額。resource requests、ephemeral budgets、probe時間與完整oracle仍在P0凍結。

發布實驗結果只可描述這套本機超配環境，不與N1原MinIO4CPU4GiB直接當性能A/B。host與builder也需納入原總時限及記憶體護欄，不能把cluster外建置成本漏掉。
