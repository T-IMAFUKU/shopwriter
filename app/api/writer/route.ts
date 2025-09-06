import { NextResponse } from "next/server";

export const runtime = "nodejs";

type WriterRequest = {
  productName: string;
  audience: string;
  template: string;
  tone: string;
  keywords: string[];
  language: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<WriterRequest>;
    const {
      productName = "",
      audience = "",
      template = "EC",
      tone = "カジュアル",
      keywords = [],
      language = "ja",
    } = body;

    const text = [
      "## 見出し",
      `${productName}でECサイトの成果を最大化！`,
      "",
      "### 要点",
      "- SEO対策が簡単にできる",
      "- CVR（コンバージョン率）向上に寄与",
      "- スピード重視で作業効率アップ",
      "- 初心者でも使いやすいインターフェース",
      "- 充実したサポート体制",
      "",
      "### 本文",
      `${productName}は、${audience}のために特別に設計されたツールです。検索上位の獲得を狙えるだけでなく、CVR改善のための機能も充実。スピード感のある運用を支え、日々の作業効率を高めます。直感的なUIで導入も簡単。まずは${template}でお試しください。`,
    ].join("\n");

    const payload = {
      ok: true,
      mock: false,
      model: "gpt-4o-mini",
      received: { productName, audience, template, tone, keywords, language },
      text,
    };

    return new NextResponse(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new NextResponse(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}

// 任意：GETでルートの存在確認
export async function GET() {
  return new NextResponse(
    JSON.stringify({ ok: true, route: "/api/writer" }),
    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
}
