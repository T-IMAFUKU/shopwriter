#!/usr/bin/env node
/* tools/create-stripe-customer-for-user.cjs
 *
 * 観測/検証用（安全ガードあり）：
 * - 指定ユーザー（userId または email）を検索
 * - Stripe Customer を作成
 * - DB(User.stripeCustomerId) に保存
 *
 * 使い方:
 *   node ./tools/create-stripe-customer-for-user.cjs <userId|email> [--force]
 *
 * 例:
 *   node ./tools/create-stripe-customer-for-user.cjs cmit8u...          # userId
 *   node ./tools/create-stripe-customer-for-user.cjs amulet39@gmail.com # email
 *   node ./tools/create-stripe-customer-for-user.cjs amulet39@gmail.com --force
 *
 * 必須ENV:
 *   DATABASE_URL
 *   STRIPE_SECRET_KEY
 *
 * 注意:
 * - 既に stripeCustomerId がある場合、デフォルトでは上書きしません（事故防止）。
 * - LIVEキー×TEST customerId の不整合を直す場合のみ --force を使ってください。
 */

(async () => {
  // dotenv が入っていれば読む（無ければスルー）
  try {
    // eslint-disable-next-line global-require
    require("dotenv").config();
  } catch (_) {}

  const arg = process.argv[2];
  const force = process.argv.includes("--force");

  if (!arg) {
    console.error(
      "Usage: node ./tools/create-stripe-customer-for-user.cjs <userId|email> [--force]",
    );
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "Missing DATABASE_URL. (Neon / 本番DBを向いていることを確認して実行)",
    );
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

  function isEmail(v) {
    return typeof v === "string" && v.includes("@");
  }

  try {
    const where = isEmail(arg) ? { email: arg } : { id: arg };

    const user = await prisma.user.findUnique({
      where,
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
      console.error(
        `User not found: ${arg} (${isEmail(arg) ? "email" : "id"})`,
      );
      process.exit(1);
    }

    console.log("[Before]", user);

    if (user.stripeCustomerId && !force) {
      console.log(
        "Already has stripeCustomerId. Nothing to do. (Use --force to overwrite)",
      );
      process.exit(0);
    }

    // Stripe Customer を作る（email/nameがあれば付与）
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: {
        shopwriterUserId: user.id,
        createdBy: "tools/create-stripe-customer-for-user.cjs",
      },
    });

    console.log("[Stripe Customer Created]", {
      id: customer.id,
      email: customer.email,
      livemode: customer.livemode,
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
