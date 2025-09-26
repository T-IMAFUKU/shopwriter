// scripts/make-test-shares.cjs
// 目的: 認証を介さずに DB へテスト用 Share を2件(非公開/公開) 直接作成し、IDを出力。
// 依存: @prisma/client が生成済み (pnpm prisma generate 済み)、DATABASE_URL が有効。

const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient({ log: ["warn", "error"] });
  const now = new Date();

  // 既存の同名テストデータを掃除（任意）
  await prisma.share.deleteMany({
    where: { title: { in: ["非公開テスト", "公開テスト"] } },
  });

  const priv = await prisma.share.create({
    data: {
      title: "非公開テスト",
      body: "forbidden-case",
      isPublic: false,
      ownerId: null, // 任意
      createdAt: now,
      updatedAt: now,
    },
  });

  const pub = await prisma.share.create({
    data: {
      title: "公開テスト",
      body: "ok-case",
      isPublic: true,
      ownerId: null, // 任意
      createdAt: now,
      updatedAt: now,
    },
  });

  // 結果を検証用に出力（PowerShellで拾いやすいJSON）
  const out = {
    ok: true,
    created: {
      private: { id: priv.id, isPublic: priv.isPublic },
      public: { id: pub.id, isPublic: pub.isPublic },
    },
  };
  console.log(JSON.stringify(out));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("make-test-shares error:", e?.message || e);
  process.exitCode = 1;
});
