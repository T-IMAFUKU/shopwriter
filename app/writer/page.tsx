// app/writer/page.tsx
// Precision Plan準拠：UI本体は ClientPage に集約。
// ここでは searchParams から productId を受け取り、ClientPage に渡すのみ。
// L2-12 Step2: productId の入力揺れ/不正値に耐える（無効なら null に落とし、最小の注意表示）

export const runtime = "edge";
export const dynamic = "force-dynamic";

import ClientPage from "./ClientPage";
import ThinkingOverlay from "./components/ThinkingOverlay";

type SearchParams = { [key: string]: string | string[] | undefined };

function pickFirstString(v: string | string[] | undefined): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : null;
  return null;
}

/**
 * productId の最小サニタイズ
 * - trim
 * - 空文字は無効
 * - 文字種は英数字 + - + _ のみ（安全側）
 * - 長すぎる値は無効（URLや誤貼り付け対策）
 */
function normalizeProductId(raw: string | null): {
  productId: string | null;
  invalid: boolean;
  hadParam: boolean;
} {
  const hadParam = raw !== null;

  if (raw === null) {
    return { productId: null, invalid: false, hadParam };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { productId: null, invalid: true, hadParam };
  }

  if (trimmed.length > 80) {
    return { productId: null, invalid: true, hadParam };
  }

  const ok = /^[A-Za-z0-9_-]+$/.test(trimmed);
  if (!ok) {
    return { productId: null, invalid: true, hadParam };
  }

  return { productId: trimmed, invalid: false, hadParam };
}

export default function Page({ searchParams }: { searchParams?: SearchParams }) {
  const raw = pickFirstString(searchParams?.productId);
  const { productId, invalid, hadParam } = normalizeProductId(raw);

  return (
    <>
      {/* 擬似思考ログ（生成中の回転＆完了後の自然フェード） */}
      <ThinkingOverlay />

      {/* productId が「指定されたのに無効」なら最小の注意だけ出す（UIは継続利用可能） */}
      {hadParam && invalid ? (
        <div className="mx-auto w-full max-w-5xl px-4 pt-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            productId が不正のため、この商品情報の自動入力は行いませんでした。必要なら商品を選び直してください。
          </div>
        </div>
      ) : null}

      {/* UI本体（productId を受け渡し） */}
      <ClientPage productId={productId} />
    </>
  );
}
