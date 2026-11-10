# 內網 Harbor 與依賴探索卡 H01

2026-11-10（Asia/Taipei）。使用者回報公司有Harbor、似乎有部分API；尚未取得版本、可讀專案、映像清單或內網agent執行結果。本雲端session無已驗證的內網連線，沒有查詢公司Harbor。正式endpoint、digest、inventory及登入資訊保留在公司環境。

## 要得到的決定

用現有映像與套件來源，能否以可接受成本準備一次synthetic Demo？先釐清供應路徑，再寫符合公司基底的container配置。不要先寫死Docker Hub公共image、假定可pull，或把一張公共Dockerfile當成內網部署已完成。

建議預算：與DevOps／內網agent用30–45分鐘只讀盤點；達時間上限就回報候選／阻塞。此為提議的探索時盒，未約會議、未承諾他人工時。

## 最小輸入（在內部提供）

- Harbor實際URL、版本／API文件入口、允許查詢的project與已知repository；只查被授權scope。
- agent可用的網頁／Docker CLI／Harbor GET API，既有登入／credential helper與公司CA；不把token複製到提示或報告。
- 目標主機OS／CPU架構、已有Node runtime或基底image、資源與可寫磁碟。
- 公司npm mirror／proxy／已核准套件流程，及是否有現成Playwright驗證環境。

## 逐步探索，避免一次搬整套Infra

| 步驟 | 只讀動作 | 保存什麼（內部） | 如何解讀 |
|---|---|---|---|
| 1.確認範圍 | 開啟提供的Harbor專案或API文件，以既有身份確認可讀 | 版本、scope、操作工具；不保存Authorization／cookie | 401/403是存取阻塞，不能說映像不存在 |
| 2.找最多3個候選 | 優先現行Next服務已有base、團隊Node base、已核准Node22系列；檢查明確repo的artifacts | repo、tag、digest、OS/architecture、multiarch子manifest、維護owner | tag字樣不是runtime實測；不要只選latest |
| 3.確認依賴路徑 | 檢視既有npm／CA／native binary取得流程 | root與Pagefind兩份lockfile所需來源是否可得 | Harbor存OCI映像，不自動等於有npm套件來源 |
| 4.對照執行條件 | 查現有image描述／SBOM／已存在掃描結果與部署配置 | Node/npm、glibc或musl、非root、磁碟／volume、服務管理 | 描述與既有scan只是線索；尚未在image執行就標未驗證 |
| 5.形成小決定 | 三個候選擇一或記阻塞，列最小補件與owner | 下表及下一步 | 先選可驗證方向，不把查到tag當部署通過 |

優先用該公司Harbor UI/API Explorer：官方2.10文件描述從UI進入，直接路徑範例是 `/devcenter-api-2.0`，但公司版本／proxy可能不同，以公司文件為準。只使用GET／HEAD，不觸發scan、replication、push、delete、retag或設定修改。

常見v2 API資源（僅作概念對照，**不是已確認公司的端點**）：

```text
GET /api/v2.0/projects/{project_name}/repositories
GET /api/v2.0/projects/{project_name}/repositories/{repository_name}/artifacts
GET /api/v2.0/projects/{project_name}/repositories/{repository_name}/artifacts/{reference}
```

由API Explorer依部署版本產生URL／query／路徑編碼，尤其含斜線的repository不要手工猜編碼。使用分頁與版本支援的filter；只讀必要欄位，不抓全站catalog。API不可用時改同scope UI，不改權限或盲猜端點。

如果已有Docker CLI和既有憑證，可對**已確認的具體image**讀manifest（下列為佔位，先替換成內部核准值）：

```bash
docker manifest inspect --verbose '<內部Harbor>/<已授權project>/<已知repo>:<候選tag>'
```

這是metadata讀取，並不證明image可以run。若遇401/403、CA／TLS、網路或CLI不支援，就保存去敏錯誤分類，與owner確認一次後停止該路徑；不使用 `--insecure`／`curl -k`、不輸出Docker config／token、不臨時換成公共registry。

## 本Demo的實際需求

- 已測基線：Node22.21.1，Linux；`node:sqlite`與FTS5可用，npm固定依賴可安裝。這是Lab可重播基線，不是要求正式系統永久鎖此patch。若公司只有另一受維護版本，記錄差異並安排相容測試；不悄悄改版本後沿用既有結論。
- Next build/runtime可能涉及目標平台native依賴；CPU架構、glibc/musl與套件來源須對上。不能將雲端node_modules複製到不同平台當可用證據。
- Pagefind1.6.0另有平台binary optional dependency；不要以「optional可全部略過」推論建索引仍能跑。從lockfile確認目標平台package。
- Browser smoke需要Playwright對應Chromium與OS依賴。可用現有驗證容器／主機，不一定放進Demo runtime image；沒有時先標未驗證。
- 最小Web Demo只有三個嵌入式引擎，不必為展示新增ES／MinIO。真實MinIO發布實驗後續依既有資源另定。
- Runtime需要fixture與build可讀、測試／報告路徑可寫；重啟、volume遮蓋、uid與副本數要確認。loopback綁定與公司內部入口見 `INTERNAL_DEMO.md`。

## 交付表（正式值只留內網）

| 項目 | 候選A：現行Next base | 候選B：團隊Node base | 候選C：其他核准base |
|---|---|---|---|
| project/repo/tag／digest | 待查 | 待查 | 待查 |
| manifest與目標architecture | 待查 | 待查 | 待查 |
| Node/npm版本：描述／實測分列 | 待查 | 待查 | 待查 |
| owner／修補與供應流程 | 待查 | 待查 | 待查 |
| npm／Pagefind native／Chromium來源 | 待查 | 待查 | 待查 |
| runtime條件、差距、下一步 | 待查 | 待查 | 待查 |

先得到可用候選與owner後，在內部核准的隔離工作區pull／驗證／建置；不要在production主機上試改。跑 `scripts/runtime-capabilities.mjs` 可驗證Node／FTS5並輸出少量能力資訊；它不檢查Harbor、登入、網路或正式DR。再跑fresh demo prepare及browser tests，保存內部實測，不以metadata代替執行證據。

## 停止與轉向條件

- 時盒內沒有候選：列出是權限、供應、平台或功能差距，請owner處理最小一項，不無限枚舉tag。
- 有已核准原生Node但無合適image：可先用Linux原生synthetic Demo推進討論；container狀態獨立保留未知。
- 只有不同Node／平台：安排有界相容性測試，失敗保留，不換掉正式runtime或重建現有資料。
- 只有缺Chromium：標示browser驗收待做，不能刪除測試後宣稱通過。
- 機制要求公共下載或新付費服務：先回到現有mirror／核准流程與owner，不在此輪自行新增。

## 可直接交給內網agent的任務

> 請先讀本卡與INTERNAL_DEMO.md；使用內部提供的Harbor URL、明確project/repository scope與既有身份，在30–45分鐘內只讀查最多3個Node候選映像。以本Harbor部署的API文件／UI為準，保存repo/tag/digest/platform及證據位置（留內網），區分已看metadata與實際run。同步確認npm、Pagefind平台package及可用browser測試來源。不要讀出／記錄憑證、不要push/delete/scan/replicate、不要改production或公開部署。缺權限或失敗保留原因，不繞TLS。輸出候選表、最小差距、owner與下一個有界測試；尚未取得的資訊保持未知。

## 參考

- Harbor API Explorer（官方2.10；不代表內部版本）：https://goharbor.io/docs/2.10.0/working-with-projects/using-api-explorer/
- Repository／artifact／digest／image index：https://goharbor.io/docs/main/working-with-projects/working-with-images/repositories/
- API schema可參照上游，但實際依部署版本：https://github.com/goharbor/harbor/blob/main/api/v2.0/swagger.yaml
