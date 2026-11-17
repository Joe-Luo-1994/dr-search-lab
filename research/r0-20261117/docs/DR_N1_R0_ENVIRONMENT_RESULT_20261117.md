# R0 空載環境預檢：局部修復後通過，非發布實驗

## 最新結果（先前失敗保留）

environment-20261117-084103 診斷取得真實NodeStatusUnknown、舊lease及kubelet DNS錯誤：`control-plane.minikube.internal`無法解析。容器重啟後/etc/hosts缺APIalias，導致kubelet無法向API更新；明確定位後主動停止，結果保留failed，不計容量失敗。原始kubelet-diagnostic.txt在該證據目錄。

修復只在專用dr-search-r0容器啟動時補上當前minikube IPv4的APIalias，getent必須只回該IP；不修改Windows／WSL全域DNS。私有kubeconfig仍與其他專案隔離。新增lease證據，僅本次啟動後renew且age<=40秒才開始Ready窗口。首次Ready前的API錯誤仍是有界啟動輪詢；Ready後查詢錯誤立即停止，不掩蓋觀測缺口。

environment-20261117-084246 已通過：70.483秒完成空載驗證，26筆cgroup樣本；本次fresh lease＋Ready連續60秒、系統pods全Ready、12CPU／12GiB／swap0讀回、無OOM、cleanup stopped=true。主機最低可用14.296GiB；cluster memory.current峰1341.141MiB；首筆cgroup5.374秒，之前僅host／總watchdog保護。未執行任何研究負載，不是雙Pod／下載／MinIO容量通過。

下一步可依reviewer結論進離線最小實作；正式發布實驗仍須installer、manifest/oracle、termination、Pod資源與受控容量門通過。不能因空載成功直接啟動R0。

僅執行reviewer准許的專用cluster空載預檢；沒有app／MinIO部署、release建置或R0發布實驗。資源修訂見 DR_N1_R0_RESOURCE_AMENDMENT_20261117.md。

| attempt | 結果 | 解讀 |
|---|---|---|
| environment-20261117-083053 | cgroup cat收到目錄而非檔名；停止確認成功 | 跨Windows／WSL shell變數展開造成儀器失效，改固定指標路徑，不作資源證據 |
| environment-20261117-083114 | CPU/memory/swap讀回成功，但未Ready；診斷後主動stop，程式記container not running | Dockerstart未恢復kubelet且全域context缺失；修專用KUBECONFIG及啟kubelet，不改舊context |
| environment-20261117-083445 | NODE_LOST_READY；停止確認成功 | 曾觀測Ready但未完成60秒窗口。程式當時將API失敗／解析失敗／ReadyFalse合併，缺原回應，不能定位真實原因 |

第三次28筆host、23筆cgroup樣本：主機available最低14.747GiB；cluster memory.current最高1089.969MiB；cpu.max=1200000 100000、memory.max=12884901888、memory.swap.max/current=0，沒有oom/oom_kill。首筆cgroup於1.870秒、末筆53.454秒；啟動至首筆只有獨立host監控與總期限保護。這支持空載資源限制生效，不證下載／雙reader／更新容量。

已修Python診斷為保存node-observations.ndjson，分開API錯誤與Ready回應；修訂後尚未重跑。不偷偷忽略不穩定窗口或放寬截止，三次失敗都保留。PS初稿已明確throw禁用。

下一項限縮為Ready失敗原因診斷，需區分API錯誤、實際ReadyFalse及重啟前快取condition；在確認前不做最小產品runtime或發布實驗。原始證據在 evidence/r0-release-20261117/各attempt，尚未推送。
