-- prisma/migrations/20250919_fix_share_table_name/migration.sql
-- 目的: 本番の物理テーブル名を Prisma Client が参照する `public.shares` に揃える。
--      既に `shares` がある環境では何もしない。`"Share"` がある場合のみリネームする。
-- 注意: カラム名はそのまま (id, title, body, "isPublic", "ownerId", "createdAt", "updatedAt")。

DO $$
BEGIN
  -- 既に `shares` が存在する場合は何もしない
  IF to_regclass('public.shares') IS NOT NULL THEN
    RAISE NOTICE 'Table public.shares already exists. Skipping rename.';
    RETURN;
  END IF;

  -- `"Share"` が存在する場合は `shares` にリネーム
  IF to_regclass('public."Share"') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "Share" RENAME TO shares';
    RAISE NOTICE 'Renamed table "Share" -> shares.';
  ELSE
    -- どちらも無い場合は作成（最低限の列のみ。Prisma が後続 migrate で揃える）
    EXECUTE '
      CREATE TABLE public.shares (
        id         text PRIMARY KEY,
        title      text NOT NULL,
        body       text,
        "isPublic" boolean NOT NULL DEFAULT false,
        "ownerId"  text,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
      )
    ';
    RAISE NOTICE 'Created table public.shares.';
  END IF;
END
$$;
