// scripts/clean-shares.mjs
// Usage:
//   node scripts/clean-shares.mjs
//   node scripts/clean-shares.mjs --fix --yes
//   node scripts/clean-shares.mjs --purge --yes

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const args = new Set(process.argv.slice(2));
const DO_FIX = args.has('--fix');
const DO_PURGE = args.has('--purge');
const ASSUME_YES = args.has('--yes');

function isNullOrEmpty(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}
function looksBrokenId(id) {
  if (isNullOrEmpty(id)) return true;
  return String(id).trim().length < 15; // cuid基準
}
function titleNeedsFix(title) {
  return isNullOrEmpty(title);
}

async function fetchAll() {
  return prisma.share.findMany({ take: 5000 });
}

function classify(rows) {
  const brokenId = [];
  const emptyTitle = [];
  const ok = [];
  for (const r of rows) {
    if (looksBrokenId(r.id)) brokenId.push(r);
    else if (titleNeedsFix(r.title)) emptyTitle.push(r);
    else ok.push(r);
  }
  return { brokenId, emptyTitle, ok };
}

async function doFix(rows) {
  let fixed = 0;
  for (const r of rows) {
    try {
      await prisma.share.update({ where: { id: r.id }, data: { title: '（無題）' } });
      fixed++;
    } catch (e) {
      console.error(`[FIX-ERROR] id=${r.id}: ${e.message}`);
    }
  }
  return fixed;
}

async function doPurge(rows) {
  let deleted = 0;
  for (const r of rows) {
    try {
      if (!isNullOrEmpty(r.id)) {
        await prisma.share.delete({ where: { id: r.id } });
        deleted++;
      } else {
        console.error(`[PURGE-SKIP] idがnull/空文字のため削除失敗: ${JSON.stringify(r)}`);
      }
    } catch (e) {
      console.error(`[PURGE-ERROR] id=${r.id}: ${e.message}`);
    }
  }
  return deleted;
}

async function main() {
  console.log('=== Share Cleaner ===');
  console.log(`Mode: ${DO_PURGE ? 'PURGE' : DO_FIX ? 'FIX' : 'DRY-RUN'}`);
  const rows = await fetchAll();
  const { brokenId, emptyTitle, ok } = classify(rows);

  console.log(`Broken ID: ${brokenId.length}`);
  console.log(`Empty Title: ${emptyTitle.length}`);
  console.log(`OK: ${ok.length}`);

  if (!DO_FIX && !DO_PURGE) {
    console.log('Dry-run only. Use --fix or --purge to apply changes.');
    return;
  }

  if (!ASSUME_YES) {
    console.log('キャンセルされました (--yes を付けると自動実行します)');
    return;
  }

  if (DO_FIX) {
    const fixed = await doFix(emptyTitle);
    console.log(`Fixed title→（無題）: ${fixed}`);
  }
  if (DO_PURGE) {
    const deleted = await doPurge([...brokenId, ...emptyTitle]);
    console.log(`Deleted: ${deleted}`);
  }
}

main().finally(() => prisma.$disconnect());
