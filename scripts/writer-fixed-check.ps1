Param(
  [Parameter()][string]$BASE = "http://localhost:3000",
  [Parameter()][string]$OutDir = "./_artifacts/writer-check"
)

# ==== 固定入力（prompt 必須） ====
$Prompt = @"
商品名=ShopWriter Premium
対象=EC担当者
トーン=カジュアル
キーワード=SEO, CVR, スピード
出力構成=H1 見出し / ## 要点(箇条書き3つ以上) / ## 本文 / ## CTA
出力形式=Markdown, 日本語
"@.Trim()

# API 実レスは { ok, output, meta }（text ではない）— probe結果より
# → バリアントは最小＆セクション補助の2通りのみ
$payloads = @(
  (@{ prompt=$Prompt; language="ja" } | ConvertTo-Json -Depth 5 -Compress),
  (@{ prompt=$Prompt; language="ja"; sections=@("要点","本文","CTA"); format="markdown" } | ConvertTo-Json -Depth 5 -Compress)
)

function Invoke-WriterPost {
  param(
    [Parameter(Mandatory=$true)][string]$Uri,
    [Parameter(Mandatory=$true)][string]$BodyJson,
    [Parameter()][string]$OutErrFile = $null
  )
  try {
    return Invoke-RestMethod -Uri $Uri -Method POST `
      -Headers @{ "Accept" = "application/json" } `
      -ContentType "application/json; charset=utf-8" `
      -Body $BodyJson -TimeoutSec 120
  } catch {
    try {
      $resp = $_.Exception.Response
      if ($resp -and $OutErrFile) {
        $rs = $resp.GetResponseStream()
        $sr = New-Object System.IO.StreamReader($rs)
        $errBody = $sr.ReadToEnd()
        $errBody | Set-Content -Encoding UTF8 $OutErrFile
      }
    } catch {}
    throw
  }
}

# ==== 準備 ====
$uri = "$BASE/api/writer"
$ts  = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force $OutDir | Out-Null
$outMd   = Join-Path $OutDir "writer_$ts.md"
$outLog  = Join-Path $OutDir "writer_$ts.json"
$outErr  = Join-Path $OutDir "error_$ts.json"
$latest  = Join-Path $OutDir "latest.md"

# ==== POST（自動リトライ：最小→補助） ====
$resp = $null
$usedVariant = $null
for ($i=0; $i -lt $payloads.Count; $i++) {
  try {
    if (Test-Path $outErr) { Remove-Item $outErr -Force }
    $resp = Invoke-WriterPost -Uri $uri -BodyJson $payloads[$i] -OutErrFile $outErr
    $usedVariant = $i + 1
    break
  } catch {
    if ($i -eq $payloads.Count - 1) {
      Write-Host "ERROR: POST $uri 失敗（全バリアントNG）" -ForegroundColor Red
      if (Test-Path $outErr) { Write-Host "---- エラー本文（保存先）：$outErr" -ForegroundColor Yellow }
      exit 2
    } else {
      Start-Sleep -Milliseconds 200
    }
  }
}

# ==== レスポンス取り出し（output or text を許容） ====
# 実レス：{ ok, output, meta } を優先
$markdown = $null
if ($resp.PSObject.Properties.Name -contains 'output') { $markdown = [string]$resp.output }
elseif ($resp.PSObject.Properties.Name -contains 'text') { $markdown = [string]$resp.text }

if ([string]::IsNullOrWhiteSpace($markdown)) {
  Write-Host "ERROR: 応答に output/text フィールドがありません" -ForegroundColor Red
  ($resp | ConvertTo-Json -Depth 6) | Set-Content -Encoding UTF8 $outErr
  exit 2
}

# 保存（UTF-8）
$markdown | Set-Content -Encoding UTF8 -NoNewline $outMd
$markdown | Set-Content -Encoding UTF8 -NoNewline $latest

# ==== 構造チェック（ラベル非依存で堅牢化） ====
# ・H1（# ）が >=1
# ・H2（## ）が >=2 以上（ラベル名は不問：UTF-8表示乱れ対策）
# ・箇条書き（- または *）が >=3
# ・全体長 >= 400
$lines = $markdown -split "(`r`n|`n)"
$h1Cnt     = ($lines | Where-Object { $_ -match '^\# ' }).Count
$h2Cnt     = ($lines | Where-Object { $_ -match '^\#\# ' }).Count
$bulletCnt = ($lines | Where-Object { $_ -match '^\s*[\-\*]\s+' }).Count
$lenOK     = ($markdown.Length -ge 400)
$h1OK      = ($h1Cnt -ge 1)
$h2OK      = ($h2Cnt -ge 2)
$bulOK     = ($bulletCnt -ge 3)

$sha256 = (Get-FileHash -Algorithm SHA256 $outMd).Hash

$struct = [PSCustomObject]@{
  timestamp     = $ts
  base          = $BASE
  uri           = $uri
  variant       = $usedVariant
  sha256        = $sha256
  length        = $markdown.Length
  h1_count      = $h1Cnt
  h2_count      = $h2Cnt
  bullets       = $bulletCnt
  length_ok     = $lenOK
  h1_ok         = $h1OK
  h2_ok         = $h2OK
  bullets_ok    = $bulOK
  PASS          = ($h1OK -and $h2OK -and $lenOK -and $bulOK)
}

$struct | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $outLog

# ==== 直近との差分（主要フラグ） ====
$prev = Get-ChildItem $OutDir -Filter "writer_*.json" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 1 -First 1
if ($prev) {
  $prevObj = Get-Content $prev.FullName -Raw | ConvertFrom-Json
  $diff = [PSCustomObject]@{
    h1_ok_changed      = ($struct.h1_ok      -ne $prevObj.h1_ok)
    h2_ok_changed      = ($struct.h2_ok      -ne $prevObj.h2_ok)
    bullets_ok_changed = ($struct.bullets_ok -ne $prevObj.bullets_ok)
    length_ok_changed  = ($struct.length_ok  -ne $prevObj.length_ok)
  }
}

# ==== 出力 ====
Write-Host "=== /api/writer Markdown 構造チェック ===" -ForegroundColor Cyan
Write-Host ("BASE        : {0}" -f $BASE)
Write-Host ("VARIANT     : {0}  (1:minimal, 2:with-sections)" -f $usedVariant)
Write-Host ("FILE        : {0}" -f $outMd)
Write-Host ("SHA256      : {0}" -f $sha256)
Write-Host ("LEN>=400    : {0} (length={1})" -f $struct.length_ok, $struct.length)
Write-Host ("H1>=1 / H2>=2 : {0}/{1} (H1={2}, H2={3})" -f $struct.h1_ok, $struct.h2_ok, $struct.h1_count, $struct.h2_count)
Write-Host ("Bullets>=3  : {0} (count={1})" -f $struct.bullets_ok,$struct.bullets)
if ($diff) {
  Write-Host ("[STRUCT DIFF] H1_OK:{0} H2_OK:{1} LEN_OK:{2} BUL_OK:{3}" -f `
    $diff.h1_ok_changed,$diff.h2_ok_changed,$diff.length_ok_changed,$diff.bullets_ok_changed)
}
if ($struct.PASS) {
  Write-Host "PASS: Markdown 構造は安定しています ✅" -ForegroundColor Green
  exit 0
} else {
  Write-Host "FAIL: 構造条件を満たしていません ❌" -ForegroundColor Red
  if (Test-Path $outErr) { Write-Host "※ 直近エラー本文: $outErr" -ForegroundColor Yellow }
  exit 2
}