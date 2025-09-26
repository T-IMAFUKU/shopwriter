DO $$
BEGIN
  -- 1) Share テーブル本体
  CREATE TABLE IF NOT EXISTS public."Share" (
    "id"        TEXT         NOT NULL,
    "title"     TEXT         NOT NULL,
    "body"      TEXT,
    "isPublic"  BOOLEAN      NOT NULL DEFAULT false,
    "ownerId"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
  );

  -- 2) 複合インデックス
  CREATE INDEX IF NOT EXISTS "Share_ownerId_isPublic_idx"
    ON public."Share"("ownerId","isPublic");

  -- 3) 外部キー: User が在る場合のみ。重複は握り潰し。
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='User'
  ) THEN
    BEGIN
      ALTER TABLE public."Share"
        ADD CONSTRAINT "Share_ownerId_fkey"
        FOREIGN KEY ("ownerId") REFERENCES public."User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- 既に存在: 何もしない
    END;
  END IF;

  -- 4) 外部キー: MetricEvent が在る場合のみ。重複は握り潰し。
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='MetricEvent'
  ) THEN
    BEGIN
      ALTER TABLE public."MetricEvent"
        ADD CONSTRAINT "MetricEvent_shareId_fkey"
        FOREIGN KEY ("shareId") REFERENCES public."Share"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- 既に存在: 何もしない
    END;
  END IF;
END$$ LANGUAGE plpgsql;