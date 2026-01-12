/**
 * tools/migrate-shares-owner.cjs
 * dev-user-1 の Share を指定 ownerId へ移行する（開発データの正本化）
 *
 * 使い方:
 *   node tools/migrate-shares-owner.cjs <toOwnerId>
 *
 * 例:
 *   node tools/migrate-shares-owner.cjs cmit8ujog0000lcuku7e0672w
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

(async () => {
  const toOwnerId = process.argv[2];
  if (!toOwnerId || !String(toOwnerId).trim()) {
    console.error("Usage: node tools/migrate-shares-owner.cjs <toOwnerId>");
    process.exitCode = 1;
    return;
  }

  const fromOwnerId = "dev-user-1";

  // 先に存在確認（事故防止）
  const toUser = await prisma.user.findUnique({
    where: { id: toOwnerId },
    select: { id: true, email: true },
  });
  if (!toUser) {
    console.error(`Target user not found: ${toOwnerId}`);
    process.exitCode = 1;
    return;
  }

  const beforeFrom = await prisma.share.count({ where: { ownerId: fromOwnerId } });
  const beforeTo = await prisma.share.count({ where: { ownerId: toOwnerId } });

  console.log("before:");
  console.log(`- ${fromOwnerId}: ${beforeFrom}`);
  console.log(`- ${toOwnerId}: ${beforeTo}`);

  // 実移行（まとめて更新）
  const updated = await prisma.share.updateMany({
    where: { ownerId: fromOwnerId },
    data: { ownerId: toOwnerId },
  });

  const afterFrom = await prisma.share.count({ where: { ownerId: fromOwnerId } });
  const afterTo = await prisma.share.count({ where: { ownerId: toOwnerId } });

  console.log("migrated rows:", updated.count);
  console.log("after:");
  console.log(`- ${fromOwnerId}: ${afterFrom}`);
  console.log(`- ${toOwnerId}: ${afterTo}`);
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
