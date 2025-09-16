// scripts/purge-empty-share-id.mjs
// 目的: idが ""（空文字）や NULL の行を deleteMany で一括削除
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Purge Share rows where id is empty/null ...');
  const res = await prisma.share.deleteMany({
    where: {
      OR: [{ id: '' }, { id: null }],
    },
  });
  console.log('Deleted count:', res.count);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
