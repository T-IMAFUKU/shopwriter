// app/api/writer/openai-client.ts
// OpenAI 呼び出し専用ロジック
// - Responses API を使用
// - structured contract 生成と final prose 生成を分離
// - gpt-5.4-mini で未対応の reasoning.effort 値は送信前に正規化する
// - 挙動・レスポンス shape は route/pipeline 側で互換維持

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

export type ResponsesTextFormat =
  | { type: "text" }
  | {
      type: "json_schema";
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
      description?: string;
    };

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type ResponsesRequestPayload = {
  model?: string;
  instructions?: string;
  input: string;
  store?: boolean;
  reasoning?: {
    effort?: Exclude<ReasoningEffort, "minimal">;
  };
  text?: {
    format?: ResponsesTextFormat;
    verbosity?: "low" | "medium" | "high";
  };
  max_output_tokens?: number;
};

type ResponsesApiSuccess = {
  ok: true;
  data: any;
  apiMs: number;
  status: number;
  statusText: string;
};

type ResponsesApiFailure = {
  ok: false;
  apiMs: number;
  status: number;
  statusText: string;
  errorText: string;
};

export type ResponsesApiResult = ResponsesApiSuccess | ResponsesApiFailure;

export type StructuredOpenAICallResult<T> =
  | {
      ok: true;
      parsed: T;
      rawText: string;
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
      errorKind: "api" | "parse";
      rawText?: string;
    };

export type TextOpenAICallResult =
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
      errorKind: "api" | "empty";
    };

function normalizeReasoningEffort(
  effort: ReasoningEffort | undefined,
): Exclude<ReasoningEffort, "minimal"> {
  switch (effort) {
    case "none":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return effort;
    case "minimal":
    default:
      return "none";
  }
}

function extractOutputText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks: string[] = [];
  const outputItems = Array.isArray(data?.output) ? data.output : [];

  for (const item of outputItems) {
    if (item?.type !== "message") continue;
    const contentItems = Array.isArray(item?.content) ? item.content : [];
    for (const content of contentItems) {
      const text =
        typeof content?.text === "string"
          ? content.text
          : typeof content?.content === "string"
            ? content.content
            : "";
      if (text.trim()) chunks.push(text.trim());
    }
  }

  return chunks.join("\n").trim();
}

function stripJsonCodeFence(text: string): string {
  const value = (text ?? "").toString().trim();
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? value;
}

function parseStructuredOutput<T>(text: string): T | null {
  const raw = stripJsonCodeFence(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function callResponsesAPI(args: {
  apiKey: string;
  payload: ResponsesRequestPayload;
}): Promise<ResponsesApiResult> {
  const { apiKey, payload } = args;
  const t1 = Date.now();

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

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

  return {
    ok: true,
    data,
    apiMs,
    status,
    statusText,
  };
}

export async function createStructuredContract<T>(args: {
  apiKey: string;
  model?: string;
  system: string;
  userMessage: string;
  schemaName: string;
  schema: Record<string, unknown>;
  schemaDescription?: string;
  reasoningEffort?: ReasoningEffort;
}): Promise<StructuredOpenAICallResult<T>> {
  const payload: ResponsesRequestPayload = {
    model: args.model,
    instructions: args.system,
    input: args.userMessage,
    store: false,
    reasoning: { effort: normalizeReasoningEffort(args.reasoningEffort) },
    text: {
      format: {
        type: "json_schema",
        name: args.schemaName,
        schema: args.schema,
        strict: true,
        description: args.schemaDescription,
      },
    },
    max_output_tokens: 1200,
  };

  const response = await callResponsesAPI({
    apiKey: args.apiKey,
    payload,
  });

  if (!response.ok) {
    return {
      ok: false,
      apiMs: response.apiMs,
      status: response.status,
      statusText: response.statusText,
      errorText: response.errorText,
      errorKind: "api",
    };
  }

  const rawText = extractOutputText(response.data);
  const parsed = parseStructuredOutput<T>(rawText);

  if (!parsed) {
    return {
      ok: false,
      apiMs: response.apiMs,
      status: response.status,
      statusText: response.statusText,
      errorText: "failed to parse structured output",
      errorKind: "parse",
      rawText,
    };
  }

  return {
    ok: true,
    parsed,
    rawText,
    apiMs: response.apiMs,
    status: response.status,
    statusText: response.statusText,
  };
}

export async function createFinalProse(args: {
  apiKey: string;
  model?: string;
  system: string;
  userMessage: string;
  reasoningEffort?: ReasoningEffort;
  verbosity?: "low" | "medium" | "high";
}): Promise<TextOpenAICallResult> {
  const payload: ResponsesRequestPayload = {
    model: args.model,
    instructions: args.system,
    input: args.userMessage,
    store: false,
    reasoning: { effort: normalizeReasoningEffort(args.reasoningEffort) },
    text: {
      verbosity: args.verbosity ?? "medium",
    },
    max_output_tokens: 1400,
  };

  const response = await callResponsesAPI({
    apiKey: args.apiKey,
    payload,
  });

  if (!response.ok) {
    return {
      ok: false,
      apiMs: response.apiMs,
      status: response.status,
      statusText: response.statusText,
      errorText: response.errorText,
      errorKind: "api",
    };
  }

  const content = extractOutputText(response.data);

  if (!content) {
    return {
      ok: false,
      apiMs: response.apiMs,
      status: response.status,
      statusText: response.statusText,
      errorText: "empty_content",
      errorKind: "empty",
    };
  }

  return {
    ok: true,
    content,
    apiMs: response.apiMs,
    status: response.status,
    statusText: response.statusText,
  };
}
