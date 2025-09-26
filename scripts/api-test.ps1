param(
  [string]$Base = "http://localhost:3000",
  [string]$DevUserId = "dev-user-1"
)
$ErrorActionPreference = "Stop"

# 前提：診断OFF＋DEVヘッダ明示
Remove-Item Env:DEBUG_TEMPLATE_API -ErrorAction SilentlyContinue
$env:DEBUG_TEMPLATE_API = ""
$env:ALLOW_DEV_HEADER = "1"

$headers = @{ "X-User-Id" = $DevUserId }

function Invoke-OrShowError {
  param([scriptblock]$Block)
  try { & $Block }
  catch {
    $resp = $_.Exception.Response
    if ($resp -and $resp.Content) {
      $reader = New-Object System.IO.StreamReader($resp.Content.ReadAsStream())
      [pscustomobject]@{ Code=[int]$resp.StatusCode; Body=$reader.ReadToEnd() }
    } else {
      [pscustomobject]@{ Code="(no response)"; Body=$_.Exception.Message }
    }
  }
}

# 1) POST → 正しく id を取り出す
$post = Invoke-OrShowError { Invoke-RestMethod -Method POST -Uri "$Base/api/templates" -Headers $headers `
  -ContentType "application/json" -Body (@{ title="triage"; body="triage" } | ConvertTo-Json) }
if ($post -is [string] -or $post.Code) { return $post }  # エラー早期返し

$id = $post.item.id
if (-not $id) { return "NG: id missing in response" }

# 2) OPTIONS で Allow 確認（PATCH/DELETE があるか）
$opt = Invoke-WebRequest -Method OPTIONS -Uri "$Base/api/templates/${id}" -Headers $headers -MaximumRedirection 0 -SkipHttpErrorCheck
$allow = $opt.Headers['Allow'] -join ','
if ($allow -notmatch 'PATCH' -or $allow -notmatch 'DELETE') { return "NG: Allow=[$allow]" }

# 3) PATCH
$patch = Invoke-OrShowError { Invoke-WebRequest -Method PATCH -Uri "$Base/api/templates/${id}" -Headers $headers `
  -ContentType "application/json" -Body (@{ title="triage-upd"; body="ok" } | ConvertTo-Json) }
# 4) DELETE
$del = Invoke-OrShowError { Invoke-WebRequest -Method DELETE -Uri "$Base/api/templates/${id}" -Headers $headers }

[pscustomobject]@{
  Id     = $id
  Allow  = $allow
  Patch  = if ($patch.StatusCode) {[int]$patch.StatusCode} elseif ($patch.Code) {$patch.Code} else {"?"}
  Delete = if ($del.StatusCode) {[int]$del.StatusCode} elseif ($del.Code) {$del.Code} else {"?"}
}
