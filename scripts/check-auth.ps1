<#
.SYNOPSIS
  Proves the admin protection works. Run it with the API running (see start.ps1).
  Sends real requests and prints a PASS / FAIL table.
#>
param(
    [string]$Api = 'http://localhost:8000',
    [string]$Frontend = 'http://localhost:3000'
)

$envFile = Join-Path $PSScriptRoot '..\backend\.env'
$username = (Select-String -Path $envFile -Pattern '^ADMIN_USERNAME=(.*)$').Matches[0].Groups[1].Value
$password = (Select-String -Path $envFile -Pattern '^ADMIN_PASSWORD=(.*)$').Matches[0].Groups[1].Value

function Send($method, $path, $session = $null, $headers = @{}, $body = $null) {
    $p = @{ Uri = "$Api$path"; Method = $method; UseBasicParsing = $true; Headers = ($headers + @{ Accept = 'application/json' }) }
    if ($session) { $p.WebSession = $session }
    if ($body) { $p.Body = ($body | ConvertTo-Json); $p.ContentType = 'application/json' }
    try { return [int](Invoke-WebRequest @p).StatusCode }
    catch { if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode } else { throw "API unreachable at $Api. Start it with .\start.ps1" } }
}

$rows = @()
function Check($name, $expected, $got) {
    $script:rows += [pscustomobject]@{ Test = $name; Expected = $expected; Got = $got; Result = $(if ($got -eq $expected) { 'PASS' } else { 'FAIL' }) }
}

# 1. A visitor who is not signed in must be refused everywhere in /admin.
foreach ($path in '/api/admin/me', '/api/admin/orders', '/api/admin/products', '/api/admin/stock', '/api/admin/customers', '/api/admin/settings', '/api/admin/users', '/api/admin/dashboard') {
    Check "Not signed in: GET $path" 401 (Send GET $path)
}
Check 'Not signed in: cannot confirm an order' 401 (Send POST '/api/admin/orders/1/transition' $null @{} @{ action = 'confirm' })
Check 'Fake bearer token is refused' 401 (Send GET '/api/admin/orders' $null @{ Authorization = 'Bearer 1|not-a-real-token' })

# 2. Login needs the CSRF handshake, a real password, and an allowed origin.
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$origin = @{ Origin = $Frontend; Referer = "$Frontend/" }
Send GET '/sanctum/csrf-cookie' $s $origin | Out-Null
function Xsrf { [uri]::UnescapeDataString((@($s.Cookies.GetCookies($Api)) | Where-Object Name -eq 'XSRF-TOKEN').Value) }

Check 'Login without the CSRF token is refused' 419 (Send POST '/api/admin/login' $s $origin @{ username = $username; password = $password })
$h = $origin + @{ 'X-XSRF-TOKEN' = (Xsrf) }
Check 'Login with a wrong password is refused' 422 (Send POST '/api/admin/login' $s $h @{ username = $username; password = 'definitely-wrong' })
Check 'Login with the right password works' 200 (Send POST '/api/admin/login' $s $h @{ username = $username; password = $password })

# 3. Signed in: allowed. Then sign out: refused again.
$h = $origin + @{ 'X-XSRF-TOKEN' = (Xsrf) }
Check 'Signed in: GET /api/admin/me' 200 (Send GET '/api/admin/me' $s $origin)
Check 'Signed in (owner): GET /api/admin/settings' 200 (Send GET '/api/admin/settings' $s $origin)
Check 'Sign out works' 204 (Send POST '/api/admin/logout' $s $h)
Check 'After sign out: GET /api/admin/me' 401 (Send GET '/api/admin/me' $s $origin)

$rows | Format-Table -AutoSize
$failed = @($rows | Where-Object Result -eq 'FAIL').Count
if ($failed -eq 0) {
    Write-Host "All $($rows.Count) checks passed: the admin is protected." -ForegroundColor Green
    Write-Host "Now see it in the browser: open a PRIVATE window on $Frontend/admin -> you must get the login form." -ForegroundColor Cyan
    Write-Host "(In your normal window you stay signed in until you close the browser or click 'Se deconnecter'.)"
} else {
    Write-Host "$failed check(s) FAILED." -ForegroundColor Red
    exit 1
}
