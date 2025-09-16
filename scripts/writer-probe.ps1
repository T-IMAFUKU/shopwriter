Param(
  [Parameter()][string]$BASE = "http://localhost:3000",
  [Parameter()][string]$OutDir = "./_artifacts/writer-probe"
)

New-Item -ItemType Directory -Force $OutDir | Out-Null
$uri = "$BASE/api/writer"
$ts  = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $OutDir "probe_$ts.txt"

# ---- POSTボディ（prompt必須）----
$Prompt = @"
商品名=ShopWriter Premium
対象=EC担当者
トーン=カジュアル
キーワード=SEO, CVR, スピード
出力構成=H1/##要点/##本文/##CTA
出力形式=Markdown/ja
"@.Trim()

$payloads = @(
  (@{ prompt=$Prompt; language="ja" } | ConvertTo-Json -Compress),
  (@{ prompt=$Prompt; language="ja"; sections=@("要点","本文","CTA"); format="markdown" } | ConvertTo-Json -Compress),
  (@{ input=@{ prompt=$Prompt; language="ja" }; options=@{ format="markdown"; locale="ja" } } | ConvertTo-Json -Compress)
)

function Invoke-Post-Raw {
  param([string]$Body)

  try {
    $resp = Invoke-WebRequest -Uri $uri -Method POST `
      -ContentType "application/json; charset=utf-8" `
      -Headers @{ "Accept"="application/json" } `
      -Body $Body -ErrorAction Stop

    $parsed = $null
    try { $parsed = $resp.Content | ConvertFrom-Json -ErrorAction Stop } catch { $parsed = $null }

    return [PSCustomObject]@{
      ok      = $true
      status  = $resp.StatusCode
      headers = $resp.Headers
      raw     = $resp.Content
      parsed  = $parsed
    }
  } catch {
    $status = -1
    $headers = $null
    $raw = $_.ToString()

    if ($_.Exception.Response) {
      $r = $_.Exception.Response
      $status = $r.StatusCode.value__
      $headers = $r.Headers
      $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
      $raw = $sr.ReadToEnd()
    }

    $parsed = $null
    try { $parsed = $raw | ConvertFrom-Json -ErrorAction Stop } catch { $parsed = $null }

    return [PSCustomObject]@{
      ok      = $false
      status  = $status
      headers = $headers
      raw     = $raw
      parsed  = $parsed
    }
  }
}

"`n=== /api/writer PROBE @ $uri ===" | Tee-Object -FilePath $out
for ($i=0; $i -lt $payloads.Count; $i++) {
  $v = $i + 1
  "--- VARIANT $v ---" | Tee-Object -FilePath $out -Append
  $payloads[$i] | Tee-Object -FilePath $out -Append

  $res = Invoke-Post-Raw -Body $payloads[$i]

  ("status : {0}" -f $res.status) | Tee-Object -FilePath $out -Append
  ("ok     : {0}" -f $res.ok) | Tee-Object -FilePath $out -Append

  "headers:" | Tee-Object -FilePath $out -Append
  if ($res.headers) {
    $res.headers.GetEnumerator() | ForEach-Object { "  {0}: {1}" -f $_.Key, ($_.Value -join ", ") } | Tee-Object -FilePath $out -Append
  }

  "raw:" | Tee-Object -FilePath $out -Append
  if ($res.raw) { $res.raw | Tee-Object -FilePath $out -Append }

  if ($res.parsed) {
    "parsed.keys:" | Tee-Object -FilePath $out -Append
    $res.parsed.PSObject.Properties.Name | ForEach-Object { "  - $_" } | Tee-Object -FilePath $out -Append
  }

  "" | Tee-Object -FilePath $out -Append
}
"=== END PROBE ===" | Tee-Object -FilePath $out -Append

Write-Host "OUTPUT: $out"