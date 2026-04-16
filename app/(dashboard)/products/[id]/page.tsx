// app/(dashboard)/products/[id]/page.tsx
// L2-10-1: 商品詳細 → 文章作成（Writer）導線 + Product Facts 入力UI（保存まで）
//
// 追加（2026-01-31）:
// - 有料ガード（ACTIVE/TRIALINGのみ）
// - 無料（ログイン済みだが非有料）→ /pricing
// - 未ログイン → /login
//
// 注意:
// - 本番DBはアプリ運用専用。migrate dev は dev DB（Neon branch）でのみ実施。
// - このページは「入力→保存」が成立する最小実装（中途半端にしない）。
//
// 今回の更新:
// - 一般ユーザー向けにUI文言を整理
// - 内部設計語（中核 / 参照 / 補助 / 第1〜第4グループ）を画面表示から削除
// - 保存ロジック / Server Action / Writer導線は維持

export const dynamic = "force-dynamic";

import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PrismaClient, SubscriptionStatus } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

declare global {
  // eslint-disable-next-line no-var
  var __shopwriter_prisma: PrismaClient | undefined;
}
const prisma = global.__shopwriter_prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") global.__shopwriter_prisma = prisma;

type PageProps = {
  params: { id: string };
  searchParams?: { e?: string };
};

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

function pickAttrValue(
  attributes: { id: string; key: string; value: string }[],
  key: string,
): string {
  return attributes.find((a) => a.key === key)?.value ?? "";
}

function isReservedKey(key: string) {
  return key === "purpose" || key === "value";
}

function ErrorBanner({ code }: { code?: string }) {
  if (!code) return null;

  let msg = "入力内容を確認してください。";
  if (code === "purpose_required") msg = "「使う場面」を入力してください。";
  if (code === "value_required") msg = "「商品の良さ」を入力してください。";
  if (code === "spec_key_required") msg = "「仕様・サイズなど」で項目名を入力してください。";
  if (code === "spec_value_required") msg = "「仕様・サイズなど」で値を入力してください。";
  if (code === "attr_key_required") msg = "「補足情報」で項目名を入力してください。";
  if (code === "attr_value_required") msg = "「補足情報」で値を入力してください。";

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
      {msg}
    </div>
  );
}

function SectionCard({
  title,
  description,
  emphasis = "normal",
  children,
}: {
  title: string;
  description: string;
  emphasis?: "primary" | "secondary" | "normal";
  children: ReactNode;
}) {
  const toneClass =
    emphasis === "primary"
      ? "border-primary/30 bg-primary/[0.04]"
      : emphasis === "secondary"
        ? "border-dashed border-border bg-background"
        : "border-border bg-background";

  return (
    <Card className={toneClass}>
      <CardHeader className="space-y-2">
        <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// --- Server Actions ---------------------------------------------------------

async function updateCore(formData: FormData) {
  "use server";

  await requirePaidUserOrRedirect();

  const productId = String(formData.get("productId") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  const factsNote = String(formData.get("factsNote") ?? "").trim();

  if (!productId) notFound();
  if (!purpose) redirect(`/products/${productId}?e=purpose_required`);
  if (!value) redirect(`/products/${productId}?e=value_required`);

  await prisma.product.update({
    where: { id: productId },
    data: { factsNote: factsNote.length ? factsNote : null },
  });

  const existing = await prisma.productAttribute.findMany({
    where: { productId, key: { in: ["purpose", "value"] } },
    select: { id: true, key: true },
  });

  const purposeRow = existing.find((x) => x.key === "purpose");
  const valueRow = existing.find((x) => x.key === "value");

  if (purposeRow) {
    await prisma.productAttribute.update({
      where: { id: purposeRow.id },
      data: { value: purpose },
    });
  } else {
    await prisma.productAttribute.create({
      data: { productId, key: "purpose", value: purpose },
    });
  }

  if (valueRow) {
    await prisma.productAttribute.update({
      where: { id: valueRow.id },
      data: { value },
    });
  } else {
    await prisma.productAttribute.create({
      data: { productId, key: "value", value },
    });
  }

  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

async function addSpec(formData: FormData) {
  "use server";

  await requirePaidUserOrRedirect();

  const productId = String(formData.get("productId") ?? "").trim();
  const key = String(formData.get("specKey") ?? "").trim();
  const value = String(formData.get("specValue") ?? "").trim();
  const unit = String(formData.get("specUnit") ?? "").trim();

  if (!productId) notFound();
  if (!key) redirect(`/products/${productId}?e=spec_key_required`);
  if (!value) redirect(`/products/${productId}?e=spec_value_required`);

  await prisma.productSpec.create({
    data: { productId, key, value, unit: unit.length ? unit : null },
  });

  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

async function deleteSpec(formData: FormData) {
  "use server";

  await requirePaidUserOrRedirect();

  const productId = String(formData.get("productId") ?? "").trim();
  const specId = String(formData.get("specId") ?? "").trim();

  if (!productId) notFound();
  if (!specId) redirect(`/products/${productId}`);

  await prisma.productSpec.delete({ where: { id: specId } });

  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

async function addAttr(formData: FormData) {
  "use server";

  await requirePaidUserOrRedirect();

  const productId = String(formData.get("productId") ?? "").trim();
  const key = String(formData.get("attrKey") ?? "").trim();
  const value = String(formData.get("attrValue") ?? "").trim();

  if (!productId) notFound();
  if (!key) redirect(`/products/${productId}?e=attr_key_required`);
  if (!value) redirect(`/products/${productId}?e=attr_value_required`);

  if (key === "purpose" || key === "value") {
    redirect(`/products/${productId}?e=attr_key_required`);
  }

  await prisma.productAttribute.create({
    data: { productId, key, value },
  });

  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

async function deleteAttr(formData: FormData) {
  "use server";

  await requirePaidUserOrRedirect();

  const productId = String(formData.get("productId") ?? "").trim();
  const attrId = String(formData.get("attrId") ?? "").trim();

  if (!productId) notFound();
  if (!attrId) redirect(`/products/${productId}`);

  await prisma.productAttribute.delete({ where: { id: attrId } });

  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

// ---------------------------------------------------------------------------

export default async function ProductDetailPage({
  params,
  searchParams,
}: PageProps) {
  await requirePaidUserOrRedirect();

  const id = params?.id ?? "";
  if (!id) notFound();

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      factsNote: true,
      specs: { select: { id: true, key: true, value: true, unit: true } },
      attributes: { select: { id: true, key: true, value: true } },
    },
  });

  if (!product) notFound();

  const qs = new URLSearchParams({ productId: product.id });
  const writerHref = `/writer?${qs.toString()}`;

  const purpose = pickAttrValue(product.attributes, "purpose");
  const value = pickAttrValue(product.attributes, "value");

  const otherAttrs = product.attributes
    .filter((a) => !isReservedKey(a.key))
    .sort((a, b) => a.key.localeCompare(b.key, "ja"));

  const specs = [...product.specs].sort((a, b) =>
    a.key.localeCompare(b.key, "ja"),
  );

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="truncate text-xl font-semibold sm:text-2xl">{product.name}</h1>
          <p className="text-sm text-muted-foreground">
            文章作成に使う商品情報をここで整えます。必要なところから少しずつ入力できます。
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button asChild>
            <Link href={writerHref}>この商品で文章を作成</Link>
          </Button>

          <Button asChild variant="outline">
            <Link href="/products">一覧に戻る</Link>
          </Button>
        </div>
      </header>

      <ErrorBanner code={searchParams?.e} />

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">商品の基本情報</CardTitle>
          <p className="text-sm text-muted-foreground">
            この商品の識別情報と更新状況です。入力作業は下の項目から進められます。
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-sm text-muted-foreground">商品ID</div>
            <div className="break-all font-mono text-sm">{product.id}</div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-sm text-muted-foreground">更新日</div>
            <div className="text-sm">{new Date(product.updatedAt).toLocaleDateString()}</div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <SectionCard
          title="使う場面"
          description="何のために、どんな場面で使う商品かを書きます。最初に整えておくと使いやすい項目です。"
          emphasis="primary"
        >
          <form action={updateCore} className="space-y-4">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="value" value={value} />
            <input type="hidden" name="factsNote" value={product.factsNote ?? ""} />

            <div className="space-y-2">
              <div className="text-sm font-medium">何のために / どんな場面で使うか</div>
              <div className="text-xs text-muted-foreground">
                Writer の「用途・目的」に近い内容です。毎回の入力をラクにしたいときは、ここで先に整えておきます。
              </div>
              <input
                name="purpose"
                defaultValue={purpose}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="例：商品登録後すぐに紹介文の下書きを作りたいとき"
                required
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit">使う場面を保存</Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="商品の良さ"
          description="この商品を選ぶ理由になる良さを書きます。短くても大丈夫です。"
          emphasis="primary"
        >
          <form action={updateCore} className="space-y-4">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="purpose" value={purpose} />
            <input type="hidden" name="factsNote" value={product.factsNote ?? ""} />

            <div className="space-y-2">
              <div className="text-sm font-medium">商品の良さ</div>
              <div className="text-xs text-muted-foreground">
                売り込み文句ではなく、この商品ならではの良さを書きます。短文でも問題ありません。
              </div>
              <textarea
                name="value"
                defaultValue={value}
                className="min-h-[104px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="例：軽いのに丈夫で、毎日使っても扱いやすい。"
                required
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit">商品の良さを保存</Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="仕様・サイズなど"
          description="サイズや素材など、事実として伝えたい情報を入れます。必要なときに文章作成で使いやすくなります。"
        >
          <div className="space-y-4">
            {specs.length === 0 ? (
              <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                まだ登録がありません（例：サイズ、重量、素材、型番、発売日など）
              </div>
            ) : (
              <div className="space-y-2">
                {specs.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.key}</div>
                      <div className="text-sm text-muted-foreground">
                        {s.value}
                        {s.unit ? ` ${s.unit}` : ""}
                      </div>
                    </div>

                    <form action={deleteSpec} className="shrink-0">
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="specId" value={s.id} />
                      <Button type="submit" variant="outline">
                        削除
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            )}

            <form action={addSpec} className="space-y-3 rounded-md border bg-background p-3">
              <input type="hidden" name="productId" value={product.id} />
              <div>
                <div className="text-sm font-medium">仕様を追加</div>
                <div className="text-xs text-muted-foreground">
                  数値・単位・素材など、客観的な情報を追加します。
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  name="specKey"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="項目名（例：重量）"
                />
                <input
                  name="specValue"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="値（例：1.2）"
                />
                <input
                  name="specUnit"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="単位（例：kg）任意"
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  追加
                </Button>
              </div>
            </form>
          </div>
        </SectionCard>

        <SectionCard
          title="補足情報"
          description="気をつけたいことや、補足しておきたい内容を書けます。迷った情報の置き場としても使えます。"
          emphasis="secondary"
        >
          <div className="space-y-4">
            <form action={updateCore} className="space-y-4 rounded-md border bg-background p-3">
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="purpose" value={purpose} />
              <input type="hidden" name="value" value={value} />

              <div className="space-y-2">
                <div className="text-sm font-medium">補足メモ</div>
                <div className="text-xs text-muted-foreground">
                  注意点、NG、読者への配慮など、補足しておきたい内容を書きます。
                </div>
                <textarea
                  name="factsNote"
                  defaultValue={product.factsNote ?? ""}
                  className="min-h-[112px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="例：初心者向けにやさしく書く。専門用語は避ける。返品条件には触れない。"
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  補足メモを保存
                </Button>
              </div>
            </form>

            {otherAttrs.length === 0 ? (
              <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                まだ登録がありません（例：カラー、素材、タグ、ターゲットなど）
              </div>
            ) : (
              <div className="space-y-2">
                {otherAttrs.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{a.key}</div>
                      <div className="text-sm text-muted-foreground">{a.value}</div>
                    </div>

                    <form action={deleteAttr} className="shrink-0">
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="attrId" value={a.id} />
                      <Button type="submit" variant="outline">
                        削除
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            )}

            <form action={addAttr} className="space-y-3 rounded-md border bg-background p-3">
              <input type="hidden" name="productId" value={product.id} />
              <div>
                <div className="text-sm font-medium">補足情報を追加</div>
                <div className="text-xs text-muted-foreground">
                  ※「使う場面」「商品の良さ」は専用欄で管理します。
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  name="attrKey"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="項目名（例：カラー）"
                />
                <input
                  name="attrValue"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="値（例：ネイビー）"
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  追加
                </Button>
              </div>
            </form>
          </div>
        </SectionCard>
      </div>

      <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        Writer には productId を渡します（/writer?productId=...）。この画面で商品情報を整えてから、文章作成に進めます。
      </div>
    </main>
  );
}
