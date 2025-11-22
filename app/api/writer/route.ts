// ランタイムは nodejs のまま維持すること。
// Prisma / fetch(OpenAI) / ログ など Node.js 依存の処理があるため。
// Precision Plan では "edge" への変更はリスクが高いので禁止。
export const runtime = "nodejs";

import { writerLog } from "@/lib/metrics/writerLogger";
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

    const n = normalizeInput(rawPrompt);

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

    // 正常系本体は runWriterPipeline に委譲
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
