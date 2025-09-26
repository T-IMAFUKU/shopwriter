param(
  [string]$SchemaPath = "prisma\schema.prisma"
)

if (-not (Test-Path $SchemaPath)) {
  Write-Error "schema.prisma が見つかりません: $SchemaPath"
  exit 1
}

# 既に Template モデルがあるかチェック
$content = Get-Content $SchemaPath -Raw
if ($content -match "model\s+Template\s*\{") {
  Write-Host "Template モデルは既に存在します（追記スキップ）"
} else {
  $model = @"
  
/// === Template: ユーザーのテンプレ文面を保存 ===
/// Note: userId は User.id（String想定）に外部キーで紐付け
model Template {
  id        String   @id @default(cuid())
  title     String   @db.VarChar(255)
  body      String   @db.Text
  userId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // リレーション（User モデルが String id を想定）
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId], map: "idx_template_user_id")
}
"@

  Add-Content -Path $SchemaPath -Value $model -Encoding UTF8
  Write-Host "Template モデルを schema.prisma の末尾へ追記しました。"
}

# prisma format
pnpm dlx prisma format | Out-Host