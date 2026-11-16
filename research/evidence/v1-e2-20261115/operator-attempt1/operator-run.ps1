$ErrorActionPreference = 'Stop'
$e2 = 'scripts/v1-e2-20261115'
$lab = '.lab/v1-e2-20261115'
$outDir = "$lab/operator"
$startedAt = [DateTimeOffset]::Now
$handoffClock = [System.Diagnostics.Stopwatch]::StartNew()
$transcriptPath = Join-Path $outDir 'operator-transcript.txt'
Start-Transcript -LiteralPath $transcriptPath -Force | Out-Null
try {
  $job = Get-Content -Raw -LiteralPath 'evidence/v1-e2-20261115/operator-input.json' | ConvertFrom-Json
  if ($job.artifactVersion -ne 'v2' -or $job.cache -ne 'fresh' -or $job.port -ne 3161 -or
      $job.expectedSnapshotId -ne 'v1-e2-20261115-v2' -or $job.v2ManifestSha256 -cnotmatch '^[0-9a-f]{64}$') {
    throw '凍結輸入不符'
  }
  if ((Test-Path -LiteralPath "$lab/producer/fz1") -or (Test-Path -LiteralPath "$lab/producer/fz2") -or
      (Test-Path -LiteralPath "$lab/caches/fresh")) { throw '來源隔離或 fresh cache 前置狀態不符' }

  'Command: node scripts/v1-e2-20261115/install.mjs v2 fresh <manifest-sha256>' | Add-Content -LiteralPath $transcriptPath
  node "$e2/install.mjs" $job.artifactVersion $job.cache $job.v2ManifestSha256 2>&1 | Tee-Object -FilePath (Join-Path $outDir 'install.stdout-stderr.log')
  if ($LASTEXITCODE -ne 0) { throw 'fresh 安裝失敗' }

  $fresh = Start-Process -FilePath (Get-Command node).Source -ArgumentList "$e2/serve.mjs",'v2','3161','fresh' `
    -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $outDir 'reader.stdout.log') -RedirectStandardError (Join-Path $outDir 'reader.stderr.log')
  "Reader PID: $($fresh.Id)" | Tee-Object -FilePath (Join-Path $outDir 'reader.pid.txt')

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
  'GET /api/status' | Add-Content -LiteralPath $transcriptPath
  $status = Invoke-RestMethod -Uri "$origin/api/status" -TimeoutSec 5
  $status | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $outDir 'http-status.json') -Encoding utf8
  'GET /api/search?q=e2packet (x-e1-identity: a)' | Add-Content -LiteralPath $transcriptPath
  $search = Invoke-RestMethod -Uri "$origin/api/search?q=e2packet" -Headers $person -TimeoutSec 5
  $search | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $outDir 'http-search.json') -Encoding utf8
  if ($status.snapshotId -ne $job.expectedSnapshotId -or $search.snapshotId -ne $job.expectedSnapshotId -or
      $search.total -ne 1 -or $search.hits[0].pageId -ne 'a-pdf') { throw 'fresh 版本或搜尋不符' }

  'GET <search hit URL> (x-e1-identity: a)' | Add-Content -LiteralPath $transcriptPath
  $page = Invoke-RestMethod -Uri ($origin + $search.hits[0].url) -Headers $person -TimeoutSec 5
  $page | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $outDir 'http-page.json') -Encoding utf8
  'GET <page.page.mediaUrl> (x-e1-identity: a)' | Add-Content -LiteralPath $transcriptPath
  $list = Invoke-RestMethod -Uri ($origin + $page.page.mediaUrl) -Headers $person -TimeoutSec 5
  $list | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $outDir 'http-media-list.json') -Encoding utf8
  if ($page.snapshotId -ne $job.expectedSnapshotId -or $list.snapshotId -ne $job.expectedSnapshotId -or
      $page.page.body -notlike '*e2packet identifies the revised deployment attachment.*' -or
      $list.media.Count -ne 1 -or $list.media[0].mediaId -ne 'pdf-checklist-v2') { throw '正文或附件版本不符' }

  'GET <media URL> (x-e1-identity: a), save raw PDF bytes' | Add-Content -LiteralPath $transcriptPath
  $pdf = "$outDir/readback.pdf"
  Invoke-WebRequest -UseBasicParsing -Uri ($origin + $list.media[0].url) -Headers $person -TimeoutSec 5 -OutFile $pdf
  $digest = (Get-FileHash -LiteralPath $pdf -Algorithm SHA256).Hash.ToLowerInvariant()
  $pdfBytes = (Get-Item -LiteralPath $pdf).Length
  if ($digest -ne '22b32411322dc3cfaed1e2ee15b4eb173c1708d2771c536f9a4a15478b366dae' -or $pdfBytes -ne 678) { throw 'fresh PDF 校驗不符' }
  $handoffClock.Stop()
  [pscustomobject]@{startedAt = $startedAt.ToString('o'); endedAt = [DateTimeOffset]::Now.ToString('o'); pid = $fresh.Id;
    snapshotId = $status.snapshotId; pageId = $page.page.pageId; mediaId = $list.media[0].mediaId;
    pdfSha256 = $digest; pdfBytes = $pdfBytes; output = $outDir;
    elapsedMs = $handoffClock.ElapsedMilliseconds; helpRequested = $false; manualDecisions = @('Used the runbook command sequence as an operator script; no product or manual edits.','No help requested.') } |
    Tee-Object -FilePath (Join-Path $outDir 'result.json') | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $outDir 'result.json') -Encoding utf8
  Get-Content -Raw -LiteralPath (Join-Path $outDir 'result.json')
}
catch {
  $handoffClock.Stop()
  "STOP: $($_.Exception.Message)`nElapsedMs: $($handoffClock.ElapsedMilliseconds)`nHelp requested: no" |
    Tee-Object -FilePath (Join-Path $outDir 'failure.txt')
  throw
}
finally {
  Stop-Transcript | Out-Null
}
