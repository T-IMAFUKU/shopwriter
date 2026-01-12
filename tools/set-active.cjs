const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const userId = process.argv[2];
if (!userId) throw new Error("Usage: node tools/set-active.cjs <userId>");

(async () => {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { subscriptionStatus: "ACTIVE" },
    select: {
      id: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
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
