const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const userId = process.argv[2];
const status = (process.argv[3] || "").toUpperCase(); // ACTIVE|PAST_DUE|CANCELED
const periodEndIso = process.argv[4] || null;          // optional ISO string

if (!userId || !status) {
  throw new Error("Usage: node tools/set-subscription.cjs <userId> <ACTIVE|PAST_DUE|CANCELED> [periodEndIso]");
}

(async () => {
  const data = { subscriptionStatus: status };
  if (periodEndIso !== null) data.subscriptionCurrentPeriodEnd = new Date(periodEndIso);

  const u = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, subscriptionStatus: true, subscriptionCurrentPeriodEnd: true },
  });
  console.log(u);
})()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
