$ErrorActionPreference = 'Stop'
$rows = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize)
$os = Get-CimInstance Win32_OperatingSystem
@{ processes = $rows; freeMemoryBytes = [long]$os.FreePhysicalMemory * 1024; freeDiskBytes = [long](Get-PSDrive C).Free } | ConvertTo-Json -Depth 4 -Compress
