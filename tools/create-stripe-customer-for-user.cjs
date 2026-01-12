#!/usr/bin/env node
/* tools/create-stripe-customer-for-user.cjs
 *
 * 観測用（1回限定想定）：
 * - 指定 userId の User に stripeCustomerId が無ければ Stripe Customer を作成
 * - DB(User.stripeCustomerId) に保存
 *
 * 使い方:
 *   node ./tools/create-stripe-customer-for-user.cjs <userId>
 *
 * 必須ENV:
 *   DATABASE_URL
 *   STRIPE_SECRET_KEY
 */

(async () => {
  // dotenv が入っていれば読む（無ければスルー）
  try {
    // eslint-disable-next-line global-require
    require("dotenv").config();
  } catch (_) {}

  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: node ./tools/create-stripe-customer-for-user.cjs <userId>");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Missing DATABASE_URL. (Neon / 本番DBを向いていることを確認して実行)");
    process.exit(1);
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error("Missing STRIPE_SECRET_KEY.");
    process.exit(1);
  }

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  const Stripe = require("stripe");
  const stripe = new Stripe(stripeKey);

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
      },
    });

    if (!user) {
      console.error(`User not found: ${userId}`);
      process.exit(1);
    }

    console.log("[Before]", user);

    if (user.stripeCustomerId) {
      console.log("Already has stripeCustomerId. Nothing to do.");
      process.exit(0);
    }

    // Stripe Customer を作る（emailがあれば付与）
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: {
        shopwriterUserId: user.id,
      },
    });

    console.log("[Stripe Customer Created]", {
      id: customer.id,
      email: customer.email,
    });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
      select: {
        id: true,
        email: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
      },
    });

    console.log("[After]", updated);
    console.log("OK: saved stripeCustomerId to DB.");
  } catch (err) {
    console.error("ERROR:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
