/**
 * /api/writer
 * 仕様：入力に tone / locale 指定が無い場合の既定値を
 *   tone = "friendly", locale = "ja" に正規化して処理・返却する。
 * 既存の内部実装（生成器）がある場合は優先して呼び出し、最終的な data.meta を上記で整える。
 * 内部実装が見つからない場合はフォールバックで最小限のダミーを返す（デバッグ用途）。
 */

export const runtime = "nodejs"; // or "edge" でも可。既存方針に合わせてください。

type WriterRequest = {
  mode?: string;
  input?: any;
  options?: {
    tone?: string;     // 例: "friendly" | "neutral" | ...
    locale?: string;   // 例: "ja" | "ja-JP"
    [k: string]: any;
  } & Record<string, any>;
  [k: string]: any;
};

type WriterResponse = {
  ok: boolean;
  data?: {
    meta?: {
      style?: string;
      tone?: string;
      locale?: string;
      [k: string]: any;
    };
    text?: string;
    [k: string]: any;
  };
  [k: string]: any;
};

async function callInternalHandler(body: WriterRequest): Promise<WriterResponse | null> {
  // 既存の内部ハンドラ候補を順に試行（存在しない場合は例外→null）
  const candidates = [
    "@/lib/api/writer",   // 例: export async function handleWriter(body) { ... }
    "@/lib/writer",       // 例: export async function handleWriter(body) { ... }
    "@/app/api/_writer",  // 例: サブルート化されているケース
  ] as const;

  for (const modPath of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - 動的 import のため型は緩める
      const mod = await import(modPath);
      const fn =
        typeof mod?.handleWriter === "function"
          ? mod.handleWriter
          : typeof mod?.generate === "function"
          ? mod.generate
          : typeof mod?.default === "function"
          ? mod.default
          : null;

      if (fn) {
        const result = (await fn(body)) as unknown;
        // 想定形に寄せる（最低限 ok/data を用意）
        const normalized: WriterResponse = {
          ok: (result as any)?.ok ?? true,
          data: (result as any)?.data ?? (typeof result === "object" ? (result as any) : {}),
        };
        return normalized;
      }
    } catch {
      // 見つからない/読み込めない場合は次候補へ
    }
  }
  return null;
}

function normalizeDefaults(body: WriterRequest): { mode: string; tone: string; locale: string } {
  const mode = (body.mode || "product_card").toString();
  const tone = (body.options?.tone ?? "friendly").toString(); // 既定：friendly
  const locale = (body.options?.locale ?? "ja").toString();   // 既定：ja
  // 呼び出し前に body.options を上書き（下位の生成器にも伝播）
  body.options = { ...(body.options ?? {}), tone, locale };
  return { mode, tone, locale };
}

function normalizeResponse(
  res: WriterResponse | null,
  defaults: { mode: string; tone: string; locale: string }
): WriterResponse {
  const base: WriterResponse = res ?? { ok: true, data: {} };
  base.data = base.data ?? {};
  base.data.meta = base.data.meta ?? {};
  // style（= mode）/ tone / locale を仕様既定で正規化
  base.data.meta.style = base.data.meta.style ?? defaults.mode;
  base.data.meta.tone = defaults.tone;
  base.data.meta.locale = defaults.locale;

  // 最低限の text を保証（既存生成が何も返していない場合のフォールバック）
  if (typeof base.data.text !== "string" || base.data.text.length === 0) {
    base.data.text = `【writer debug】style=${base.data.meta.style}, tone=${base.data.meta.tone}, locale=${base.data.meta.locale}`;
  }
  return base;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as WriterRequest;
    const defaults = normalizeDefaults(body);

    // 既存の内部実装があれば使用
    const internal = await callInternalHandler(body);
    const result = normalizeResponse(internal, defaults);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const errorResult: WriterResponse = {
      ok: false,
      data: {
        meta: { style: "unknown", tone: "friendly", locale: "ja" },
        text: "",
      },
      error: { message },
    };
    return new Response(JSON.stringify(errorResult), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
