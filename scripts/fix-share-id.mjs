// scripts/fix-share-id.mjs
// 目的: Share.id の "NULL" / ""（空文字）を確実に削除し、
//       以後の混入を防ぐため CHECK 制約を追加する（長さ>=15を必須）。
// 追加オプション: --purge-short を付けると長さ<15のIDも削除します（任意）。
//
// 使い方:
//   node scripts/fix-share-id.mjs
//   node scripts/fix-share-id.mjs --purge-short   // 短すぎるIDも削除したい場合

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const PURGE_SHORT = process.argv.includes('--purge-short');
const MIN_LEN = 15;

async function main() {
  console.log('--- Fix Share.id (purge empty/null & add CHECK constraint) ---');

  // 0) 事前カウント
  const before = await prisma.$queryRawUnsafe(`
    SELECT
      SUM(CASE WHEN id IS NULL THEN 1 ELSE 0 END)::int AS nulls,
      SUM(CASE WHEN id = ''   THEN 1 ELSE 0 END)::int AS empties,
      SUM(CASE WHEN length(id) < ${MIN_LEN} THEN 1 ELSE 0 END)::int AS short
    FROM "Share";`);
  console.log('Before:', before[0]);

  // 1) 空/NULL を確実削除（生SQL）
  const delEmptyNull = await prisma.$executeRawUnsafe(
    `DELETE FROM "Share" WHERE id IS NULL OR id = ''`
  );
  console.log('Deleted empty/null:', delEmptyNull);

  // 2) 任意: 短すぎるIDも削除（< MIN_LEN）
  if (PURGE_SHORT) {
    const delShort = await prisma.$executeRawUnsafe(
      `DELETE FROM "Share" WHERE length(id) < ${MIN_LEN}`
    );
    console.log(`Deleted short ids (<${MIN_LEN}):`, delShort);
  }

  // 3) 再発防止: CHECK 制約を追加（存在しなければ）
  await prisma.$executeRawUnsafe(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'share_id_valid_check'
    ) THEN
      ALTER TABLE "Share"
        ADD CONSTRAINT share_id_valid_check
        CHECK (id <> '' AND length(id) >= ${MIN_LEN});
    END IF;
  END$$;`);
  console.log('Added CHECK constraint (if missing): share_id_valid_check');

  // 4) 事後カウント
  const after = await prisma.$queryRawUnsafe(`
    SELECT
      SUM(CASE WHEN id IS NULL THEN 1 ELSE 0 END)::int AS nulls,
      SUM(CASE WHEN id = ''   THEN 1 ELSE 0 END)::int AS empties,
      SUM(CASE WHEN length(id) < ${MIN_LEN} THEN 1 ELSE 0 END)::int AS short
    FROM "Share";`);
  console.log('After:', after[0]);

  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
