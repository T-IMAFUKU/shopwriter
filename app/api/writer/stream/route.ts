// app/api/writer/stream/route.ts
export const runtime = "edge";

type WriterBody = {
  productName?: string;
  audience?: string;
  template?: string;
  tone?: string;
  keywords?: string[]; // UI側は配列化済み
  language?: string;   // "ja" など
};

function buildUserPrompt(b: WriterBody) {
  const name = b.productName || "製品";
  const audience = b.audience || "一般ユーザー";
  const template = b.template || "EC";
  const tone = b.tone || "カジュアル";
  const kw = (b.keywords && b.keywords.length) ? b.keywords.join("、") : "最新";
  const lang = b.language || "ja";

  return [
    `言語: ${lang}`,
    `出力は Markdown。必ず以下の順序の見出しで:`,
    `# 要点`,
    `# 本文`,
    `# CTA`,
    ``,
    `コンテキスト:`,
    `- 商品名/サービス名: ${name}`,
    `- 想定読者: ${audience}`,
    `- テンプレート: ${template}`,
    `- トーン: ${tone}`,
    `- キーワード: ${kw}`,
  ].join("\n");
}

function mockStreamText(b: WriterBody) {
  // OpenAIキーが無い場合に使う簡易モック（Markdown）
  const name = b.productName || "ShopWriter";
  return [
    "## 通常表示\n\n",
    `${name}でECサイトの効果を最大化しよう\n\n`,
    "### 要点\n",
    "- 日本語に最適化された生成\n",
    "- 検索流入とCVRの同時改善\n",
    "- UIはシンプル、結果は強力\n\n",
    "### 本文\n",
    `${name}は、EC運営者が素早く高品質な商品説明を作るためのツールです。最新のキーワードを反映し、SEOと可読性のバランスを最適化します。\n\n`,
    "### CTA\n",
    "今すぐお試しください。"
  ].join("");
}

// SSE( chat.completions stream ) → プレーンテキストに変換
async function sseToTextStream(sse: ReadableStream<Uint8Array>) {
  const reader = sse.getReader();
  const textEncoder = new TextEncoder();

  const out = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      const chunk = new TextDecoder().decode(value);
      // data: {...}\n\n を行単位で処理
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          // OpenAI chat.completions 形式
          const delta: string | undefined =
            json?.choices?.[0]?.delta?.content ??
            json?.choices?.[0]?.text; // 念のため
          if (delta) controller.enqueue(textEncoder.encode(delta));
        } catch {
          // 解析失敗時はそのまま流す（ロバストネス確保）
          controller.enqueue(textEncoder.encode(""));
        }
      }
    },
  });

  return out;
}

export async function POST(req: Request) {
  let body: WriterBody;
  try {
    body = (await req.json()) as WriterBody;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_GPT;

  // OpenAIキーが無ければモックを逐次返す
  if (!apiKey) {
    const text = mockStreamText(body);
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // ざっくり数チャンクに分割
        const parts = text.match(/.{1,120}/gs) || [text];
        for (const p of parts) {
          controller.enqueue(enc.encode(p));
          // 体感ストリーム（軽いウェイト）
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

  // --- OpenAI へストリーミング要求（SSE） ---
  const user = buildUserPrompt(body);
  const sys =
    "あなたは日本語のECコピーの専門編集者です。要点/本文/CTAの3部構成で、読みやすく、事実調で、過度な誇張を避けて書きます。";

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
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      temperature: 0.7,
    }),
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    return new Response(
      `OpenAI error: ${resp.status} ${resp.statusText}\n${text}`,
      { status: 500 }
    );
  }

  const textStream = await sseToTextStream(resp.body);
  return new Response(textStream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
