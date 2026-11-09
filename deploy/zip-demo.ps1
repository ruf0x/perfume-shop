<#
  Zips the built demo site (frontend/dist-demo) into deploy/out/demo-site-<date>.zip, ready to unzip on any static host.
  Build it first:  cd frontend; npm run build:demo
#>
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\zip-helper.ps1"

$site = Join-Path $PSScriptRoot '..\frontend\dist-demo'
if (-not (Test-Path (Join-Path $site 'index.html'))) { throw 'Run "npm run build:demo" in frontend/ first.' }

$out = Join-Path $PSScriptRoot 'out'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$zip = Join-Path $out ('demo-site-{0}.zip' -f (Get-Date -Format 'yyyy-MM-dd-HHmm'))
New-LinuxZip -SourceDir $site -ZipPath $zip
Write-Host "Demo site: $zip ($([math]::Round((Get-Item $zip).Length / 1MB, 1)) MB)"
