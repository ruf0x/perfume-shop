<#
.SYNOPSIS
  Zips the Laravel API for upload to the server.
  Only files that git knows about are packaged (tracked, or new and not ignored), so .env, vendor,
  node_modules, logs and uploaded photos can never end up in the zip.

.EXAMPLE
  .\deploy\package-backend.ps1               # code only: run "composer install" on the server
  .\deploy\package-backend.ps1 -WithVendor   # also includes vendor\ (production packages): no Composer needed on the server
#>
param([switch]$WithVendor)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $PSScriptRoot 'out'
$stage = Join-Path $env:TEMP ('perfume-backend-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $out, $stage | Out-Null

# 1) The file list: whatever git would track, minus things the server does not need.
Push-Location $root
try { $files = git -c core.quotepath=off ls-files --cached --others --exclude-standard -- backend } finally { Pop-Location }
if (-not $files) { throw 'git returned no files. Is this folder a git repository?' }

$skip = '^backend/(tests/|docs/|phpunit\.xml$|serve\.php$|bootstrap/cache/.+\.php$)'
$count = 0
foreach ($f in $files) {
    if ($f -match $skip) { continue }
    $source = Join-Path $root $f
    if (-not (Test-Path $source -PathType Leaf)) { continue }   # deleted but not committed yet
    $target = Join-Path $stage ($f.Substring('backend/'.Length))
    New-Item -ItemType Directory -Force (Split-Path $target -Parent) | Out-Null
    Copy-Item $source $target -Force
    $count++
}
foreach ($d in 'bootstrap\cache', 'storage\logs', 'storage\framework\cache\data', 'storage\framework\sessions', 'storage\framework\views', 'storage\app\public') {
    New-Item -ItemType Directory -Force (Join-Path $stage $d) | Out-Null   # Laravel needs these folders (writable)
}

# 2) Optionally install the production packages inside the staging copy (your dev vendor\ is untouched).
if ($WithVendor) {
    $php = (Get-Command php -ErrorAction SilentlyContinue).Source
    if (-not $php) { $php = Join-Path $env:USERPROFILE '.config\herd\bin\php85\php.exe' }
    $composer = (Get-Command composer -ErrorAction SilentlyContinue).Source
    Push-Location $stage
    try {
        if ($composer) { & $composer install --no-dev --optimize-autoloader --no-interaction }
        else { & $php (Join-Path $env:USERPROFILE '.config\herd\bin\composer.phar') install --no-dev --optimize-autoloader --no-interaction }
        if ($LASTEXITCODE) { throw 'composer install failed' }
    } finally { Pop-Location }
}

# 3) Zip (dotfiles such as .env.example and public\.htaccess are included by the wildcard).
$zip = Join-Path $out ('backend-{0}{1}.zip' -f (Get-Date -Format 'yyyy-MM-dd-HHmm'), $(if ($WithVendor) { '-with-vendor' } else { '' }))
. (Join-Path $PSScriptRoot 'zip-helper.ps1')
New-LinuxZip -SourceDir $stage -ZipPath $zip
Remove-Item $stage -Recurse -Force

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host ''
Write-Host "Backend packaged: $zip  ($size MB, $count source files)" -ForegroundColor Green
if (-not $WithVendor) { Write-Host '  No vendor\ inside: run "composer install --no-dev -o" on the server (deploy\DEPLOY.md, step 6).' }
