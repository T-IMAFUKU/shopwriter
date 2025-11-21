// app/api/writer/openai-client.ts
// OpenAI 呼び出し専用の前段ロジック
// - /api/writer の route.ts からネットワーク処理を分離
// - 挙動・レスポンス shape は従来実装と同一

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

export type OpenAIRequestPayload = {
  model?: string;
  temperature: number;
  messages: Array<{ role: "system" | "user"; content: string }>;
};

export type OpenAICallResult =
  | {
      ok: true;
      content: string;
      apiMs: number;
      status: number;
      statusText: string;
    }
  | {
      ok: false;
      apiMs: number;
      status: number;
      statusText: string;
      errorText: string;
    };

export function buildOpenAIRequestPayload(args: {
  model: string | undefined;
  temperature: number;
  system: string;
  userMessage: string;
}): OpenAIRequestPayload {
  const { model, temperature, system, userMessage } = args;
  return {
    model,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMessage },
    ],
  };
}

export async function callOpenAI(args: {
  apiKey: string;
  payload: OpenAIRequestPayload;
}): Promise<OpenAICallResult> {
  const { apiKey, payload } = args;
  const t1 = Date.now();
  const resp = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const apiMs = Date.now() - t1;
  const status = resp.status;
  const statusText = resp.statusText;

  if (!resp.ok) {
    const errorText = await safeText(resp);
    return {
      ok: false,
      apiMs,
      status,
      statusText,
      errorText,
    };
  }

  const data = (await resp.json()) as any;
  const content =
    data?.choices?.[0]?.message?.content?.toString()?.trim() ?? "";

  return {
    ok: true,
    content,
    apiMs,
    status,
    statusText,
  };
}
