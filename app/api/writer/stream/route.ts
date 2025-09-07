// app/api/writer/stream/route.ts
export const runtime = "edge";

type WriterBody = {
  productName?: string;
  audience?: string;
  template?: string;
  tone?: string;
  keywords?: string[];
  language?: string;
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
    `出力は Markdown。必ず次の見出しを含める：`,
    `# 要点`,
    `# 本文`,
    `# CTA`,
    ``,
    `商品名: ${name}`,
    `読者: ${audience}`,
    `テンプレート: ${template}`,
    `トーン: ${tone}`,
    `キーワード: ${kw}`,
  ].join("\n");
}

function mockStreamText(name: string) {
  return [
    "# 要点\n",
    `- ${name} を使えばEC文章をすぐに作れる\n`,
    "- 検索流入を増やしCVRを改善\n\n",
    "# 本文\n",
    `${name} はEC担当者向けに設計されたAIライティングツールです。`,
    " シンプルな入力でSEO最適化された文章をストリーミングで生成します。\n\n",
    "# CTA\n",
    `今すぐ ${name} を試して、売上を伸ばしましょう。`,
  ].join("");
}

export async function POST(req: Request) {
  let body: WriterBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const text = mockStreamText(body.productName || "ShopWriter");
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const parts = text.match(/.{1,80}/gs) ?? [text];
        for (const p of parts) {
          controller.enqueue(encoder.encode(p));
          // 疑似的な遅延
          // @ts-ignore
          await new Promise((r) => setTimeout(r, 30));
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "あなたは日本語ECのコピーライターです。誇張を避け、要点/本文/CTAで簡潔にMarkdown出力してください。",
        },
        { role: "user", content: buildUserPrompt(body) },
      ],
    }),
  });

  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => "");
    return new Response(
      `OpenAI error: ${resp.status} ${resp.statusText}\n${txt}`,
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = resp.body.getReader();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta: string | undefined =
              json?.choices?.[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          } catch {
            // JSONでなければ無視
          }
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
