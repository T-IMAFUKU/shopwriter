// scripts/purge-empty-id-sql.mjs
// 空ID("")のShare行を生SQLで削除する
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Force deleting rows where id = "" ...');
  const res = await prisma.$executeRawUnsafe(`DELETE FROM "Share" WHERE id = ''`);
  console.log(`Deleted count: ${res}`);
}
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
