// app/api/writer/route.ts — 安全化（遅延初期化＋nodejsランタイム固定・全文置換え）

import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ← Edgeでの環境変数挙動差異を避ける

// 共通：キー存在チェック
function requireApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return { ok: false as const, reason: "OPENAI_API_KEY is missing" };
  }
  return { ok: true as const, apiKey };
}

// 必要なときにだけ動的import＆初期化（＝ビルド時に new しない）
async function getOpenAI(apiKey: string) {
  const { default: OpenAI } = await import("openai");
  return new OpenAI({ apiKey });
}

export async function POST(req: Request) {
  try {
    const key = requireApiKey();
    if (!key.ok) {
      return NextResponse.json(
        {
          error: "Server Misconfiguration",
          hint: "Set OPENAI_API_KEY in your environment (Vercel/Local).",
        },
        { status: 500 }
      );
    }

    const client = await getOpenAI(key.apiKey);

    // ここから先はあなたの元々の処理に置き換えてOK。
    // まずは健全性確認用の最小応答にしておく。
    // 例：モデルに触らず 200 を返す（ビルド/本番の健全性確認用）
    return NextResponse.json({ ok: true }, { status: 200 });

    // ---- 参考：実際に呼ぶときの雛形（必要になったら解禁）
    // const body = await req.json();
    // const res = await client.chat.completions.create({
    //   model: "gpt-4o-mini",
    //   messages: [{ role: "user", content: body.prompt ?? "ping" }],
    // });
    // return NextResponse.json({ ok: true, data: res }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function GET() {
  // ヘルスチェック用（本番/ローカルともに 200 を返せる）
  const key = requireApiKey();
  return NextResponse.json(
    { ok: true, hasApiKey: key.ok },
    { status: 200 }
  );
}
