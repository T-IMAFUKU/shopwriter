// scripts/backup-share-json.mjs
// 使い方:
//   node scripts/backup-share-json.mjs
//
// 目的: Docker/pg_dump 不要で Share テーブルだけを JSON 退避
// 出力: backups/share_YYYYMMDD_HHmmss.json

import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();

function stamp() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

async function main() {
  const outDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('Exporting Share rows to JSON...');
  const rows = await prisma.share.findMany({
    orderBy: { createdAt: 'asc' },
  });

  const dest = path.join(outDir, `share_${stamp()}.json`);
  fs.writeFileSync(dest, JSON.stringify(rows, null, 2), 'utf8');

  console.log('Done.');
  console.log(`File: ${dest}`);
  console.log(`Count: ${rows.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
