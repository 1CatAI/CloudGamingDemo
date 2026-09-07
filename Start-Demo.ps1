param([ValidateSet('auto','nvidia','amd')][string]$Encoder = 'auto')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if ($Encoder -eq 'auto') {
    $demoAdapters = @(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name)
    if ($demoAdapters -match 'NVIDIA') { $Encoder = 'nvidia' }
    elseif ($demoAdapters -match 'AMD|Radeon') { $Encoder = 'amd' }
    else { throw 'No supported NVIDIA/AMD GPU detected. Specify -Encoder after checking the installed driver.' }
}
$demoLocalPath = Join-Path $PSScriptRoot 'local.json'
$demoProcessPath = Join-Path $PSScriptRoot 'runtime\processes.json'
if ((Test-Path -LiteralPath $demoLocalPath) -and (Test-Path -LiteralPath $demoProcessPath)) {
    $demoExisting = Get-Content -LiteralPath $demoLocalPath -Raw | ConvertFrom-Json
    $demoRequested = if ($Encoder -eq 'nvidia') { 'nvenc' } else { 'amdvce' }
    if ($demoExisting.encoder -ne $demoRequested) {
        $demoRecords = Get-Content -LiteralPath $demoProcessPath -Raw | ConvertFrom-Json
        foreach ($demoRecord in $demoRecords.PSObject.Properties.Value) {
            $demoProcess = Get-Process -Id $demoRecord.pid -ErrorAction SilentlyContinue
            if ($demoProcess -and [Math]::Abs(($demoProcess.StartTime.ToUniversalTime() - [DateTimeOffset]::Parse($demoRecord.startedAt).UtcDateTime).TotalSeconds) -lt 5) {
                throw 'Stop-Demo.ps1 must be run before switching NVIDIA/AMD encoders.'
            }
        }
    }
}
& node scripts\prepare.mjs $Encoder
if ($LASTEXITCODE -ne 0) { throw 'Preparation failed.' }
& node scripts\bootstrap.mjs
if ($LASTEXITCODE -ne 0) { throw 'Startup failed; see logs.' }
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { Write-Output "Phone URL: http://$($_.IPAddress):8080" }
