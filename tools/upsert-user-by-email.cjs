// tools/upsert-user-by-email.cjs
// 目的: 本番DB（Neon）に観測用Userを1件作る/既存なら表示する
//
// 使い方:
//   node .\tools\upsert-user-by-email.cjs amulet39@gmail.com "T-IMAFUKU"
//
// 必須ENV:
//   DATABASE_URL  (本番Neonを向けること)

const { PrismaClient } = require("@prisma/client");

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. (Neon / 本番DBを向いていることを確認して実行)`);
    process.exit(1);
  }
  return v;
}

async function main() {
  mustGetEnv("DATABASE_URL");

  const email = process.argv[2];
  const name = process.argv[3] || null;

  if (!email) {
    console.error("Usage: node .\\tools\\upsert-user-by-email.cjs <email> [name]");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      console.log({
        action: "found",
        user: {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          stripeCustomerId: existing.stripeCustomerId,
          stripeSubscriptionId: existing.stripeSubscriptionId,
          subscriptionStatus: existing.subscriptionStatus,
          subscriptionCurrentPeriodEnd: existing.subscriptionCurrentPeriodEnd,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        },
      });
      return;
    }

    const created = await prisma.user.create({
      data: {
        email,
        name,
      },
    });

    console.log({
      action: "created",
      user: {
        id: created.id,
        email: created.email,
        name: created.name,
        stripeCustomerId: created.stripeCustomerId,
        stripeSubscriptionId: created.stripeSubscriptionId,
        subscriptionStatus: created.subscriptionStatus,
        subscriptionCurrentPeriodEnd: created.subscriptionCurrentPeriodEnd,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    });
  } finally {
    // PrismaClient を閉じる
    // eslint-disable-next-line no-undef
    // (Node環境でのみ実行)
    // @ts-ignore
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Error:", e?.message || e);
  process.exit(1);
});
