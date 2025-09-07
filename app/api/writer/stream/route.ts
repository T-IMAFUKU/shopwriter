// app/api/writer/stream/route.ts
// Edge Runtime で OpenAI の SSE を受け取り、delta.content だけを抽出して
// クライアントへ「プレーンテキストの逐次チャンク」として返す実装。
// 本番(Vercel Edge)でも文章が崩れないよう、改行分割＋持ち越しバッファで堅牢化。

export const runtime = "edge";

type WriterBody = {
  productName?: string;
  audience?: string;
  template?: string;
  tone?: string;
  keywords?: string[]; // UI側で配列化
  language?: string;   // 例: "ja"
};

function buildUserPrompt(b: WriterBody) {
  const name = b.productName || "製品";
  const audience = b.audience || "一般ユーザー";
  const template = b.template || "EC";
  const tone = b.tone || "カジュアル";
  const kw = (b.keywords?.length ? b.keywords.join("、") : "最新");
  const lang = b.language || "ja";

  return [
    `あなたは日本語で回答してください（lang=${lang}）。`,
    `出力は Markdown。次の3見出しをこの順序で必ず含める：`,
    `# 要点`,
    `# 本文`,
    `# CTA`,
    ``,
    `【入力条件】`,
    `- 商品名/サービス名: ${name}`,
    `- 想定読者: ${audience}`,
    `- テンプレート: ${template}`,
    `- トーン: ${tone}`,
    `- キーワード: ${kw}`,
  ].join("\n");
}

function mockStreamText(b: WriterBody) {
  const name = b.productName || "ShopWriter";
  return [
    `# 要点\n`,
    `- ${name} は日本語EC向けの文章を素早く生成\n`,
    `- 検索流入とCVRの両立を意識\n`,
    `- シンプルなUIで現場運用しやすい\n\n`,
    `# 本文\n`,
    `${name} は、EC運営者が短時間で高品質な商品説明文を用意できるよう設計されています。`,
    ` 最新のキーワードを織り込みつつ、読みやすさと検索適合性のバランスを最適化します。`,
    ` ストリーミング出力に対応し、進捗を見ながら調整できます。\n\n`,
    `# CTA\n`,
    `今すぐ ${name} を試して、商品ページの体験を一段引き上げましょう。`,
  ].join("");
}

/** OpenAI の SSE を JSON パースし、delta.content だけを TextStream に変換 */
async function openAITextStream(messages: Array<{ role: "system" | "user"; content: string }>, apiKey: string) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      temperature: 0.7,
      messages,
    }),
  });

  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`OpenAI error: ${resp.status} ${resp.statusText}\n${txt}`);
  }

  const source = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();

  let carry = ""; // チャンク跨りの行持ち越し

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await source.read();
      if (done) {
        // 取り残しがあれば最後に試行（通常は空）
        if (carry) {
          // carry を捨てる（未完JSONの可能性が高い）
          carry = "";
        }
        controller.close();
        return;
      }

      const chunk = decoder.decode(value, { stream: true });
      carry += chunk;

      // SSE は "\n\n" 区切りだが、堅牢性のため改行単位で分割
      const lines = carry.split("\n");
      carry = lines.pop() ?? ""; // 最後の不完全行は次回へ持ち越し

      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const json = JSON.parse(payload);
          const delta: string | undefined =
            json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.text;
          if (delta) controller.enqueue(encoder.encode(delta));
        } catch {
          // JSONでなければ無視（本番の断片が混ざるケースに備え、誤結合を回避）
        }
      }
    },
    cancel() {
      source.cancel().catch(() => {});
    },
  });
}

export async function POST(req: Request) {
  let body: WriterBody;
  try {
    body = (await req.json()) as WriterBody;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_GPT;

  // APIキー未設定時はモックを逐次返却（開発・デモ用）
  if (!apiKey) {
    const text = mockStreamText(body);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const parts = text.match(/.{1,140}/gs) ?? [text];
        for (const p of parts) {
          controller.enqueue(encoder.encode(p));
          // 擬似ストリーム感
          // @ts-ignore
          await new Promise((r) => setTimeout(r, 25));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const system =
    "あなたは日本語ECの編集者です。誇張を避け、要点/本文/CTAの3部構成で簡潔に書きます。Markdownで出力します。";
  const user = buildUserPrompt(body);

  try {
    const stream = await openAITextStream(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      apiKey
    );

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        // 中間バッファ影響を抑えるためのヒント（環境によっては無視されます）
        "Connection": "keep-alive",
      },
    });
  } catch (err: any) {
    const msg = (err?.message as string) || "Upstream error";
    return new Response(`Stream error\n${msg}`, { status: 500 });
  }
}
