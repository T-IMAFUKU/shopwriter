// app/api/writer/route.ts — 決定版：遅延初期化＋runtime=nodejs（ビルド時env参照を回避）

import { NextResponse } from "next/server";

export const runtime = "nodejs"; // Edge差分やビルド時評価を避ける

function requireApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") return { ok: false as const };
  return { ok: true as const, apiKey };
}

// 必要時のみ動的importで初期化（トップレベルで new しない）
async function getOpenAI(apiKey: string) {
  const { default: OpenAI } = await import("openai");
  return new OpenAI({ apiKey });
}

export async function GET() {
  const key = requireApiKey();
  return NextResponse.json({ ok: true, hasApiKey: key.ok }, { status: 200 });
}

export async function POST(req: Request) {
  const key = requireApiKey();
  if (!key.ok) {
    return NextResponse.json(
      { error: "Server Misconfiguration", hint: "Set OPENAI_API_KEY in environment." },
      { status: 500 }
    );
  }

  // まずはヘルス返却（必要時に生成処理を復帰）
  // const body = await req.json();
  // const client = await getOpenAI(key.apiKey);
  // ここで実際の処理へ…
  return NextResponse.json({ ok: true }, { status: 200 });
}
