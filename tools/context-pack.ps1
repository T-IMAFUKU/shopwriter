# tools/context-pack.ps1  —  Backtick不使用・Windows PowerShell 5.x対応版
param(
  [int]$PreviewLines = 120,
  [string[]]$Pick = @(
    "package.json", "pnpm-lock.yaml", "tsconfig.json", "next.config.*",
    ".env*", "prisma/schema.prisma",
    "app/layout.tsx", "app/page.tsx", "middleware.ts",
    "lib/**", "components/**",
    "app/**/page.tsx", "app/**/route.ts", "app/**/loading.tsx", "app/**/error.tsx"
  )
)

# 出力ファイルは「実行ディレクトリ」直下に作成
$Out = Join-Path -Path (Get-Location) -ChildPath "context-pack.txt"

function AppendLine([string]$text) {
  Add-Content -Path $Out -Value $text -Encoding UTF8
}
function NewLine() {
  Add-Content -Path $Out -Value ([Environment]::NewLine) -Encoding UTF8
}

function Head([string]$relPath) {
  if (Test-Path -Path $relPath) {
    AppendLine ("---- file: {0}" -f $relPath)
    Get-Content -Path $relPath -TotalCount $PreviewLines | Out-File -FilePath $Out -Append -Encoding UTF8
    NewLine
  }
}

# 初期化
Remove-Item -Path $Out -ErrorAction SilentlyContinue
"### Repo Snapshot (date=$([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss zzz')))" | Out-File -FilePath $Out -Encoding UTF8
("node={0} pnpm={1}" -f ((node -v) 2>$null), ((pnpm -v) 2>$null)) | Out-File -FilePath $Out -Append -Encoding UTF8

# Tree（/A=ASCII, /F=ファイル含む）
NewLine
AppendLine "## Tree (depth=3)"
cmd.exe /c "tree /F /A" | Out-File -FilePath $Out -Append -Encoding UTF8

# 主要ファイルの先頭抜粋
NewLine
AppendLine ("## Key Files (top {0} lines each)" -f $PreviewLines)

# ルートからの相対パスを作るための基準
$root = (Get-Location).Path
Get-ChildItem -Recurse | ForEach-Object {
  if ($_.PSIsContainer) { return }
  $rel = $_.FullName.Substring($root.Length + 1) -replace "\\", "/"

  $match = $false
  foreach ($p in $Pick) {
    if ($rel -like $p) { $match = $true; break }
  }

  if ($match) { Head $rel }
}

Write-Host "Done -> $Out"
