DO UTF8
BEGIN
  IF to_regclass('public.shares') IS NULL THEN
    EXECUTE $
      CREATE TABLE public.shares (
        id         text PRIMARY KEY,
        title      text NOT NULL,
        body       text,
        "isPublic" boolean NOT NULL DEFAULT false,
        "ownerId"  text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    $;
  END IF;
END
UTF8;