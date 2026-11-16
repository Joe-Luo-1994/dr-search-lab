# C 容量候選 K1：獨立事後審查

2026-11-16。**本輪固定資源、合成工作集的有界容量觀察可有限結案；沒有找到飽和上限，也沒有證明 C 優於 A／B。** Reviewer 離線重算原始請求／資源採樣／事件與凍結檔 hash，未重跑服務、HTTP 或負載。

## 能支持的結論

Linux WSL2／Node22.18.0／Next16.4.5 下，reader 全程序群組設2 CPU、1 GiB、swap0，MinIO另設1 CPU、512 MiB、swap0。664份資源樣本的設定均相符。100k搜尋資料、256頁遠端正文hotset、8附件（64KiB／2MiB／8MiB）的固定工作集，在預定最高32 req/s搜尋／內容／混合短窗皆符合研究靶點；混合更新8 req/s、60秒也符合。**32 req/s是已測最高到達率，不是最大QPS或正式可承諾負載。** 主機有28 logical CPU，quota不代表專用核心；builder／generator及主機其他資源不在reader預算內。

| 階段 | 到達率／窗長 | raw工作數 | 含排程P95 | reader採樣memory.current峰 | reader平均CPU核數 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 搜尋最高階 | 32/s，20秒 | 640 | 108.95ms | 454.66MiB | 1.645 |
| 內容最高階 | 32/s，20秒 | 640 | 17.70ms | 468.41MiB | 0.269 |
| 混合最高階 | 32/s，20秒 | 640 | 109.11ms | 475.85MiB | 1.083 |
| 混合＋更新 | 8/s，60秒 | 480 | 109.20ms | 833.22MiB | 0.341 |

CPU為階段內首末採樣差額除時間，記憶體是500ms採樣峰，不是瞬間峰或最低部署規格。混合比例為6搜尋：3正文：1附件，不可把32混合req/s寫成32次完整搜尋→閱讀→下載任務／秒。內容最高階20秒交付598,046,016 response bytes，約28.52MiB/s；只為此大小分布下的loopback觀察，不能直接當跨站頻寬規格。

正式14個計量階段共4,020筆；另有20筆warmup及50筆前後契約，raw合計4,090筆，皆記200／ok。27個control checks亦無失敗，其中預期拒絕是契約證據，不算成功使用者任務。逐階raw數量與P95重算和result一致；無timeout／admission rejection／漏送，最大記錄generator延遲約2.05ms。低率階只有20筆，且查詢循環／階段順序固定，較高率P95較低不代表負載增加使系統變快。正確性主張限來源oracle的exact total、eligible unique Top10、metadata／prefix snippet及body／附件hash；不是BM25排序等價或真實搜尋品質驗收。raw主要保存驗證終態而非所有response原文，因此本review不假稱對4,090份原文再次逐欄重驗。

## 更新、保全與資源壓力

V2真下載333,807,616 bytes，下載／驗hash約19.914秒，自下載起至activated約20.386秒；159筆正常負載與真下載窗重疊，V1／V2搜尋均有成功樣本，最後有舊pool排空事件。16MiB/s為事前指定應用節流，**不是WAN模型、整體RTO或完整上游發布時間**。V1／V2本地DB分別333,697,024與333,807,616 bytes，兩份合計667,504,640 bytes，尚未包括其他檔／staging配置。

正式自然跨activation請求數為0，raw沒有409；後續專用control驗舊URL409，不能推論正常使用者不會遇到重搜。smoke-3的刻意held-V1另證pin／排空機制，不能混進正式容量數字或宣稱自然零中斷。正式testHooks=false。

**MinIO已遇到記憶體限制壓力，不能寫成仍很寬裕。** 本輪`memory.events.max`由2,200增至2,789（增589）；kernel累積`memory.peak`約516.07MiB，略高於512MiB設定，但正式開始／結束相同，包含準備期峰值，不歸因為正式負載新增峰。正式採樣current接近設定且有回收活動，OOM／oom_kill均為0。本審查保留設定值與觀察值，不將累積峰值反推限制未生效，也不寫「所有時刻都低於512MiB」。reader更新時採樣峰約833MiB，顯示新舊版本／cache重疊是實際代價；不可拿單版常態峰替代更新規格。

所有`io.stat`為null，**本輪未取得block-device I/O計數**；不能宣稱磁碟壓力已量清。可用的是下載／回應logical bytes、page-cache統計、66份磁碟護欄採樣；研究目錄採樣峰3,670,970,184 bytes、free最低954,075,234,304 bytes，未碰8GiB／10GiB護欄。此目錄包含fixture／研究歷史，非單Pod儲存需求。

Reviewer另在native唯讀重hash全部62個freeze輸入，均符；兩份正式installed DB亦與config pin之bytes／SHA相符。這證明被列入freeze的內容保全，不擴張為所有node_modules／全部歷史檔都在這62項之內。原smoke-1環境失敗、smoke-2／3及oracle初版均保留，沒有正式失敗後調參重跑。

收尾已核`cleanup.json`：3172／19540／19541連線均回111拒絕，MinIO unit inactive；reader unit保留failed／exit143。另唯讀native `cleanup-detail.json`記1749／1769／1770／1870／1871均不存在，並核已安裝Next16.4.5 `start-server.js:364–365`在SIGTERM cleanup明確exit143。這與formal controller finally的systemctl stop一致，不能把unit failed狀態抹掉，但目前證據支持為負載完成後的停止退出碼，非正式負載中程序故障。未由reviewer重新起服務或送HTTP。

## 成本意義、限制與停止理由

[成本紀錄](C_CAPACITY_COST_LEDGER_20261116.md)的五個工作包符合本輪實作：按需metadata／摘要、長駐worker與背壓、完整驗hash內容交付、版本安裝／pin／排空，以及資源／實驗工具。這次新增工程改善了舊小型adapter的全量重讀與每query spawn路徑，但不是相同負載的before／after實驗，不能聲稱各改動帶來特定倍數加速。

中央builder／publisher另計：兩版fixture build約8.18秒；發布紀錄1,065次請求、PUT約698.1MB、GET約698.0MB，讀回驗證與兩版發布是真實工作。publisher的process maxRSS為1,359,336KiB，約1.30GiB，超過reader的1GiB預算但屬預先明示的外部中央工具，不能省略，也不能記成reader越限。這些是研究執行成本，不是公司工程人日，也不應乘成每個reader的常態開銷。每地／reader仍承擔完整artifact更新、版本保留、記憶體重疊、內容線上依賴與故障處理。A原本使用MinIO；共同內容儲存不能算成C獨有節省。

限制保留：來源正文高度重複、附件有合成padding、固定hotset、暖cache／固定階段順序、20秒短窗、僅一次正式序列；沒有cold-object分布、長時間運行、多站、WAN／丟包、K8s或真實consumer。published-marker不是新builder的PDF-only抽取文字驗證；8MiB完整buffer不代表Range／任意大PDF已解決。mock身份及研究admin不能部署成正式授權。A公司Backend／MariaDB不在repo，B本輪未測，舊L百萬與本候選不可拼成同build容量。

**停止本輪，不追加負載。** 已足以支持「此C候選在已測負載下維持任務正確與研究延遲靶點，值得帶具體工作包向對口核實」，不足以支持「正式容量已足夠／C總維運最低」。下一個決定應依正式負載／內容分布、可接受的切版重搜與新增維護owner，以及A現有增站自動化成本；只在這些輸入暴露會改變方案的未知時，再選有界補驗。

證據入口：`evidence/c-capacity-20261115/formal-1/load/`的result／raw／resources，formal-1的events／disk／limits／ready／config-public，根目錄freeze-before／after與analysis，以及smoke-3獨立pin probe。analysis只作對照，本裁定主要數字由raw及資源樣本重算。
