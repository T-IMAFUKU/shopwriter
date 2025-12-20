const { PrismaClient } = require("@prisma/client");

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node ./tools/check-user-by-email.cjs <email>");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      console.log({ found: false, email });
      return;
    }

    console.log({ found: true, user });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
