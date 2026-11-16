# E2 小型合成 C 操作手冊

從 Windows Search Playground repo 根目錄執行，使用已存在的 Node 22／Next。所有 E2 資料與暫存位於 `.lab/v1-e2-20261115`，所有端口限 loopback。這輪檔案傳輸採本機複製，主站故障是兩個 producer 路徑的隔離模擬。保留所有嘗試與舊版；遇到非預期錯誤記錄指令、輸出及觀察後停止，交由主 agent 判讀。時間門檻以凍結卡為準。

## 1. 準備並啟用 V1

正式 runner 執行一次。若輸出已存在，先核對本輪狀態與證據。

```powershell
$e2 = 'scripts/v1-e2-20261115'
node "$e2/prepare.mjs"
$v1 = node "$e2/export.mjs" v1 fz1 | ConvertFrom-Json
$v2 = node "$e2/export.mjs" v2 fz2 | ConvertFrom-Json
$mixed = node "$e2/export.mjs" mixed-v2 | ConvertFrom-Json
node "$e2/build.mjs"
node "$e2/install.mjs" v1 main $v1.manifestSha256
```

每步確認成功才進下一步，保存所有 export 回執並驗均為 `e2_artifact_exported`。三包使用各自的 manifest 摘要。安裝成功會先記 `e2_staged_hashes_verified` 再記 `e2_install_ready`。
Build 限 300 秒。成功後確認 `.lab/v1-e2-20261115/build-receipt.json` 鎖定當次輸入與產物，失敗時保留 `build-attempt.json` 和輸出。

開兩個專用終端，分別從同一 repo 啟動 V1 reader 及流量入口，保留執行中視窗及各自 PID。

```powershell
node scripts/v1-e2-20261115/serve.mjs v1 3158 main
node scripts/v1-e2-20261115/traffic.mjs serve
```

在 runner 終端切往 V1 並讀回。等待第一個終端有 `e2_ready` 和對應 PID，流量入口也應完成啟動。

```powershell
node "$e2/traffic.mjs" set 3158
Invoke-RestMethod -Uri 'http://127.0.0.1:3160/api/status' -TimeoutSec 5
```

應顯示 `v1-e2-20261115-v1` 及本機安裝紀錄。先完成 V1 搜尋→正文→附件→下載，保留搜尋結果 URL、`page.mediaUrl`、PDF URL 及已開啟的瀏覽器搜尋結果，供跨版檢查。各 URL 應含版本參數。

## 2. 混版拒絕

```powershell
node "$e2/install.mjs" mixed-v2 main $mixed.manifestSha256
Invoke-RestMethod -Uri 'http://127.0.0.1:3160/api/status' -TimeoutSec 5
```

安裝應為非零退出。先出現 `e2_staged_hashes_verified`，再出現 `e2_install_failed` 及 `SQLITE_IDENTITY_MISMATCH`。保留此 staging。狀態應顯示 V1 還在供應，最近成功安裝仍為 V1，最近嘗試另外列出 V2 失敗。依卡比對 `traffic.json` bytes，以及 V1 原搜尋、正文和附件仍可讀。此處不執行 set。

## 3. 啟用 V2，恢復既有任務

```powershell
node "$e2/install.mjs" v2 main $v2.manifestSha256
```

成功後開新的專用終端，啟動並保留 V2 reader。等待 `e2_ready` 的版本、PID 與安裝摘要。

```powershell
node scripts/v1-e2-20261115/serve.mjs v2 3159 main
```

在 runner 終端切流並驗證。

```powershell
node "$e2/traffic.mjs" set 3159
Invoke-RestMethod -Uri 'http://127.0.0.1:3160/api/status' -TimeoutSec 5
```

應顯示 `v1-e2-20261115-v2`。原 V1 URL 送至相同入口應回 `409 VERSION_MISMATCH`。原瀏覽器分頁點舊結果，應顯示「資料版本已更新」。按「重新搜尋」得到同一 anchor 的 V2 結果，讀新版正文並開啟／下載新版 PDF。合成 client 應同樣保留 409 證據，再重新搜尋並沿回傳的新連結完成鏈。

## 4. 非作者接手：由已存 DR artifact 安裝 fresh reader

只執行本節。主 agent 已隔離兩個本輪 producer 路徑，提供凍結的 `evidence/v1-e2-20261115/operator-input.json`。操作者可讀此手冊和輸入檔。保留實際步驟、失敗、判斷、求助及回覆。無需改動來源或路由。

```powershell
$e2 = 'scripts/v1-e2-20261115'
$lab = '.lab/v1-e2-20261115'
$handoffClock = [System.Diagnostics.Stopwatch]::StartNew()
$job = Get-Content -Raw -LiteralPath 'evidence/v1-e2-20261115/operator-input.json' | ConvertFrom-Json
if ($job.artifactVersion -ne 'v2' -or $job.cache -ne 'fresh' -or $job.port -ne 3161 -or
    $job.expectedSnapshotId -ne 'v1-e2-20261115-v2' -or $job.v2ManifestSha256 -cnotmatch '^[0-9a-f]{64}$') {
  throw '凍結輸入不符'
}
if ((Test-Path -LiteralPath "$lab/producer/fz1") -or (Test-Path -LiteralPath "$lab/producer/fz2") -or
    (Test-Path -LiteralPath "$lab/caches/fresh")) { throw '來源隔離或 fresh cache 前置狀態不符' }
$null = New-Item -ItemType Directory -Path "$lab/operator"
node "$e2/install.mjs" $job.artifactVersion $job.cache $job.v2ManifestSha256
if ($LASTEXITCODE -ne 0) { throw 'fresh 安裝失敗' }
$fresh = Start-Process -FilePath (Get-Command node).Source -ArgumentList "$e2/serve.mjs",'v2','3161','fresh' `
  -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput "$lab/operator/reader.stdout.log" -RedirectStandardError "$lab/operator/reader.stderr.log"
$fresh.Id
```

在卡片指定期限內檢查 `$lab/operator/reader.stdout.log` 的 `e2_ready`，其 PID 為 `$fresh.Id`、版本為 `v1-e2-20261115-v2`、cache 為 `fresh`，且 manifest SHA 與凍結輸入相同。若服務未就緒，保留兩份 log 並回報。

```powershell
$origin = 'http://127.0.0.1:3161'
$person = @{'x-e1-identity' = 'a'}
$status = Invoke-RestMethod -Uri "$origin/api/status" -TimeoutSec 5
$search = Invoke-RestMethod -Uri "$origin/api/search?q=e2packet" -Headers $person -TimeoutSec 5
if ($status.snapshotId -ne $job.expectedSnapshotId -or $search.snapshotId -ne $job.expectedSnapshotId -or
    $search.total -ne 1 -or $search.hits[0].pageId -ne 'a-pdf') { throw 'fresh 版本或搜尋不符' }
$page = Invoke-RestMethod -Uri ($origin + $search.hits[0].url) -Headers $person -TimeoutSec 5
$list = Invoke-RestMethod -Uri ($origin + $page.page.mediaUrl) -Headers $person -TimeoutSec 5
if ($page.snapshotId -ne $job.expectedSnapshotId -or $list.snapshotId -ne $job.expectedSnapshotId -or
    $page.page.body -notlike '*e2packet identifies the revised deployment attachment.*' -or
    $list.media.Count -ne 1 -or $list.media[0].mediaId -ne 'pdf-checklist-v2') { throw '正文或附件版本不符' }
$pdf = "$lab/operator/readback.pdf"
Invoke-WebRequest -UseBasicParsing -Uri ($origin + $list.media[0].url) -Headers $person -TimeoutSec 5 -OutFile $pdf
$digest = (Get-FileHash -LiteralPath $pdf -Algorithm SHA256).Hash.ToLowerInvariant()
if ($digest -ne '22b32411322dc3cfaed1e2ee15b4eb173c1708d2771c536f9a4a15478b366dae' -or
    (Get-Item -LiteralPath $pdf).Length -ne 678) { throw 'fresh PDF 校驗不符' }
$handoffClock.Stop()
[pscustomobject]@{pid = $fresh.Id; snapshotId = $status.snapshotId; pageId = $page.page.pageId;
  mediaId = $list.media[0].mediaId; pdfSha256 = $digest; output = "$lab/operator"; elapsedMs = $handoffClock.ElapsedMilliseconds} | ConvertTo-Json
```

回報上面物件、安裝輸出、log 位置、操作起迄及人工判斷。交由 runner 決定是否接續讀回後收尾。

## 5. 回退與收尾

若 V1 仍在 3158 且 `/api/status` 確認版本，runner 可由原路由入口回退。

```powershell
node "$e2/traffic.mjs" set 3158
Invoke-RestMethod -Uri 'http://127.0.0.1:3160/api/status' -TimeoutSec 5
```

讀回 V1 並實走 V1 鏈；配對 V2 的舊 URL 此時應依同一版本契約拒絕。完成證據保全後，用 Ctrl+C 停止持有的前景 reader 與 proxy。Fresh 若仍在背景，先核對 listener 的 OwningProcess 等於剛記錄的 `$fresh.Id`，並核對命令列。

```powershell
$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3161 -State Listen -ErrorAction SilentlyContinue
if ($listener.OwningProcess -eq $fresh.Id) {
  $owned = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($fresh.Id)"
  if ($owned.CommandLine -match 'v1-e2-20261115[/\\]+serve\.mjs.*v2.*3161.*fresh') {
    Stop-Process -Id $fresh.Id
  }
}
Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3158,3159,3160,3161 -State Listen -ErrorAction SilentlyContinue
```

受控目標都停止後，保留本輪 .lab 及證據。沒有在其他 Node 程序、既有 cache、ES、E1 或 WSL 目錄執行清理。回退演練由正式卡決定是否執行。
