$ErrorActionPreference = 'Stop'
$demoRoot = Split-Path -Parent $PSScriptRoot
$demoDownloads = Join-Path $demoRoot 'downloads'
New-Item -ItemType Directory -Force -Path $demoDownloads | Out-Null
$demoAssets = @(
    @{Name='sunshine.zip'; Url='https://github.com/LizardByte/Sunshine/releases/download/v2026.516.143833/Sunshine-Windows-AMD64-portable.zip'; Sha='0a3af3dde43b8f2c94ffe04b850ad736d6e1be2b75906779d7094a5ad9d4783b'},
    @{Name='moonlight-web.zip'; Url='https://github.com/MrCreativ3001/moonlight-web-stream/releases/download/v2.10.0/moonlight-web-x86_64-pc-windows-gnu.zip'; Sha='1dc3019952c610fbd7deb76dc84e3c4c6f26458ebb44823ea1f02ad883a36da9'},
    @{Name='moonlight-web-source.zip'; Url='https://github.com/MrCreativ3001/moonlight-web-stream/archive/refs/tags/v2.10.0.zip'; Sha='a70673c13bc9ceb5ec61aa02078929e749212acfab8d92db1a37dbfdc777d8ec'},
    @{Name='ViGEmBus.exe'; Url='https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/ViGEmBus_1.22.0_x64_x86_arm64.exe'; Sha='89220a7865076b342892f98865f3499fb7c4cfd673159e89d352c360fd014c6a'}
)
$demoJobs = @()
foreach ($demoAsset in $demoAssets) {
    $demoTarget = Join-Path $demoDownloads $demoAsset.Name
    if ((Test-Path -LiteralPath $demoTarget) -and $demoAsset.Sha) {
        if ((Get-FileHash -LiteralPath $demoTarget -Algorithm SHA256).Hash.ToLowerInvariant() -eq $demoAsset.Sha) { continue }
    }
    $demoProcess = Start-Process -FilePath 'curl.exe' -ArgumentList @('-fL','--silent','--show-error','--retry','2','--connect-timeout','15','--max-time','1200','-C','-', $demoAsset.Url,'-o',$demoTarget) -WindowStyle Hidden -PassThru
    $demoJobs += @{Process=$demoProcess; Asset=$demoAsset; Target=$demoTarget}
}
foreach ($demoJob in $demoJobs) {
    $demoJob.Process.WaitForExit()
    $demoJob.Process.Refresh()
    if ($demoJob.Process.ExitCode -ne 0) { throw "Download failed: $($demoJob.Asset.Name)" }
    $demoAsset = $demoJob.Asset
    $demoTarget = $demoJob.Target
    $demoHash = (Get-FileHash -LiteralPath $demoTarget -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($demoAsset.Sha -and $demoHash -ne $demoAsset.Sha) { throw "Checksum mismatch: $($demoAsset.Name)" }
    Write-Output "$($demoAsset.Name): $demoHash"
}
