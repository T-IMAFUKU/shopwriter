INSERT INTO "User" (id, name, email, "createdAt", "updatedAt")
VALUES ('dev-user-1', 'Dev User', 'dev@example.com', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
