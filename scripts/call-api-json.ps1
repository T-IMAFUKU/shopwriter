# scripts/call-api-json.ps1
# 用途: API呼び出しの最小ラッパ + ID抽出（PowerShell 7）
# 仕様: 属性やValidateSetは使わない（ParserError回避のため最小構成）

function Call-ApiJson {
  param(
    [string] $Method,
    [string] $Uri,
    [hashtable] $Body
  )

  $json = $null
  if ($Body) { $json = ($Body | ConvertTo-Json -Depth 10) }

  $resp = Invoke-WebRequest -Method $Method -Uri $Uri `
    -Headers @{ "X-User-Id" = $script:uid } `
    -ContentType "application/json; charset=utf-8" `
    -Body $json -SkipHttpErrorCheck

  $obj = $null
  try { $obj = $resp.Content | ConvertFrom-Json } catch { }

  [pscustomobject]@{
    StatusCode = $resp.StatusCode
    Json       = $obj
    Raw        = $resp.Content
  }
}

function Get-ApiId {
  param($Json)
  if ($Json -and $Json.data -and $Json.data.id) { return $Json.data.id }
  if ($Json -and $Json.item -and $Json.item.id) { return $Json.item.id }
  return $null
}
