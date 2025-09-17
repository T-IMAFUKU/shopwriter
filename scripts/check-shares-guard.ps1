# scripts/check-shares-guard.ps1
Param(
  [Parameter(Mandatory=$true)]
  [string]$ProdUrl,
  [int]$TimeoutSec = 20
)

$ErrorActionPreference = 'Stop'

function Invoke-StatusCode {
  param(
    [string]$Uri,
    [hashtable]$Headers = @{},
    [int]$TimeoutSec = 20
  )
  try {
    # Invoke-WebRequest は 4xx/5xx で例外を投げるため catch 内で StatusCode を拾う
    Invoke-WebRequest -Method GET -Uri $Uri -Headers $Headers -MaximumRedirection 0 -TimeoutSec $TimeoutSec | Out-Null
    return 200
  } catch {
    $resp = $_.Exception.Response
    if ($null -ne $resp -and $resp.StatusCode.value__) {
      return [int]$resp.StatusCode.value__
    } else {
      Write-Error ("NETWORK/OTHER ERROR: {0}" -f $_.Exception.Message)
      return -1
    }
  }
}

if (-not $ProdUrl -or -not ($ProdUrl -match '^https?://')) {
  Write-Error "ProdUrl が不正です。例: https://shopwriter-next.vercel.app"
  exit 2
}

$endpoint = ($ProdUrl.TrimEnd('/')) + "/api/shares?limit=1"

Write-Host "== Guard Check: GET $endpoint"

# 1) 未認証（ヘッダなし）→ 401 であること
$code1 = Invoke-StatusCode -Uri $endpoint -TimeoutSec $TimeoutSec
Write-Host ("[Check-1] No headers → Status: {0}" -f $code1)
$ok1 = ($code1 -eq 401)

# 2) 開発バイパスヘッダは本番で無効 → 401 であること
$headersDevBypass = @{ "X-Dev-Auth" = "dummy-any-value" }
$code2 = Invoke-StatusCode -Uri $endpoint -Headers $headersDevBypass -TimeoutSec $TimeoutSec
Write-Host ("[Check-2] With X-Dev-Auth → Status: {0}" -f $code2)
$ok2 = ($code2 -eq 401)

if ($ok1 -and $ok2) {
  Write-Host "PASS: /api/shares guard is enforced in production (401/401)."
  exit 0
} else {
  Write-Host "FAIL:"
  if (-not $ok1) { Write-Host " - 未認証で 401 ではありません（期待値=401, 実測=$code1）" }
  if (-not $ok2) { Write-Host " - X-Dev-Auth ヘッダ付きで 401 ではありません（期待値=401, 実測=$code2）" }
  exit 1
}
