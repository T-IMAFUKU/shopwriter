const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const userId = process.argv[2];
if (!userId) throw new Error("Usage: node tools/check-user-by-id.cjs <userId>");

(async () => {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });
  console.log(u);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
