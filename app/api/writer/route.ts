// ✅ Next.js App Router API (UTF-8安全版)
// - 受信: request.json() でUTF-8として受ける
// - 返却: NextResponse.json() でUTF-8として返す（ヘッダに charset=utf-8 を明示）
// - 外部API呼び出しはダミー（必要に応じて置換）

import { NextResponse } from "next/server";

export const runtime = "nodejs"; // 明示（任意）

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
    // 1) 受信（UTF-8でJSON解釈）
    const body = (await request.json()) as Partial<WriterRequest>;

    // 2) バリデーション（最小限）
    const {
      productName = "",
      audience = "",
      template = "EC",
      tone = "カジュアル",
      keywords = [],
      language = "ja",
    } = body;

    // 3) ここで実際はOpenAI等を呼ぶ想定（ダミー応答）
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

    // 4) 返却（UTF-8 / application/json; charset=utf-8）
    return new NextResponse(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error in /api/writer";
    return new NextResponse(
      JSON.stringify({ ok: false, error: message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}

export async function GET() {
  // 任意: 簡易ヘルスチェック
  return new NextResponse(
    JSON.stringify({ ok: true, route: "/api/writer" }),
    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
}
