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
};

// 返却shape（CP@2025-09-21.v3-compact / tests-augmented）
type WriterResponseOk = {
  ok: true;
  data: {
    text: string;
    meta: {
      style: string;
      tone: string;
      locale: string;
    };
  };
  // output は data.text と同文
  output: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as WriterRequest | null;

    const provider = (body?.provider ?? "openai").toLowerCase();
    const prompt = (body?.prompt ?? "").toString();
    const model = (body?.model ?? "gpt-4o-mini").toString();
    const temperature =
      typeof body?.temperature === "number" ? body!.temperature : 0.7;
    const system =
      (body?.system ??
        "あなたは有能なECライターAIです。日本語で、簡潔かつ具体的に出力してください。") + "";

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "prompt is required" },
        { status: 400 }
      );
    }

    // 🔀 STUBモード分岐（DEBUG_TEMPLATE_API=stub）
    if ((process.env.DEBUG_TEMPLATE_API ?? "").toLowerCase() === "stub") {
      const stubText =
        `【STUB出力】次の要求を受け取りました：\n` +
        `---\n${prompt}\n---\n` +
        `この環境では外部APIを呼び出さず、固定ロジックで応答します。`;
      const payload: WriterResponseOk = {
        ok: true,
        data: {
          text: stubText,
          meta: {
            style: "default",
            tone: "neutral",
            locale: "ja-JP",
          },
        },
        output: stubText,
      };
      return NextResponse.json(payload, { status: 200 });
    }

    // 現行構造維持：fetch直叩きで OpenAI Chat Completions を呼び出し
    if (provider !== "openai") {
      return NextResponse.json(
        { ok: false, error: `unsupported provider: ${provider}` },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY is not set" },
        { status: 500 }
      );
    }

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await safeText(resp);
      return NextResponse.json(
        {
          ok: false,
          error: `openai api error: ${resp.status} ${resp.statusText}`,
          details: errText?.slice(0, 2000) ?? "",
        },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as any;
    const content =
      data?.choices?.[0]?.message?.content?.toString()?.trim() ?? "";

    const payload: WriterResponseOk = {
      ok: true,
      data: {
        text: content,
        meta: {
          style: "default",
          tone: "neutral",
          locale: "ja-JP",
        },
      },
      output: content, // 同文
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unexpected error" },
      { status: 500 }
    );
  }
}

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}
