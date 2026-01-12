const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const userId = process.argv[2];
  if (!userId) throw new Error("userId required");

  const u = await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: "PAST_DUE",
      // 例：明日まで有効（CANCELED検証用に後で使う）
      subscriptionCurrentPeriodEnd: new Date(Date.now() + 24*60*60*1000),
    },
    select: {
      id: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
    },
  });

  console.log(u);
  await prisma.$disconnect();
})();
