param([switch]$Elevated)
$ErrorActionPreference = 'Stop'
$demoRoot = Split-Path -Parent $PSScriptRoot
$demoResult = Join-Path $demoRoot 'runtime\host-install-result.json'
$demoIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$demoPrincipal = New-Object Security.Principal.WindowsPrincipal($demoIdentity)
if (!$demoPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    if ($Elevated) { throw 'Administrator privileges were not granted.' }
    $demoArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Elevated'
    $demoElevation = Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList $demoArgs -Wait -PassThru
    if (Test-Path -LiteralPath $demoResult) { Get-Content -LiteralPath $demoResult }
    if ($demoElevation.ExitCode -ne 0) { throw 'Driver/firewall setup failed or was cancelled.' }
    return
}
try {
    $demoInstaller = Join-Path $demoRoot 'downloads\ViGEmBus.exe'
    $demoHash = (Get-FileHash -LiteralPath $demoInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($demoHash -ne '89220a7865076b342892f98865f3499fb7c4cfd673159e89d352c360fd014c6a') { throw 'Unexpected driver installer hash.' }
    $demoSignature = Get-AuthenticodeSignature -LiteralPath $demoInstaller
    if ($demoSignature.Status -ne 'Valid' -or $demoSignature.SignerCertificate.Subject -notmatch 'Nefarius Software Solutions') { throw 'Driver signature validation failed.' }
    $demoExit = 0
    if (!(Test-Path -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\ViGEmBus')) {
        $demoInstall = Start-Process -FilePath $demoInstaller -ArgumentList @('/exenoui','/qn','/norestart','/L*v', ('"' + (Join-Path $demoRoot 'logs\vigembus-install.log') + '"')) -WindowStyle Hidden -Wait -PassThru
        $demoExit = $demoInstall.ExitCode
        if ($demoExit -notin @(0,3010,1641)) { throw "Driver installer exit code: $demoExit" }
    }
    $demoNode = (Get-Command node.exe).Source
    $demoStreamer = Join-Path $demoRoot 'runtime\moonlight\package\streamer.exe'
    if (!(Get-NetFirewallRule -Name 'BeamNGDemo-HTTP' -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name 'BeamNGDemo-HTTP' -DisplayName 'BeamNG LAN Demo - HTTP' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -Program $demoNode -RemoteAddress LocalSubnet -Profile Any | Out-Null
    }
    if (!(Get-NetFirewallRule -Name 'BeamNGDemo-WebRTC' -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name 'BeamNGDemo-WebRTC' -DisplayName 'BeamNG LAN Demo - WebRTC' -Direction Inbound -Action Allow -Protocol UDP -LocalPort '40000-40010' -Program $demoStreamer -RemoteAddress LocalSubnet -Profile Any | Out-Null
    }
    $demoDriver = Get-CimInstance Win32_SystemDriver -Filter "Name='ViGEmBus'" | Select-Object Name,State,StartMode
    [pscustomobject]@{ok=$true;driver=$demoDriver;installerExitCode=$demoExit;rebootRequested=($demoExit -in @(3010,1641));firewall='TCP 8080 and UDP 40000-40010, LocalSubnet only'} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $demoResult -Encoding UTF8
} catch {
    [pscustomobject]@{ok=$false;error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $demoResult -Encoding UTF8
    exit 1
}
