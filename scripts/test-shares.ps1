# scripts/test-shares.ps1
# Windows PowerShell 5.x で動作（UTF-8固定で文字化け防止）
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

param(
  [string]$Base = "http://localhost:3000"
)

function Invoke-Api {
  param([string]$Uri)

  try {
    # 成功(2xx)
    $resp  = Invoke-WebRequest -Uri $Uri -Method GET -Headers @{Accept="application/json"} -TimeoutSec 30 -ErrorAction Stop
    $code  = $resp.StatusCode
    $body  = $resp.Content
  } catch {
    # 4xx/5xx でも本文・StatusCode を取得
    $response = $_.Exception.Response
    if ($response -ne $null) {
      $code = $response.StatusCode.value__
      $stream = $response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $body = $reader.ReadToEnd()
      $reader.Close()
      $stream.Close()
    } else {
      $code = -1
      $body = $_ | Out-String
    }
  }

  Write-Host "=== $Uri ===" -ForegroundColor Cyan
  Write-Host ("Status: {0}" -f $code) -ForegroundColor Yellow

  try {
    $obj = $body | ConvertFrom-Json
    $pretty = $obj | ConvertTo-Json -Depth 8
    Write-Output $pretty
  } catch {
    Write-Output $body
  }
  Write-Host ""
}

# 自動変数 $Error と競合しない名前を使用
$okUrl    = "$Base/api/shares"
$emptyUrl = "$Base/api/shares?empty=1"
$errUrl   = "$Base/api/shares?error=1"

Invoke-Api -Uri $okUrl
Invoke-Api -Uri $emptyUrl
Invoke-Api -Uri $errUrl
