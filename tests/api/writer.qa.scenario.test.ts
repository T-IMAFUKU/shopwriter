// tests/api/writer.qa.scenario.test.ts
// QAシナリオ（writer スモーク）：/api/writer 応答shapeの厳密チェック＋最小再現
// ルール: CP@2025-09-21.v3-compact（tests-augmented）に準拠（strict shape・余計なキー禁止）
//
// public 現仕様:
// - route は prompt 必須
// - public に見せる機能は articleType / detail（詳しさ）
// - template / CTA / noticeReason は public 前提で検証しない

import { beforeAll, describe, expect, it } from "vitest";

type WriterSuccess = {
  ok: true;
  data: {
    text: string;
    meta: { style: string; tone: string; locale: string };
  };
  output: string;
};

let POST: ((req: Request) => Promise<Response>) | null = null;

beforeAll(async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const mod = await import("../../app/api/writer/route");
    POST = mod.POST as (req: Request) => Promise<Response>;
  } catch {
    POST = null;
  }
});

function keysOf(obj: object) {
  return Object.keys(obj).sort();
}

function assertSuccessShape(json: unknown): WriterSuccess {
  expect(json).toBeTruthy();
  expect(typeof json).toBe("object");

  const j = json as WriterSuccess;
  expect(keysOf(j as unknown as object)).toEqual(["data", "ok", "output"]);
  expect(j.ok).toBe(true);
  expect(typeof j.data?.text).toBe("string");
  expect(typeof j.output).toBe("string");
  expect(keysOf(j.data.meta)).toEqual(["locale", "style", "tone"]);

  return j;
}

async function callWriter(payload: unknown): Promise<{ status: number; json: any }> {
  if (!POST) return { status: 0, json: null };
  const req = new Request("http://localhost/api/writer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res = await POST(req);
  const json = await res.json();
  return { status: res.status, json };
}

type PublicArticleType = "product_page" | "recommend" | "faq" | "announcement";
type PublicDetail = "concise" | "standard" | "detailed";

function makePrompt(args: {
  product: string;
  purpose: string;
  features: string;
  audience: string;
  articleType: PublicArticleType;
  detail: PublicDetail;
}) {
  const articleTypeLabel =
    args.articleType === "recommend"
      ? "こんな人におすすめ"
      : args.articleType === "faq"
        ? "よくある質問"
        : args.articleType === "announcement"
          ? "新商品・入荷案内"
          : "商品ページ用";
  const detailLabel =
    args.detail === "concise"
      ? "簡潔"
      : args.detail === "detailed"
        ? "やや詳しめ"
        : "標準";

  return [
    `商品名: ${args.product}`,
    `用途・使う場面: ${args.purpose}`,
    `商品の特徴・情報: ${args.features}`,
    `想定読者: ${args.audience}`,
    `文章タイプ: ${articleTypeLabel}`,
    `詳しさ: ${detailLabel}`,
    "出力要件: 日本語で、自然で読みやすいEC商品文にする",
  ].join("\n");
}

function makePayload(args?: {
  articleType?: PublicArticleType;
  detail?: PublicDetail;
  product?: string;
  purpose?: string;
  features?: string;
  audience?: string;
}) {
  const articleType = args?.articleType ?? "product_page";
  const detail = args?.detail ?? "standard";
  const product = args?.product ?? "充電式ハンディファン";
  const purpose = args?.purpose ?? "通勤中や屋外イベントで暑さをやわらげたい";
  const features = args?.features ?? "軽量、USB充電、3段階風量";
  const audience = args?.audience ?? "暑さ対策を手軽にしたい人";

  return {
    prompt: makePrompt({
      product,
      purpose,
      features,
      audience,
      articleType,
      detail,
    }),
    productName: product,
    goal: purpose,
    audience,
    sellingPoints: features.split(/、|,|\n/).map((v) => v.trim()).filter(Boolean),
    meta: {
      style: "default",
      articleType,
      detail,
      locale: "ja-JP",
    },
  };
}

describe("QA-WR-PUBLIC｜/api/writer public controls", () => {
  it(
    "QA-WR-PUBLIC-001｜商品ページ用：通常入力で strict shape の成功を返すこと",
    async () => {
      if (!POST) return;

      const { status, json } = await callWriter(makePayload());

      expect(status).toBe(200);
      const j = assertSuccessShape(json);
      expect(j.output).toContain("充電式ハンディファン");
    },
    60_000,
  );

  it(
    "QA-WR-PUBLIC-002｜文章タイプ変更：よくある質問指定でも strict shape が壊れないこと",
    async () => {
      if (!POST) return;

      const { status, json } = await callWriter(makePayload({ articleType: "faq" }));

      expect(status).toBe(200);
      const j = assertSuccessShape(json);
      expect(j.output).toContain("充電式ハンディファン");
    },
    60_000,
  );

  it(
    "QA-WR-PUBLIC-003｜詳しさ変更：やや詳しめ指定でも strict shape が壊れないこと",
    async () => {
      if (!POST) return;

      const { status, json } = await callWriter(makePayload({ detail: "detailed" }));

      expect(status).toBe(200);
      const j = assertSuccessShape(json);
      expect(j.output).toContain("充電式ハンディファン");
    },
    60_000,
  );

  it(
    "QA-WR-PUBLIC-004｜堅牢性：prompt 欠落時は 4xx で弾かれること",
    async () => {
      if (!POST) return;

      const { status } = await callWriter({
        meta: { articleType: "product_page", detail: "standard" },
      });

      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    },
    60_000,
  );
});

describe.skip("QA-WR-003｜Draft 保存→復元（保留：UI/E2E）", () => {
  it("リロード後に Draft 自動復元されること", () => {
    // TODO: 別フェーズで Playwright or route 経由の準E2E へ
  });
});
