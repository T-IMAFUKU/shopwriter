// app/api/writer/route.ts
// Runtime: Node.js（外部API・環境変数利用のため）
export const runtime = "nodejs";

import { NextResponse } from "next/server";

/**
 * リクエスト型
 * provider: 文字列だが現状は "openai" のみ対応（静的ディスパッチ）
 * prompt:   ユーザ入力
 * model:    任意（未指定は "gpt-4o-mini"）
 * temperature: 任意（未指定は 0.7）
 * system:   任意（未指定は簡易デフォルト）
 */
type WriterRequest = {
  provider?: "openai" | string;
  prompt?: string;
  model?: string;
  temperature?: number;
  system?: string;
  stream?: boolean; // 予約（本実装は非ストリーム）
};

type WriterSuccess = {
  ok: true;
  provider: "openai";
  model: string;
  text: string;
};

type WriterError = {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
};

function badRequest(message: string, details?: unknown) {
  const body: WriterError = { ok: false, code: "BAD_REQUEST", message, details };
  return NextResponse.json(body, { status: 400 });
}

function serverError(message: string, details?: unknown) {
  const body: WriterError = { ok: false, code: "INTERNAL_ERROR", message, details };
  return NextResponse.json(body, { status: 500 });
}

/**
 * OpenAI 呼び出し（SDK 非依存 / fetch 直叩き）
 * ※ SDK に依存しないことでビルド時の「動的 import」警告を根本回避
 */
async function callOpenAI(input: Required<Pick<WriterRequest, "prompt">> & {
  model: string;
  temperature: number;
  system: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI API error: ${res.status} ${res.statusText} ${text}`);
  }

  const data = (await res.json()) as any;
  const text: string =
    data?.choices?.[0]?.message?.content ??
    "";

  return {
    text,
    raw: data,
  };
}

/**
 * POST /api/writer
 */
export async function POST(request: Request) {
  let body: WriterRequest | null = null;

  try {
    body = (await request.json()) as WriterRequest;
  } catch {
    return badRequest("JSON ボディを解析できませんでした。");
  }

  const provider = (body.provider ?? "openai").toLowerCase();
  const prompt = (body.prompt ?? "").toString();

  if (!prompt.trim()) {
    return badRequest("prompt は必須です。");
  }

  // 静的ディスパッチ：現状は "openai" のみ許可
  if (provider !== "openai") {
    return badRequest(`未対応の provider です: ${provider}. 現在は "openai" のみ対応しています。`);
  }

  const model = body.model?.toString() || "gpt-4o-mini";
  const temperature =
    typeof body.temperature === "number" && body.temperature >= 0 && body.temperature <= 2
      ? body.temperature
      : 0.7;
  const system =
    body.system?.toString() ||
    "You are ShopWriter, a helpful assistant that writes concise, high-quality Japanese e-commerce copy.";

  try {
    const result = await callOpenAI({ prompt, model, temperature, system });
    const payload: WriterSuccess = {
      ok: true,
      provider: "openai",
      model,
      text: result.text,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    return serverError("生成に失敗しました。", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * 簡易ヘルスチェック
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      name: "ShopWriter Writer API",
      provider: "openai",
      runtime,
    },
    { status: 200 },
  );
}
