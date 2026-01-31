-- prisma/migrations/20260127082422_add_product_facts_note/migration.sql
-- 目的: 既存 Product テーブルに factsNote を追加する（本番DBで relation already exists を避ける）

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Product'
      AND column_name = 'factsNote'
  ) THEN
    ALTER TABLE "public"."Product" ADD COLUMN "factsNote" TEXT;
  END IF;
END $$;
