import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 既存 User がいない開発環境でも動くよう、User を1件確保
  // NextAuthのUser.id=String前提。なければダミーを作る
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Template Tester",
        email: `tester+${Date.now()}@example.com`,
        emailVerified: null,
        image: null
      },
    });
  }

  // Template を1件作成
  const created = await prisma.template.create({
    data: {
      title: "hello template",
      body: "this is a smoke record",
      userId: user.id,
    },
  });

  // 件数確認
  const count = await prisma.template.count();

  console.log(JSON.stringify({
    ok: true,
    createdId: created.id,
    count,
    userId: user.id
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String(e) }, null, 2));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });