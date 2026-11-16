$ErrorActionPreference = 'Stop'
$e2 = 'scripts/v1-e2-20261115'
$lab = '.lab/v1-e2-20261115'
$outDir = "$lab/operator-attempt2"
$startedAt = [DateTimeOffset]::Now
$handoffClock = [System.Diagnostics.Stopwatch]::StartNew()
$transcriptPath = Join-Path $outDir 'operator-transcript.txt'
$actionsPath = Join-Path $outDir 'commands-and-decisions.log'
Start-Transcript -LiteralPath $transcriptPath | Out-Null
try {
  "firstAttemptFailed=true`ninterventionCount=1`nStarted: $($startedAt.ToString('o'))" | Set-Content -LiteralPath $actionsPath
  $job = Get-Content -Raw -LiteralPath 'evidence/v1-e2-20261115/operator-input.json' | ConvertFrom-Json
  if ($job.artifactVersion -ne 'v2' -or $job.cache -ne 'fresh' -or $job.port -ne 3161 -or
      $job.expectedSnapshotId -ne 'v1-e2-20261115-v2' -or $job.v2ManifestSha256 -cnotmatch '^[0-9a-f]{64}$') {
    throw '凍結輸入不符'
  }
  if ((Test-Path -LiteralPath "$lab/producer/fz1") -or (Test-Path -LiteralPath "$lab/producer/fz2") -or
      (Test-Path -LiteralPath "$lab/caches/fresh")) { throw '來源隔離或 fresh cache 前置狀態不符' }

  $installCmd = "node `"$e2/install.mjs`" $($job.artifactVersion) $($job.cache) $($job.v2ManifestSha256)"
  "`nCommand: $installCmd" | Add-Content -LiteralPath $actionsPath
  & node "$e2/install.mjs" $job.artifactVersion $job.cache $job.v2ManifestSha256 2>&1 |
    Tee-Object -FilePath (Join-Path $outDir 'install.stdout-stderr.log')
  $installExit = $LASTEXITCODE
  "ExitCode: $installExit" | Add-Content -LiteralPath $actionsPath
  if ($installExit -ne 0) { throw 'fresh 安裝失敗' }

  $serveCmd = "node $e2/serve.mjs v2 3161 fresh (hidden background)"
  "`nCommand: $serveCmd" | Add-Content -LiteralPath $actionsPath
  $fresh = Start-Process -FilePath (Get-Command node).Source -ArgumentList "$e2/serve.mjs",'v2','3161','fresh' `
    -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $outDir 'reader.stdout.log') -RedirectStandardError (Join-Path $outDir 'reader.stderr.log')
  "PID: $($fresh.Id)" | Tee-Object -FilePath (Join-Path $outDir 'reader.pid.txt') | Add-Content -LiteralPath $actionsPath

  $ready = $false
  $readerLog = Join-Path $outDir 'reader.stdout.log'
  for ($i = 0; $i -lt 30; $i++) {
    if (Test-Path -LiteralPath $readerLog) {
      $logText = Get-Content -Raw -LiteralPath $readerLog
      if ($logText -match 'e2_ready') { $ready = $true; break }
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'reader 未在期限內就緒；保留 stdout/stderr' }
  $readyLine = ($logText -split "`r?`n" | Where-Object { $_ -match 'e2_ready' } | Select-Object -Last 1)
  $readyLine | Set-Content -LiteralPath (Join-Path $outDir 'reader-ready-line.txt')
  if ($readyLine -notmatch [regex]::Escape([string]$fresh.Id) -or
      $readyLine -notmatch 'v1-e2-20261115-v2' -or $readyLine -notmatch 'fresh' -or
      $readyLine -notmatch [regex]::Escape($job.v2ManifestSha256)) { throw 'e2_ready 內容不符' }

  $origin = 'http://127.0.0.1:3161'
  $person = @{'x-e1-identity' = 'a'}
  function Save-JsonResponse([string]$uri, [hashtable]$headers, [string]$path, [string]$command) {
    "`nCommand: $command`nURI: $uri`nHeaders: x-e1-identity=a" | Add-Content -LiteralPath $actionsPath
    $response = Invoke-WebRequest -UseBasicParsing -Uri $uri -Headers $headers -TimeoutSec 5
    [System.IO.File]::WriteAllText((Join-Path $outDir $path), $response.Content, [System.Text.UTF8Encoding]::new($false))
    $response.Content | ConvertFrom-Json
  }
  $status = Save-JsonResponse "$origin/api/status" @{} 'http-status.json' 'GET /api/status'
  $search = Save-JsonResponse "$origin/api/search?q=e2packet" $person 'http-search.json' 'GET /api/search?q=e2packet'
  if ($status.snapshotId -ne $job.expectedSnapshotId -or $search.snapshotId -ne $job.expectedSnapshotId -or
      $search.total -ne 1 -or $search.hits[0].pageId -ne 'a-pdf') { throw 'fresh 版本或搜尋不符' }

  $pageUri = $origin + $search.hits[0].url
  $page = Save-JsonResponse $pageUri $person 'http-page.json' 'GET <search hit URL>'
  $listUri = $origin + $page.page.mediaUrl
  $list = Save-JsonResponse $listUri $person 'http-media-list.json' 'GET <page.page.mediaUrl>'
  if ($page.snapshotId -ne $job.expectedSnapshotId -or $list.snapshotId -ne $job.expectedSnapshotId -or
      $page.page.body -notlike '*e2packet identifies the revised deployment attachment.*' -or
      $list.media.Count -ne 1 -or $list.media[0].mediaId -ne 'pdf-checklist-v2') { throw '正文或附件版本不符' }

  $pdfUri = $origin + $list.media[0].url
  "`nCommand: GET <media URL> -OutFile readback.pdf`nURI: $pdfUri`nHeaders: x-e1-identity=a" | Add-Content -LiteralPath $actionsPath
  $pdfPath = Join-Path $outDir 'readback.pdf'
  Invoke-WebRequest -UseBasicParsing -Uri $pdfUri -Headers $person -TimeoutSec 5 -OutFile $pdfPath
  $digest = (Get-FileHash -LiteralPath $pdfPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $pdfBytes = (Get-Item -LiteralPath $pdfPath).Length
  if ($digest -ne '22b32411322dc3cfaed1e2ee15b4eb173c1708d2771c536f9a4a15478b366dae' -or $pdfBytes -ne 678) { throw 'fresh PDF 校驗不符' }
  $handoffClock.Stop()
  $result = [pscustomobject]@{startedAt = $startedAt.ToString('o'); endedAt = [DateTimeOffset]::Now.ToString('o'); pid = $fresh.Id;
    snapshotId = $status.snapshotId; pageId = $page.page.pageId; mediaId = $list.media[0].mediaId;
    pdfSha256 = $digest; pdfBytes = $pdfBytes; output = $outDir; elapsedMs = $handoffClock.ElapsedMilliseconds;
    firstAttemptFailed = $true; interventionCount = 1; helpRequested = $true;
    manualDecisions = @('Used an operator-curated execution script based only on runbook section 4.','Recorder correction supplied by parent agent after attempt 1 failed; no product or manual changes.') }
  $resultJson = $result | ConvertTo-Json -Depth 10
  Set-Content -LiteralPath (Join-Path $outDir 'result.json') -Value $resultJson -Encoding utf8
  $resultJson | Tee-Object -FilePath (Join-Path $outDir 'result.stdout.txt')
}
catch {
  $handoffClock.Stop()
  "STOP: $($_.Exception.Message)`nElapsedMs: $($handoffClock.ElapsedMilliseconds)`nfirstAttemptFailed=true`ninterventionCount=1`nHelp requested: no additional request" |
    Tee-Object -FilePath (Join-Path $outDir 'failure.txt')
  throw
}
finally {
  Stop-Transcript | Out-Null
}
