/**
 * tools/check-shares-owner.cjs
 * share を ownerId 別に集計（Prisma groupBy 非依存）
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

(async () => {
  // 必要最小限だけ取得して JS で集計（確実に動く）
  const rows = await prisma.share.findMany({
    select: { ownerId: true },
  });

  const map = new Map();
  for (const r of rows) {
    const k = r.ownerId ?? "(null)";
    map.set(k, (map.get(k) ?? 0) + 1);
  }

  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);

  console.log("share counts by ownerId:");
  for (const [ownerId, count] of sorted) {
    console.log(`- ${ownerId}: ${count}`);
  }
  console.log(`total shares: ${rows.length}`);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
