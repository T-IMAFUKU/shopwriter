import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Template Tester",
        email: `tester+${Date.now()}@example.com`,
        emailVerified: null,
        image: null,
      },
    });
  }
  const t = await prisma.template.create({
    data: { title: "seed template", body: "before", userId: user.id },
  });
  console.log(JSON.stringify({ ok: true, userId: user.id, templateId: t.id }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());