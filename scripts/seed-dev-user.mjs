// scripts/seed-dev-user.mjs
// 1) .env.local → .env の順で環境変数をロード（dotenvが無くても動くフォールバック付き）
// 2) Prisma Client を後から動的import（環境変数ロード完了後に接続させる）

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

async function loadEnv() {
  const envPaths = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ];

  // dotenv が入っていれば優先的に使う（無ければフォールバック）
  let usedDotenv = false;
  try {
    const dotenv = await import("dotenv");
    for (const p of envPaths) {
      if (fs.existsSync(p)) dotenv.config({ path: p });
    }
    usedDotenv = true;
  } catch {
    // フォールバック：超簡易パーサ
    for (const p of envPaths) {
      if (!fs.existsSync(p)) continue;
      const txt = fs.readFileSync(p, "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const [, k, raw] = m;
        const v = raw.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      "[ERR] DATABASE_URL が見つかりません。.env.local もしくは .env に設定してください。"
    );
    console.error("例）DATABASE_URL=\"postgresql://...\"");
    process.exit(2);
  }

  console.log(
    `[env] loaded${usedDotenv ? " (dotenv)" : " (fallback)"} / DATABASE_URL: ${
      process.env.DATABASE_URL ? "OK" : "MISSING"
    }`
  );
}

await loadEnv();

// ここで初めて PrismaClient を読む（環境変数ロード後）
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const id = "dev-user-1";
  const email = "dev-user-1@shopwriter.invalid";

  const user = await prisma.user.upsert({
    where: { email },
    update: { name: "Dev User" },
    create: { id, name: "Dev User", email },
  });

  console.log("[OK] Upserted DEV user:", { id: user.id, email: user.email });
}

main()
  .catch((e) => {
    console.error("[ERR] seed-dev-user:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
