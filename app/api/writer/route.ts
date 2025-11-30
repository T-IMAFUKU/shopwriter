// ランタイムは nodejs のまま維持すること。
// Prisma / fetch(OpenAI) / ログ など Node.js 依存の処理があるため。
// Precision Plan では "edge" への変更はリスクが高いので禁止。
export const runtime = "nodejs";

import { writerLog } from "@/lib/metrics/writerLogger";
import { getProductContextById } from "@/server/products/repository";
import { buildWriterRequestContext } from "./request-parse";
import {
  sha256Hex,
  logEvent,
  forceConsoleEvent,
  emitWriterEvent,
} from "./_shared/logger";
import { runWriterPipeline } from "./pipeline";
import { normalizeInput } from "./normalizer";
import {
  handleInvalidRequestError,
  handlePromptRequiredError,
  handleUnsupportedProviderError,
  handleMissingApiKeyError,
  handleUnexpectedError,
} from "./error-layer";

/* =========================
   Route: POST /api/writer

   Precision Phase1 メモ:
   - route.ts は「リクエストの入口」として、
     buildWriterRequestContext で組み立てた composed.system / composed.user を
     runWriterPipeline に渡す役割を持つ。
   - Precision モード（compose-v2 / Tone人格化）は
     pipeline.ts ⇄ prompt/core.ts 側で動作しており、
     現時点では PRECISION_MODE = false のため挙動は従来どおり。
   - 本ファイルではロジックを変えず、どこで Precision がぶら下がるかを
     コメントで明示するのみ（ゼロ差分ステップ）。
========================= */

export async function POST(req: Request) {
  const t0 = Date.now();
  const rid =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  const elapsed = () => Date.now() - t0;

  let model: string | undefined;
  let provider: string | undefined;

  try {
    const ctxResult = await buildWriterRequestContext(req);

    if (!ctxResult.ok) {
      return handleInvalidRequestError(
        ctxResult.error?.message ?? "invalid request",
        rid,
        elapsed(),
      );
    }

    const { input, composed, raw: reqInput } = ctxResult.data;

    // composed は Stage1 (compose.ts) 由来の system/user。
    // Precision Phase1 では、この値を入口として受け取り、
    // pipeline.ts 側で compose-v2 の人格化 system/user と safely に共存させる。
    const {
      system: composedSystem,
      user: composedUser,
    } = composed;

    provider = String(reqInput.provider ?? "openai").toLowerCase();
    const rawPrompt = (reqInput.prompt ?? "").toString();
    model = (reqInput.model ?? "gpt-4o-mini").toString();
    const temperature =
      typeof reqInput.temperature === "number"
        ? reqInput.temperature
        : 0.7;
    const systemOverride = (reqInput.system ?? "").toString();

    await writerLog({
      phase: "request",
      model,
      requestId: rid,
    });

    if (!rawPrompt || rawPrompt.trim().length === 0) {
      return handlePromptRequiredError(
        provider,
        model,
        rid,
        elapsed(),
      );
    }

    if (provider !== "openai") {
      return handleUnsupportedProviderError(
        provider,
        model,
        rid,
        elapsed(),
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return handleMissingApiKeyError(
        provider,
        model,
        rid,
        elapsed(),
      );
    }

    // normalizeInput は Precision PhaseA/B で整備済みの正規化レイヤー。
    // Precision Phase1 では、この normalized を起点に
    // pipeline.ts 側で Tone人格化 / compose-v2 をサンドボックス実行する。
    const n = normalizeInput(rawPrompt);

    // 🧪 Precision Phase3: ProductContext 取得
    // - reqInput は型の制約を避けるため any として扱い、
    //   productId が string または number の場合に安全に string へ正規化する。
    const unsafeRawInput = reqInput as any;
    const rawProductId = unsafeRawInput?.productId;

    let productId: string | null = null;

    if (typeof rawProductId === "string") {
      const trimmed = rawProductId.trim();
      productId = trimmed.length > 0 ? trimmed : null;
    } else if (typeof rawProductId === "number") {
      if (Number.isFinite(rawProductId)) {
        productId = String(rawProductId);
      }
    }

    const productContext =
      productId ? await getProductContextById(productId) : null;

    {
      const payloadPre = {
        phase: "precompose" as const,
        provider,
        model,
        input: {
          category: n.category,
          goal: n.goal,
          platform: n.platform ?? null,
        },
        hash: {
          prompt_sha256_8: sha256Hex(rawPrompt).slice(0, 8),
        },
      };
      logEvent("ok", payloadPre);
      forceConsoleEvent("ok", payloadPre);
      await emitWriterEvent("ok", payloadPre);
    }

    // 正常系本体は runWriterPipeline に委譲。
    // Precision Phase1 では、ここから先で
    // - normalized (n)
    // - composedSystem / composedUser
    // を起点に Prompt Core Layer（compose-v2 / Tone人格化）へ接続される。
    // Precision Phase3 では、ProductContext もここで渡す。
    return runWriterPipeline({
      rawPrompt,
      normalized: n,
      provider,
      model,
      temperature,
      systemOverride,
      composedSystem,
      composedUser,
      apiKey,
      t0,
      requestId: rid,
      elapsed,
      productId,
      productContext,
    });
  } catch (e: unknown) {
    return handleUnexpectedError(e, {
      requestId: rid,
      provider: provider ?? null,
      model: model ?? null,
      durationMs: elapsed(),
    });
  }
}
