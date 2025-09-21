# scripts/jp-exec.ps1（PS7用／ターミナルを閉じない）
param([Parameter(Position=0,ValueFromRemainingArguments=$true)][string[]]$Commands)

$ErrorActionPreference='Stop'
if(-not $Commands -or $Commands.Count -eq 0){ $Commands=@('pnpm typecheck','pnpm build') }

$Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$LogDir=Join-Path . 'logs'; New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$RunLog=Join-Path $LogDir "run-$Stamp.log"

function Run-Once([string]$Cmd){
  Write-Host ""; Write-Host "▶ 実行: $Cmd"
  $sw=[Diagnostics.Stopwatch]::StartNew()
  $outFile=Join-Path $LogDir ("{0}-{1}.out.txt" -f $Stamp, ($Cmd -replace '[\\/\s]','_'))
  $psi=[Diagnostics.ProcessStartInfo]::new()
  $psi.FileName='pwsh'; $psi.Arguments="-NoProfile -Command `"$Cmd`""
  $psi.RedirectStandardOutput=$true; $psi.RedirectStandardError=$true; $psi.UseShellExecute=$false
  $p=[Diagnostics.Process]::new(); $p.StartInfo=$psi; [void]$p.Start()
  $stdout=$p.StandardOutput.ReadToEnd(); $stderr=$p.StandardError.ReadToEnd(); $p.WaitForExit()
  $code=$p.ExitCode; $sw.Stop()

  @("===== CMD =====",$Cmd,"===== EXIT =====",$code,"===== STDOUT =====",$stdout,"===== STDERR =====",$stderr) |
    Set-Content -Path $outFile -Encoding UTF8
  @("[$Stamp] CMD: $Cmd","EXIT: $code","---- STDOUT(head) ----",($stdout -split "`r?`n"|Select-Object -First 20),
    "---- STDERR(head) ----",($stderr -split "`r?`n"|Select-Object -First 20),"=====") |
    Add-Content -Path $RunLog -Encoding UTF8

  if($code -eq 0){ Write-Host "✔ 成功 ($([math]::Round($sw.Elapsed.TotalSeconds,2)) 秒)"; }
  else{
    Write-Host "✖ 失敗 ($([math]::Round($sw.Elapsed.TotalSeconds,2)) 秒)"
    if($Cmd -like '*pnpm typecheck*'){ Write-Host "ヒント: TypeScript の型エラーです。該当行を修正してください。" }
    elseif($Cmd -like '*pnpm build*'){ Write-Host "ヒント: import パスや設定ファイルを確認してください。" }
    elseif($Cmd -like '*check-shares-guard.ps1*'){ Write-Host "ヒント: 本番ガードが 401/401 になっていません。" }
  }
  return [pscustomobject]@{cmd=$Cmd; code=$code; file=$outFile}
}

Write-Host ""; Write-Host "=== 実行開始（$Stamp）==="
$results=@(); foreach($c in $Commands){ $results+=,(Run-Once $c) }

Write-Host ""; Write-Host "=== 実行サマリ ==="
$fail=0
foreach($r in $results){
  $mark=($r.code -eq 0) ? 'PASS' : 'FAIL'
  Write-Host ("- {0} : {1}" -f $mark, $r.cmd)
  if($r.code -ne 0){ $fail++; Write-Host ("  詳細ログ: {0}" -f $r.file) }
}
Write-Host ""; Write-Host ("集約ログ: {0}" -f $RunLog)

if($fail -eq 0){
  Write-Host ""; Write-Host "=== 総合結果: すべて成功（安心して次へ進めます） ==="
  $global:LASTEXITCODE=0
}else{
  Write-Host ""; Write-Host "=== 総合結果: 失敗あり（『詳細ログ』を開き修正） ==="
  Write-Host "提出テンプレ：CONTEXT / 実行コマンド / エラー全文（詳細ログ） / スクショ"
  $global:LASTEXITCODE=1
}
