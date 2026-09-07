$ErrorActionPreference = 'Stop'
$demoProcessFile = Join-Path $PSScriptRoot 'runtime\processes.json'
if (!(Test-Path -LiteralPath $demoProcessFile)) { return }
$demoProcesses = Get-Content -LiteralPath $demoProcessFile -Raw | ConvertFrom-Json
foreach ($demoName in @('http','gateway','sunshine')) {
    $demoRecord = $demoProcesses.$demoName
    if (!$demoRecord) { continue }
    $demoProcess = Get-Process -Id $demoRecord.pid -ErrorAction SilentlyContinue
    if (!$demoProcess) { continue }
    $demoExpectedStart = [DateTimeOffset]::Parse($demoRecord.startedAt).UtcDateTime
    if ([Math]::Abs(($demoProcess.StartTime.ToUniversalTime() - $demoExpectedStart).TotalSeconds) -lt 5) {
        Stop-Process -Id $demoProcess.Id
        Write-Output "Stopped demo $demoName"
    } else { Write-Warning "Skipped reused PID for $demoName" }
}
