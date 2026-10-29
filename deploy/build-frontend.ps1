<#
.SYNOPSIS
  Builds the shop + admin for production and zips it, ready to upload to public_html/.

.EXAMPLE
  .\deploy\build-frontend.ps1 -ApiUrl https://api.monshop.dz
  -> deploy\out\frontend-2026-10-30.zip
#>
param(
    [Parameter(Mandatory = $true)][string]$ApiUrl,
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$ApiUrl = $ApiUrl.TrimEnd('/')
if ($ApiUrl -notmatch '^https://[a-z0-9.-]+$') { throw "ApiUrl must look like https://api.yourdomain.dz (https, no path, no trailing slash). Got: $ApiUrl" }

$root = Split-Path $PSScriptRoot -Parent
$frontend = Join-Path $root 'frontend'
$out = Join-Path $PSScriptRoot 'out'
New-Item -ItemType Directory -Force $out | Out-Null

Push-Location $frontend
try {
    if (-not $SkipInstall) { npm ci; if ($LASTEXITCODE) { throw 'npm ci failed' } }
    $env:VITE_API_URL = $ApiUrl
    npm run build
    if ($LASTEXITCODE) { throw 'npm run build failed' }
} finally { Pop-Location }

$dist = Join-Path $frontend 'dist'
foreach ($f in 'index.html', '.htaccess') { if (-not (Test-Path (Join-Path $dist $f))) { throw "dist\$f is missing" } }

# Guard: the production build must never point at a local server.
$bad = Get-ChildItem "$dist\assets\*.js" | Select-String -Pattern 'localhost:8000' -List
if ($bad) { throw "The build still contains http://localhost:8000 ($($bad.Path)). Is VITE_API_URL set?" }
$good = Get-ChildItem "$dist\assets\*.js" | Select-String -SimpleMatch $ApiUrl -List
if (-not $good) { throw "The build does not contain $ApiUrl." }

$zip = Join-Path $out ("frontend-{0}.zip" -f (Get-Date -Format 'yyyy-MM-dd-HHmm'))
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path "$dist\*" -DestinationPath $zip -Force   # the wildcard already includes .htaccess

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host ''
Write-Host "Built for $ApiUrl" -ForegroundColor Green
Write-Host "  $zip  ($size MB)"
Write-Host '  Upload it in cPanel > Gestionnaire de fichiers > public_html > Extraire (see deploy\DEPLOY.md, step 8).'
