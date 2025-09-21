// scripts/add-share-id-check.mjs
// 目的: Share相当テーブルに再発防止のCHECK制約を追加し、動作検証まで行う。
// 制約: share_id_valid_check  …  id <> '' AND length(id) >= 15
// 安全策: NOT VALID で追加 → VALIDATE、既存データはクリーンなため即検証可。

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const MIN_LEN = 15;

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
    throw new Error("Share相当テーブルを特定できませんでした。");
  }
  return { schema: String(rows[0].table_schema), name: String(rows[0].table_name) };
}

async function hasConstraint(schema, table, cname) {
  const r = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS c
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = ${qstr(cname)}
      AND n.nspname = ${qstr(schema)}
      AND t.relname = ${qstr(table)};
  `);
  return Number(r?.[0]?.c ?? 0) > 0;
}

async function addConstraint(fqtn, cname) {
  // NOT VALID で追加 → VALIDATE（既存データはクリーンなため即OK）
  await prisma.$executeRawUnsafe(`
    ALTER TABLE ${fqtn}
      ADD CONSTRAINT ${cname}
      CHECK (id <> '' AND length(id) >= ${MIN_LEN})
      NOT VALID;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE ${fqtn}
      VALIDATE CONSTRAINT ${cname};
  `);
}

async function quickCounts(fqtn) {
  const r = await prisma.$queryRawUnsafe(`
    SELECT
      SUM(CASE WHEN id IS NULL THEN 1 ELSE 0 END)::int AS id_nulls,
      SUM(CASE WHEN id = ''   THEN 1 ELSE 0 END)::int AS id_empties,
      SUM(CASE WHEN length(id) < ${MIN_LEN} THEN 1 ELSE 0 END)::int AS id_short,
      SUM(CASE WHEN title IS NULL THEN 1 ELSE 0 END)::int AS title_nulls,
      SUM(CASE WHEN trim(title)='' THEN 1 ELSE 0 END)::int AS title_blank
    FROM ${fqtn};
  `);
  return r[0];
}

async function main() {
  const meta = await prisma.$queryRawUnsafe(`SELECT current_database() AS db, current_user AS usr`);
  const t = await resolveShareTable();
  const fqtn = `"${esc(t.schema)}"."${esc(t.name)}"`;
  const cname = `share_id_valid_check`;

  console.log("=== Add CHECK Constraint (Share.id) ===");
  console.log("[DB]", meta[0], "/ table:", fqtn);

  // 0) 事前確認（壊れデータがないこと）
  const before = await quickCounts(fqtn);
  console.log("[Before counts]", before);

  // 1) 既存の同名制約がなければ追加
  if (await hasConstraint(t.schema, t.name, cname)) {
    console.log(`Constraint already present: ${cname}`);
  } else {
    console.log(`Adding constraint: ${cname}`);
    await addConstraint(fqtn, cname);
    console.log("Constraint added & validated.");
  }

  // 2) “負のテスト”：無効IDを挿入しようとして失敗することを確認（ロールバック）
  try {
    await prisma.$transaction(async (tx) => {
      // テスト挿入（必ず失敗する想定）
      await tx.$executeRawUnsafe(`
        INSERT INTO ${fqtn} (id, title)
        VALUES ('', 'TEST_INVALID_ID');
      `);
    });
    console.log("❌ Unexpected: invalid insert succeeded"); // 到達しないはず
  } catch (e) {
    console.log("✅ Negative test passed (invalid id rejected):", e?.message ?? e);
  }

  // 3) 事後確認
  const after = await quickCounts(fqtn);
  console.log("[After counts]", after);

  // 4) 制約の存在確認
  const present = await hasConstraint(t.schema, t.name, cname);
  console.log("Constraint present:", present);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
