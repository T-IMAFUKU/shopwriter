-- Postgres/SQLite 双方で通るUPSERT（idはPRIMARY KEY想定）
INSERT INTO "User" ("id","name","email")
VALUES ('dev-user-1','Dev User','dev@example.com')
ON CONFLICT("id") DO NOTHING;
