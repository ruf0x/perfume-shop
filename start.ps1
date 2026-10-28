<#
.SYNOPSIS
  Starts the whole app: the API (port 8000) and the shop + admin (port 3000), each in its own window.

.EXAMPLE
  .\start.ps1             # start both
  .\start.ps1 -Private    # start both, then open the ADMIN in a private window (you must see the login page)
  .\start.ps1 -Reset      # also rebuild the demo database first (migrate:fresh --seed) - erases orders!
#>
param(
    [switch]$Private,
    [switch]$Reset
)

$root = $PSScriptRoot

# PHP: use the one on PATH, otherwise the one that comes with Laravel Herd.
$php = (Get-Command php -ErrorAction SilentlyContinue).Source
if (-not $php) { $php = Join-Path $env:USERPROFILE '.config\herd\bin\php85\php.exe' }
if (-not (Test-Path $php)) { Write-Host 'PHP not found. Install Laravel Herd or add php to PATH.' -ForegroundColor Red; exit 1 }

if ($Reset) {
    Write-Host 'Rebuilding the demo database...' -ForegroundColor Yellow
    Push-Location "$root\backend"; & $php artisan migrate:fresh --seed --force; Pop-Location
}

function Test-Port($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }

if (-not (Test-Port 8000)) {
    Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='API :8000'; cd '$root\backend'; & '$php' serve.php"
}
if (-not (Test-Port 3000)) {
    Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='Shop :3000'; cd '$root\frontend'; npm run dev -- --port 3000 --open false"
}

Write-Host 'Waiting for the servers...' -NoNewline
foreach ($i in 1..30) { if ((Test-Port 8000) -and (Test-Port 3000)) { break }; Start-Sleep -Seconds 1; Write-Host '.' -NoNewline }
Write-Host ''

if (-not ((Test-Port 8000) -and (Test-Port 3000))) {
    Write-Host 'A server did not start. Look at the two windows that opened for the error.' -ForegroundColor Red
    exit 1
}

$envFile = "$root\backend\.env"
$user = (Select-String -Path $envFile -Pattern '^ADMIN_USERNAME=(.*)$').Matches[0].Groups[1].Value

Write-Host ''
Write-Host '  Shop         http://localhost:3000' -ForegroundColor Green
Write-Host '  Admin        http://localhost:3000/admin        (login: ' -NoNewline; Write-Host "$user / ADMIN_PASSWORD from backend\.env)" -ForegroundColor Cyan
Write-Host '  API docs     http://localhost:8000/docs/api'
Write-Host '  Check auth   .\scripts\check-auth.ps1'
Write-Host ''

if ($Private) {
    $url = 'http://localhost:3000/admin'
    if (Get-Command msedge -ErrorAction SilentlyContinue) { Start-Process msedge "-inprivate $url" }
    elseif (Get-Command chrome -ErrorAction SilentlyContinue) { Start-Process chrome "--incognito $url" }
    else { Start-Process "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" "--incognito $url" }
}
