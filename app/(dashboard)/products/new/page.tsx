// app/(dashboard)/products/new/page.tsx
// L2-08-D: /products/new 最小フロー（新規作成）
// - 有料ガード（ACTIVE/TRIALINGのみ）
// - 入力は ClientForm に委譲
// - 作成後の遷移は ClientForm 側で /products/[id]

export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { PrismaClient, SubscriptionStatus } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClientForm } from "./ClientForm";

declare global {
  // eslint-disable-next-line no-var
  var __shopwriter_prisma: PrismaClient | undefined;
}
const prisma = global.__shopwriter_prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") global.__shopwriter_prisma = prisma;

async function requirePaidUserOrRedirect(): Promise<void> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) redirect("/login");

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true },
  });

  if (!u) redirect("/login");

  const st = u.subscriptionStatus;
  if (st === SubscriptionStatus.ACTIVE || st === SubscriptionStatus.TRIALING) return;

  redirect("/pricing");
}

export default async function NewProductPage() {
  await requirePaidUserOrRedirect();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">商品を新規作成</h1>
          <p className="text-sm text-muted-foreground">
            まずは必要最小の情報だけ登録します（スペック・属性は作成後に追加できます）。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/products">一覧へ戻る</Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientForm />
        </CardContent>
      </Card>
    </main>
  );
}
