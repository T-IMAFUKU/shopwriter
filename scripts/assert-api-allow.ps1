[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Base,   # 例: https://shopwriter-next.vercel.app
  [Parameter(Mandatory=$true)][string]$Path,   # 例: /api/templates/<id>
  [string[]]$Expect = @("GET","PATCH","DELETE")
)

function Invoke-RequestReturnAllow {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)][ValidateSet('OPTIONS','GET','POST','PATCH','DELETE','HEAD')][string]$Method,
    [Parameter(Mandatory=$true)][string]$Uri
  )
  try {
    $resp = Invoke-WebRequest -Method $Method -Uri $Uri -MaximumRedirection 0 -ErrorAction Stop
    $allow  = $resp.Headers["Allow"]
    $status = [int]$resp.StatusCode
    return [pscustomobject]@{ Allow=$allow; Status=$status }
  } catch {
    $r = $_.Exception.Response
    $allow = $null; $status = -1
    if ($r) {
      try { $allow = $r.Headers["Allow"] } catch {}
      try { $status = [int]$r.StatusCode } catch {}
    }
    return [pscustomobject]@{ Allow=$allow; Status=$status }
  }
}

$uri = "$Base$Path"
Write-Host "Target: $uri"

# Allow を拾う（OPTIONS → PATCH → DELETEの順）
$res = Invoke-RequestReturnAllow -Method OPTIONS -Uri $uri
if (-not $res.Allow) { $res = Invoke-RequestReturnAllow -Method PATCH  -Uri $uri }
if (-not $res.Allow) { $res = Invoke-RequestReturnAllow -Method DELETE -Uri $uri }

if (-not $res.Allow) {
  Write-Host "Status: $($res.Status)"
  Write-Host "Allow : (none)"
  Write-Host "NG: Allow ヘッダを取得できませんでした → $uri" -ForegroundColor Red
  exit 2
}

$allow   = $res.Allow
$methods = ($allow -split ",") | ForEach-Object { $_.Trim().ToUpper() } | Sort-Object -Unique
$missing = @()
foreach ($m in $Expect) { if ($methods -notcontains $m.ToUpper()) { $missing += $m.ToUpper() } }

Write-Host "Status: $($res.Status)"
Write-Host "Allow : $allow"

if ($missing.Count -gt 0) {
  Write-Host ("NG: 期待メソッドが不足 → {0}" -f ($missing -join ",")) -ForegroundColor Red
  exit 1
} else {
  Write-Host "OK: 期待メソッドを全て許可" -ForegroundColor Green
  exit 0
}