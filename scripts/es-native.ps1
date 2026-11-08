param(
  [ValidateSet('setup','start','stop','status')][string]$Action = 'status',
  [ValidateSet('primary','dr')][string]$Instance = 'primary'
)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path $PSScriptRoot -Parent
$installation = Join-Path $workspace '.lab/tools/elasticsearch-8.17.0'
$labRoot = Join-Path $workspace '.lab/es-native'
$instanceRoot = Join-Path $labRoot $Instance
$port = if ($Instance -eq 'primary') { 19200 } else { 19300 }
$uri = "http://127.0.0.1:$port"
$pidFile = Join-Path $instanceRoot 'pid.json'
if ($Action -eq 'setup') {
  $archive = Join-Path $workspace '.lab/tools/elasticsearch-8.17.0-windows-x86_64.zip'
  $expectedHash = ((Get-Content ($archive + '.sha512') -Raw).Trim() -split '\s+')[0]
  $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA512).Hash
  if ($actualHash -ne $expectedHash) { throw 'Elasticsearch ZIP SHA512 mismatch' }
  if (-not (Test-Path -LiteralPath $installation)) { Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $workspace '.lab/tools') }
  foreach ($node in @('primary','dr')) {
    $nodeRoot = Join-Path $labRoot $node
    $configRoot = Join-Path $nodeRoot 'config'
    New-Item -ItemType Directory -Force $configRoot,(Join-Path $nodeRoot 'data'),(Join-Path $nodeRoot 'logs'),(Join-Path $labRoot 'snapshots') | Out-Null
    Copy-Item -Path (Join-Path $installation 'config/*') -Destination $configRoot -Recurse -Force
    $nodePort = if ($node -eq 'primary') { 19200 } else { 19300 }
    $yaml = @"
cluster.name: drlab-$node
node.name: drlab-$node
network.host: 127.0.0.1
http.port: $nodePort
transport.port: $($nodePort + 1)
discovery.type: single-node
xpack.security.enabled: false
xpack.ml.enabled: false
path.data: '$((Join-Path $nodeRoot 'data').Replace('\','/'))'
path.logs: '$((Join-Path $nodeRoot 'logs').Replace('\','/'))'
path.repo: ['$((Join-Path $labRoot 'snapshots').Replace('\','/'))']
"@
    [IO.File]::WriteAllText((Join-Path $configRoot 'elasticsearch.yml'), $yaml)
    [IO.File]::WriteAllText((Join-Path $configRoot 'jvm.options.d/lab.options'), "-Xms512m`n-Xmx512m`n")
  }
  Write-Output 'Verified archive and prepared two independent loopback-only ES nodes.'
  exit 0
}
if ($Action -eq 'start') {
  if (Test-Path -LiteralPath $pidFile) {
    $record = Get-Content $pidFile -Raw | ConvertFrom-Json
    if (Get-Process -Id $record.pid -ErrorAction SilentlyContinue) { throw 'Recorded node still running; use status first.' }
  }
  $priorConfig = $env:ES_PATH_CONF
  try {
    $env:ES_PATH_CONF = Join-Path $instanceRoot 'config'
    $launcher = Start-Process -FilePath (Join-Path $installation 'bin/elasticsearch.bat') -WorkingDirectory $installation -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $instanceRoot 'stdout.log') -RedirectStandardError (Join-Path $instanceRoot 'stderr.log')
  } finally { $env:ES_PATH_CONF = $priorConfig }
  Write-Output "Started $Instance launcher PID $($launcher.Id); readiness at $uri"
  exit 0
}
if ($Action -eq 'status') {
  $data = Invoke-RestMethod "$uri/_nodes/process" -TimeoutSec 5
  $node = $data.nodes.PSObject.Properties.Value | Select-Object -First 1
  if ($node.name -ne "drlab-$Instance") { throw 'Unexpected node identity' }
  @{ pid = $node.process.id; name = $node.name; uri = $uri } | ConvertTo-Json | Set-Content $pidFile
  Write-Output "$($node.name) ready; PID $($node.process.id)"
  exit 0
}
if ($Action -eq 'stop') {
  if (-not (Test-Path -LiteralPath $pidFile)) { throw 'Run status to verify node PID before stopping' }
  $record = Get-Content $pidFile -Raw | ConvertFrom-Json
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($record.pid)"
  $expectedJava = Join-Path $installation 'jdk/bin/java.exe'
  $live = Invoke-RestMethod "$uri/_nodes/process" -TimeoutSec 5
  $liveNode = $live.nodes.PSObject.Properties.Value | Select-Object -First 1
  if (-not $proc -or $proc.Name -ne 'java.exe' -or [IO.Path]::GetFullPath($proc.ExecutablePath) -ne [IO.Path]::GetFullPath($expectedJava) -or $liveNode.name -ne "drlab-$Instance" -or $liveNode.process.id -ne $record.pid) { throw 'PID identity does not match this workspace node; refusing to stop' }
  Stop-Process -Id $record.pid
  Write-Output "Stopped verified local $Instance node $($record.pid)"
}
