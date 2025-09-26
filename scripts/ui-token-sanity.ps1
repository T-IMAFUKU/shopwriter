# 保存先: scripts/ui-token-sanity.ps1
# 使い方:
#   1) ルートに移動してから:
#        pwsh -File .\scripts\ui-token-sanity.ps1
#      または:
#        .\scripts\ui-token-sanity.ps1
#   2) 0=PASS, 1=FAIL を返します

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Result {
  param(
    [string]$Name,
    [bool]$Pass,
    [string]$Hint = ""
  )
  $status = if ($Pass) { "PASS" } else { "FAIL" }
  $color  = if ($Pass) { "Green" } else { "Red" }
  Write-Host ("{0,-58} : {1}" -f $Name, $status) -ForegroundColor $color
  if (-not $Pass -and $Hint) {
    Write-Host ("  ↳ " + $Hint) -ForegroundColor Yellow
  }
}

# --- 1) ルート決定（貼り付け/ファイル実行のどちらでも動く） ---
$scriptDir = if ([string]::IsNullOrEmpty($PSScriptRoot)) { (Get-Location).Path } else { $PSScriptRoot }
$root = Split-Path -Parent $scriptDir

# --- 2) 対象ファイル ---
$globalsPath = Join-Path $root "app\globals.css"
$twConfig    = Join-Path $root "tailwind.config.ts"

$okGlobals = Test-Path -LiteralPath $globalsPath
$okTwconf  = Test-Path -LiteralPath $twConfig
Write-Result "exists: app/globals.css" $okGlobals "ファイルが無い場合はパス確認: $globalsPath"
Write-Result "exists: tailwind.config.ts" $okTwconf "ファイルが無い場合はパス確認: $twConfig"
if (-not ($okGlobals -and $okTwconf)) {
  Write-Host "`nSummary : FAIL (missing file). Exit 1" -ForegroundColor Red
  exit 1
}

# --- 3) 読込 ---
$css = Get-Content -LiteralPath $globalsPath -Encoding UTF8 -Raw
$tw  = Get-Content -LiteralPath $twConfig    -Encoding UTF8 -Raw

$failed = $false

# --- 4) 色トークン ---
$hasBgToken = $css -match '(?m)^\s*--background\s*:'
$hasFgToken = $css -match '(?m)^\s*--foreground\s*:'
Write-Result "globals.css: --background token defined" $hasBgToken "例: :root { --background: 0 0% 100%; }"
Write-Result "globals.css: --foreground token defined" $hasFgToken "例: :root { --foreground: 222.2 47.4% 11.2%; }"
if (-not ($hasBgToken -and $hasFgToken)) { $failed = $true }

# --- 5) UIトークン（radius/shadow/spacing） ---
$hasUiRadius = $css -match '(?m)^\s*--ui-radius-(sm|md|lg)\s*:'
$hasUiShadow = $css -match '(?m)^\s*--ui-shadow-(sm|md|lg)\s*:'
$hasUiSpace  = $css -match '(?m)^\s*--ui-space-[1-6]\s*:'
Write-Result "globals.css: UI tokens (radius/shadow/spacing)" ($hasUiRadius -and $hasUiShadow -and $hasUiSpace) "例: --ui-radius-md / --ui-shadow-md / --ui-space-3"
if (-not ($hasUiRadius -and $hasUiShadow -and $hasUiSpace)) { $failed = $true }

# --- 6) Tailwind 色マッピング（bg-background 等の裏付け） ---
$bgMap = $tw -match 'background["'']?\s*:\s*"hsl\(var\(--background\)\)"'
$fgMap = $tw -match 'foreground["'']?\s*:\s*"hsl\(var\(--foreground\)\)"'
Write-Result "tailwind.config.ts: colors.background -> hsl(var(--background))" $bgMap "theme.extend.colors.background を設定"
Write-Result "tailwind.config.ts: colors.foreground -> hsl(var(--foreground))" $fgMap "theme.extend.colors.foreground を設定"
if (-not ($bgMap -and $fgMap)) { $failed = $true }

# --- 7) base 適用（body に bg-background / text-foreground） ---
$hasBaseApply = ($css -match '@layer\s+base') -and ($css -match 'body\s*\{\s*@apply\s+bg-background\s+text-foreground;?\s*\}')
Write-Result "globals.css: @layer base applies bg-background & text-foreground" $hasBaseApply "例: @layer base { body { @apply bg-background text-foreground; } }"
if (-not $hasBaseApply) { $failed = $true }

# --- 8) コメント安全性（backtick と非ASCII） ---
$hasBacktick = $css.Contains('`')
$hasNonAscii = $false
foreach ($ch in $css.ToCharArray()) {
  if ([int][char]$ch -gt 127) { $hasNonAscii = $true; break }
}
Write-Result "globals.css: no backtick (`) in file" (-not $hasBacktick) "コメントから ` を削除してください"
Write-Result "globals.css: ASCII-only comments (no fullwidth punctuation)" (-not $hasNonAscii) "コメントは ASCII のみで記述してください"
if ($hasBacktick -or $hasNonAscii) { $failed = $true }

# --- 9) 結果 ---
if ($failed) {
  Write-Host "`nSummary : FAIL (fix hints above). Exit 1" -ForegroundColor Red
  exit 1
} else {
  Write-Host "`nSummary : PASS (safe to run pnpm dev)" -ForegroundColor Green
  exit 0
}
