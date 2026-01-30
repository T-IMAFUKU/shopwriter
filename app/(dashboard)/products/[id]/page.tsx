// app/(dashboard)/products/[id]/page.tsx
// L2-10-1: 商品詳細 → 文章作成（Writer）導線 + Product Facts 入力UI（保存まで）
// - 「この商品で文章を作成」ボタンで /writer?productId=... へ遷移
// - Product Facts（用途/特長/スペック/属性/補足メモ）をこの画面で編集・保存できる（サーバーアクション）
// - 用途（必須）= Writer入力の「用途・目的」と同一概念（保存先は ProductAttribute key="purpose"）
// - 特長（価値）= 必須保証B（保存先は ProductAttribute key="value"）
// - 補足メモ（文脈）= Product.factsNote（任意）
//
// 注意:
// - 本番DBはアプリ運用専用。migrate dev は dev DB（Neon branch）でのみ実施。
// - このページは「入力→保存」が成立する最小実装（中途半端にしない）。

export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PrismaClient } from "@prisma/client";
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
  if (code === "purpose_required") msg = "「用途（必須）」を入力してください。";
  if (code === "value_required") msg = "「特長（必須保証B）」を入力してください。";
  if (code === "spec_key_required") msg = "スペックの「項目名」を入力してください。";
  if (code === "spec_value_required") msg = "スペックの「値」を入力してください。";
  if (code === "attr_key_required") msg = "属性の「項目名」を入力してください。";
  if (code === "attr_value_required") msg = "属性の「値」を入力してください。";

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
      {msg}
    </div>
  );
}

// --- Server Actions ---------------------------------------------------------

async function updateCore(formData: FormData) {
  "use server";

  const productId = String(formData.get("productId") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  const factsNote = String(formData.get("factsNote") ?? "").trim();

  if (!productId) notFound();
  if (!purpose) redirect(`/products/${productId}?e=purpose_required`);
  if (!value) redirect(`/products/${productId}?e=value_required`);

  // factsNote（任意）
  await prisma.product.update({
    where: { id: productId },
    data: { factsNote: factsNote.length ? factsNote : null },
  });

  // purpose/value を Attribute（key固定）として upsert
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

  const productId = String(formData.get("productId") ?? "").trim();
  const key = String(formData.get("attrKey") ?? "").trim();
  const value = String(formData.get("attrValue") ?? "").trim();

  if (!productId) notFound();
  if (!key) redirect(`/products/${productId}?e=attr_key_required`);
  if (!value) redirect(`/products/${productId}?e=attr_value_required`);

  // purpose/value は専用欄で管理する（ここからは作らせない）
  if (isReservedKey(key)) redirect(`/products/${productId}?e=attr_key_required`);

  await prisma.productAttribute.create({
    data: { productId, key, value },
  });

  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

async function deleteAttr(formData: FormData) {
  "use server";

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
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">商品詳細</h1>
          <p className="truncate text-sm text-muted-foreground">
            Product Facts（用途/特長/スペック/属性/補足）を編集できます
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
      </div>

      <ErrorBanner code={searchParams?.e} />

      <Card>
        <CardHeader>
          <CardTitle className="truncate">{product.name}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-sm text-muted-foreground">商品ID</div>
            <div className="break-all font-mono text-sm">{product.id}</div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-sm text-muted-foreground">更新日</div>
            <div className="text-sm">
              {new Date(product.updatedAt).toLocaleDateString()}
            </div>
          </div>

          {/* Core: purpose/value/factsNote */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">文章作成に使う基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <form action={updateCore} className="space-y-3">
                <input type="hidden" name="productId" value={product.id} />

                <div className="space-y-1">
                  <div className="text-sm font-medium">用途（必須）</div>
                  <div className="text-xs text-muted-foreground">
                    Writer入力の「用途・目的」と同一。ここに入れると毎回ラクになります。
                  </div>
                  <input
                    name="purpose"
                    defaultValue={purpose}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    placeholder="例：ECの商品説明（購入を後押し） / SNS投稿 / 広告 など"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium">特長（必須保証B）</div>
                  <div className="text-xs text-muted-foreground">
                    “買う理由”の核。短くてもいいので必ず1つは入れる。
                  </div>
                  <textarea
                    name="value"
                    defaultValue={value}
                    className="min-h-[88px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                    placeholder="例：軽いのに丈夫。毎日使っても型崩れしにくい。"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium">補足メモ（任意）</div>
                  <div className="text-xs text-muted-foreground">
                    文脈・注意点・制約・NGなど。迷ったらここに書く。
                  </div>
                  <textarea
                    name="factsNote"
                    defaultValue={product.factsNote ?? ""}
                    className="min-h-[96px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                    placeholder="例：対象は初心者。専門用語は避ける。返品条件は触れない。"
                  />
                </div>

                <div className="flex justify-end">
                  <Button type="submit">保存</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Specs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">スペック（事実）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {specs.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  まだ登録がありません（例：サイズ、重量、素材、型番、発売日…）
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

              <form action={addSpec} className="space-y-2 rounded-md border p-3">
                <input type="hidden" name="productId" value={product.id} />
                <div className="text-sm font-medium">スペックを追加</div>

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
            </CardContent>
          </Card>

          {/* Attributes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">属性（事実/価値の補助）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {otherAttrs.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  まだ登録がありません（例：カラー、素材、タグ、ターゲット…）
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
                        <div className="text-sm text-muted-foreground">
                          {a.value}
                        </div>
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

              <form action={addAttr} className="space-y-2 rounded-md border p-3">
                <input type="hidden" name="productId" value={product.id} />
                <div className="text-sm font-medium">属性を追加</div>
                <div className="text-xs text-muted-foreground">
                  ※「purpose」「value」は専用欄で管理するためここでは追加しません。
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
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground">
            Writerには productId を渡します（/writer?productId=...）。②で「初期値反映→編集可」を実装します。
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
