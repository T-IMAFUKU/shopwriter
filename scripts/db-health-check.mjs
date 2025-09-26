// scripts/db-health-check.mjs
// 目的: デプロイ前/手動で DB の健全性を検査し、壊れた行の再混入を即検知して止める。
// - エラー条件: id が NULL / '' / 長さ<15、title が NULL / 空白のみ
// - 追加: Share相当テーブル名を information_schema から自動特定（"Share"/"shares"揺れ対策）
// 使い方:
//   node scripts/db-health-check.mjs          # 画面向け出力（人間が読む）
//   node scripts/db-health-check.mjs --ci     # CI向け出力（短縮）
// 返り値: 問題なし=exit 0 / 問題あり=exit 1

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const MIN_ID_LEN = 15;
const CI = process.argv.includes('--ci');

const esc = (s) => String(s).replace(/"/g, '""');
const qstr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

async function resolveShareTable() {
  const rows = await prisma.$queryRawUnsafe(`
    WITH c AS (
      SELECT
        table_schema, table_name,
        COUNT(*) FILTER (WHERE column_name='id')    AS has_id,
        COUNT(*) FILTER (WHERE column_name='title') AS has_title
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
        AND table_name ILIKE '%share%'
      GROUP BY 1,2
    )
    SELECT table_schema, table_name
    FROM c
    WHERE has_id > 0 AND has_title > 0
    ORDER BY
      (table_name='Share') DESC,
      (table_name='shares') DESC,
      (table_name='share')  DESC,
      table_name ASC
    LIMIT 1;
  `);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Share相当テーブルを特定できませんでした。');
  }
  return { schema: String(rows[0].table_schema), name: String(rows[0].table_name) };
}

async function main() {
  const meta = await prisma.$queryRawUnsafe(`SELECT current_database() AS db, current_user AS usr`);
  const t = await resolveShareTable();
  const fqtn = `"${esc(t.schema)}"."${esc(t.name)}"`;

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      SUM(CASE WHEN id IS NULL THEN 1 ELSE 0 END)::int                        AS id_nulls,
      SUM(CASE WHEN id = ''   THEN 1 ELSE 0 END)::int                        AS id_empties,
      SUM(CASE WHEN length(id) < ${MIN_ID_LEN} THEN 1 ELSE 0 END)::int        AS id_short,
      SUM(CASE WHEN title IS NULL THEN 1 ELSE 0 END)::int                    AS title_nulls,
      SUM(CASE WHEN trim(title) = '' THEN 1 ELSE 0 END)::int                 AS title_blank
    FROM ${fqtn};
  `);
  const s = rows[0];

  const problems = [];
  if (s.id_nulls   > 0) problems.push(`id=NULL: ${s.id_nulls}`);
  if (s.id_empties > 0) problems.push(`id=''  : ${s.id_empties}`);
  if (s.id_short   > 0) problems.push(`id<${MIN_ID_LEN}: ${s.id_short}`);
  if (s.title_nulls> 0) problems.push(`title=NULL: ${s.title_nulls}`);
  if (s.title_blank> 0) problems.push(`title=blank: ${s.title_blank}`);

  // 制約が入っているか（再発防止の確認）
  const constraint = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS c FROM pg_constraint WHERE conname = 'share_id_valid_check';
  `);
  const hasCheck = Number(constraint?.[0]?.c ?? 0) > 0;

  if (!CI) {
    console.log('=== DB Health Check (Share) ===');
    console.log('[DB]', meta[0], '/ table:', fqtn);
    console.log('- counts:', s);
    console.log('- check constraint (share_id_valid_check):', hasCheck ? 'present' : 'missing');
  }

  if (problems.length === 0) {
    if (CI) console.log('DB_HEALTH:OK');
    else {
      console.log('✅ OK: 問題レコードはありません。');
      if (!hasCheck) {
        console.log('⚠️ 補足: CHECK 制約が未追加です。再発防止のため追加を推奨します。');
      }
    }
    process.exit(0);
  } else {
    if (CI) {
      console.log('DB_HEALTH:NG ' + problems.join(', '));
    } else {
      console.log('❌ NG: 問題を検出しました ->', problems.join(' / '));
      console.log('ヒント:');
      console.log(' - 空/短い id の削除: node scripts/__tmp_diag_purge.mjs --purge');
      console.log(' - title 補正       : node scripts/clean-shares.mjs --fix --yes');
    }
    process.exit(1);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
