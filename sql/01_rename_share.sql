DO Out-Null
BEGIN
  IF to_regclass('public.shares') IS NULL AND to_regclass('public."Share"') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "Share" RENAME TO shares';
  END IF;
END
Out-Null;