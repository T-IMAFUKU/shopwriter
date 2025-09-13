# scripts/writer-fixed-report.ps1
Param(
  [Parameter()][string]$OutDir = "./_artifacts/writer-check",
  [Parameter()][int]$HeadLines = 20,
  [Parameter()][int]$ErrLines  = 40
)

function Get-Newest($pattern) {
  if (!(Test-Path $OutDir)) { return $null }
  return Get-ChildItem $OutDir -Filter $pattern | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

$latestJson = Get-Newest "writer_*.json"
if (-not $latestJson) {
  Write-Host "REPORT: 直近の writer_*.json が見つかりません。先に writer-fixed-check.ps1 を実行してください。" -ForegroundColor Yellow
  exit 1
}

# タイムスタンプ抽出（ファイル名 writer_YYYYMMDD-HHMMSS.json）
$ts = ($latestJson.BaseName -replace '^writer_','')
$mdPath  = Join-Path $OutDir ("writer_{0}.md" -f $ts)
$errPath = Join-Path $OutDir ("error_{0}.json" -f $ts)

# JSON 読込
try {
  $struct = Get-Content $latestJson.FullName -Raw | ConvertFrom-Json
} catch {
  Write-Host "REPORT: JSONが壊れています：$($latestJson.FullName)" -ForegroundColor Red
  exit 2
}

# Markdown 取得（なければ空）
$mdHead = ""
if (Test-Path $mdPath) {
  $mdLines = Get-Content $mdPath
  $take = [Math]::Min($HeadLines, $mdLines.Count)
  $mdHead = ($mdLines | Select-Object -First $take | ForEach-Object { $_ }) -join "`r`n"
}

# エラー本文（あれば先頭だけ）
$errHead = ""
if (Test-Path $errPath) {
  $errLines = Get-Content $errPath
  $takeE = [Math]::Min($ErrLines, $errLines.Count)
  $errHead = ($errLines | Select-Object -First $takeE) -join "`r`n"
}

# ====== 提出用レポート ======
Write-Host "===== BEGIN /api/writer REPORT =====" -ForegroundColor Cyan
"{0,-14}: {1}" -f "BASE",        $struct.base
"{0,-14}: {1}" -f "URI",         $struct.uri
"{0,-14}: {1}" -f "VARIANT",     $struct.variant
"{0,-14}: {1}" -f "PASS",        $struct.PASS
"{0,-14}: {1}" -f "H1/要点/本文/CTA", ("{0}/{1}/{2}/{3}" -f $struct.h1,$struct.sec_youten,$struct.sec_honbun,$struct.sec_cta)
"{0,-14}: {1}" -f "LEN / OK",    ("{0} / {1}" -f $struct.length,$struct.length_ok)
"{0,-14}: {1}" -f "Bullets/OK",  ("{0} / {1}" -f $struct.bullets,$struct.bullets_ok)
"{0,-14}: {1}" -f "SHA256",      $struct.sha256
"{0,-14}: {1}" -f "JSON",        $latestJson.FullName
"{0,-14}: {1}" -f "MARKDOWN",    ($(if (Test-Path $mdPath) {$mdPath} else {"(not found)"}))
"{0,-14}: {1}" -f "ERROR JSON",  ($(if (Test-Path $errPath) {$errPath} else {"(none)"}))
Write-Host "----- MARKDOWN (head ${HeadLines} lines) -----"
Write-Host $mdHead
if ($errHead -ne "") {
  Write-Host "----- ERROR BODY (head ${ErrLines} lines) -----" -ForegroundColor Yellow
  Write-Host $errHead
}
Write-Host "====== END /api/writer REPORT ======" -ForegroundColor Cyan