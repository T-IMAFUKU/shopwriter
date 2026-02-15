// app/api/writer/route.ts
// ランタイムは nodejs のまま維持すること。
// Prisma / fetch(OpenAI) / ログ など Node.js 依存の処理があるため。
// Precision Plan では "edge" への変更はリスクが高いので禁止。
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { writerLog } from "@/lib/metrics/writerLogger";
import { getProductContextById } from "@/server/products/repository";
import { buildWriterRequestContext } from "./request-parse";
import { sha256Hex, logEvent, forceConsoleEvent, emitWriterEvent } from "./_shared/logger";
import { runWriterPipeline } from "./pipeline";
import { normalizeInput } from "./normalizer";
import {
  handleInvalidRequestError,
  handlePromptRequiredError,
  handleUnsupportedProviderError,
  handleMissingApiKeyError,
  handleUnexpectedError,
} from "./error-layer";

// --- ✅ Billing Gate (Stripe subscriptionStatus) ---
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

type BillingGateReason = "PAST_DUE" | "CANCELED_PERIOD_ENDED" | "UNKNOWN_STATUS";

function paymentRequired(
  reason: BillingGateReason,
  detail: {
    subscriptionStatus: string | null;
    subscriptionCurrentPeriodEnd: string | null;
  },
) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "payment_required",
        reason,
        ...detail,
      },
    },
    { status: 402 },
  );
}

function isLikelyCuid(id: unknown): id is string {
  if (typeof id !== "string") return false;
  return id.length >= 20 && id.startsWith("c");
}

async function checkSubscriptionGate(
  session: unknown, // ✅ 型ズレ回避（最短で動作を確定する）
  rid: string,
  elapsedMs: number,
) {
  const s = session as any;

  const sessionUserId = s?.user?.id ?? null;
  const sessionEmail = s?.user?.email ?? null;

  // セッションが無ければ「無料扱い」= ここでは止めない
  if (!s || (!sessionEmail && !sessionUserId)) {
    await emitWriterEvent("ok", {
      phase: "billing_gate" as const,
      ok: true,
      reason: "NO_SESSION",
      requestId: rid,
      durationMs: elapsedMs,
    } as any);
    return { ok: true as const };
  }

  // email を第一優先にする（GitHub数値IDが混ざるため）
  let u:
    | {
        subscriptionStatus: string | null;
        subscriptionCurrentPeriodEnd: Date | null;
      }
    | null = null;

  if (typeof sessionEmail === "string" && sessionEmail.length > 0) {
    u = await prisma.user.findUnique({
      where: { email: sessionEmail },
      select: {
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
      },
    });
  } else if (isLikelyCuid(sessionUserId)) {
    u = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: {
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
      },
    });
  }

  // DBに居ないなら無料扱い（ここでは止めない）
  if (!u) {
    await emitWriterEvent("ok", {
      phase: "billing_gate" as const,
      ok: true,
      reason: "USER_NOT_FOUND",
      requestId: rid,
      durationMs: elapsedMs,
      sessionEmail: sessionEmail ?? null,
      sessionUserId: typeof sessionUserId === "string" ? sessionUserId : null,
    } as any);
    return { ok: true as const };
  }

  const statusRaw = u.subscriptionStatus ?? null;
  const status = statusRaw ? String(statusRaw).toUpperCase() : null;

  const periodEndDate = u.subscriptionCurrentPeriodEnd ?? null;
  const periodEndIso = periodEndDate ? new Date(periodEndDate).toISOString() : null;

  if (status === "PAST_DUE") {
    await emitWriterEvent("ok", {
      phase: "billing_gate" as const,
      ok: false,
      reason: "PAST_DUE",
      requestId: rid,
      durationMs: elapsedMs,
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: periodEndIso,
    } as any);

    return {
      ok: false as const,
      response: paymentRequired("PAST_DUE", {
        subscriptionStatus: status,
        subscriptionCurrentPeriodEnd: periodEndIso,
      }),
    };
  }

  if (status === "CANCELED") {
    if (!periodEndDate) {
      await emitWriterEvent("ok", {
        phase: "billing_gate" as const,
        ok: false,
        reason: "CANCELED_PERIOD_ENDED",
        requestId: rid,
        durationMs: elapsedMs,
        subscriptionStatus: status,
        subscriptionCurrentPeriodEnd: null,
      } as any);

      return {
        ok: false as const,
        response: paymentRequired("CANCELED_PERIOD_ENDED", {
          subscriptionStatus: status,
          subscriptionCurrentPeriodEnd: null,
        }),
      };
    }

    const now = Date.now();
    const end = new Date(periodEndDate).getTime();

    if (!Number.isFinite(end) || now > end) {
      await emitWriterEvent("ok", {
        phase: "billing_gate" as const,
        ok: false,
        reason: "CANCELED_PERIOD_ENDED",
        requestId: rid,
        durationMs: elapsedMs,
        subscriptionStatus: status,
        subscriptionCurrentPeriodEnd: periodEndIso,
      } as any);

      return {
        ok: false as const,
        response: paymentRequired("CANCELED_PERIOD_ENDED", {
          subscriptionStatus: status,
          subscriptionCurrentPeriodEnd: periodEndIso,
        }),
      };
    }
  }

  await emitWriterEvent("ok", {
    phase: "billing_gate" as const,
    ok: true,
    reason: "PASS",
    requestId: rid,
    durationMs: elapsedMs,
    subscriptionStatus: status,
    subscriptionCurrentPeriodEnd: periodEndIso,
  } as any);

  return { ok: true as const };
}

/**
 * L3 編集ルール（設計憲章 v1.0 確定版）を「生成に強制」するための system 注入。
 * - L0/L1/L2（勝利条件/品質定義/出力構成）は変更しない
 * - ここでの役割：出力の"形"と"禁止事項"を、モデル側の挙動として固定する
 */
function buildForcedEditingSystem(): string {
  // 重要：ここは「努力目標」ではなく「制約」
  // 重要：入力に無い固有情報は出さない（推測/捏造禁止）
  return [
    "あなたはEC向け商品説明の編集者です。出力は日本語。以下の制約に必ず従ってください。",
    "",
    "【出力フォーマット（必須・固定）】",
    "1) ヘッド：2文のみ（1文目=用途+主ベネフィット / 2文目=使用シーン）。",
    "2) ボディ：箇条書きは最大3点まで。順番は「コア機能→困りごと解消→汎用価値」。",
    "3) 補助：入力に objections または cta_preference がある場合のみ、その情報に対応する短い追記を1〜2行で許可。無ければ絶対に出さない。",
    "",
    "【禁止事項（必須）】",
    "- 見出し（## や「【】見出し」等）を出さない。",
    "- ヘッドで説明・前置き・水増しをしない（例：「重要」「サポート」「〜でしょう」「おすすめ」「丁寧に」等）。",
    "- 抽象まとめ・同義反復・言い換えの繰り返しをしない。",
    "- 短文化は努力目標ではなく制約。冗長なら削る。",
    "- 固有情報は入力にあるもののみ。推測・捏造・過剰な一般論（例：健康/医療効果、数値根拠、第三者評価）を入れない。",
    "",
    "【断言ワード制御（必須）】",
    "- 「最適」「おすすめ」「ぴったり」「ベスト」「完璧」など“根拠なし断言”は使わない（特にヘッド）。",
    "- 代替表現は「向いています」「便利です」「普段使いしやすいです」「〜に役立ちます」を使う。",
    "- ヘッドは「感じ方（快適・心地よい等）」を書かず、「どうなるか（状態）」だけを書く。",
    "- 例：「快適に過ごせます」→「飲み頃の温度を保ったまま飲めます」/「作業中も温度が変わりにくいです」",
    "- 感情語・評価語（快適/心地よい/ストレスフリー等）は、ヘッドでは禁止（ボディでも極力避ける）。",
    "",
    "【書き方の規則（必須）】",
    "- ヘッド2文はそれぞれ一息で読める長さにする。",
    "- 箇条書きは各1行で簡潔に（最大3行）。",
    "- 句読点は自然に。語尾の連発を避ける。",
    "",
    "出力は本文のみ。コードブロック・注釈・自己評価・説明は書かない。",
  ].join("\n");
}

/**
 * systemOverride はユーザー/上位層から渡りうるが、
 * L3強制の制約を緩めることはできない（強制ルールを先頭に固定注入）。
 */
function composeSystemOverride(forced: string, userOverride: string): string {
  const u = (userOverride ?? "").toString().trim();
  if (!u) return forced;

  return [forced, "", "【追加指示（ただし上の制約は優先）】", u].join("\n");
}

/**
 * meta.template / meta.cta を route.ts で確実に拾う
 * - 目的：UIの選択値がサーバで確実に観測できる状態にする
 * - 実装方針：normalizeInput(rawPrompt) の結果に「上書き/補完」する
 *   （pipeline 側は n.platform / metaCta などを吸収する前提）
 */
function normalizeTemplateKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;

  const low = t.toLowerCase();

  // UI: "lp" | "email" | "sns_short" | "headline_only" 想定
  // 旧: "LP" などの可能性も吸収
  if (low === "lp") return "lp";
  if (low === "email") return "email";
  if (low === "sns_short") return "sns_short";
  if (low === "headline_only") return "headline_only";
  if (low === "sns") return "sns_short";
  if (low === "headline") return "headline_only";

  if (t === "LP") return "lp";
  return low;
}

function normalizeCtaBool(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw !== 0 : null;
  if (typeof raw !== "string") return null;

  const s = raw.trim().toLowerCase();
  if (!s) return null;

  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "1") return true;
  if (s === "0") return false;

  return null;
}

/* =========================
   ✅ UI必須4項目（別フィールド）を n に反映
   - 商品名 / 用途・目的 / 特徴・強み / ターゲット
   - UIキー名の揺れを吸収して安全に補完する
========================= */

function S(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function arrOfStrings(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => S(x)).filter(Boolean);
  const s = S(raw);
  if (!s) return [];
  // 改行/スラッシュ/中点/カンマ/全角スペースで雑に分割（UI入力の揺れ吸収）
  return s
    .split(/[\n\r]+|[\/／]|[・]|[,，]|[　]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function pickFirst(obj: any, keys: string[]): unknown {
  for (const k of keys) {
    if (!k) continue;
    const v = obj?.[k];
    if (v === undefined || v === null) continue;
    // 空文字はスキップ
    if (typeof v === "string" && v.trim().length === 0) continue;
    return v;
  }
  return undefined;
}

function applyUiRequiredFieldsToNormalized(n: any, reqInputAny: any) {
  const root = reqInputAny ?? {};
  const meta = root?.meta ?? {};

  // “別フィールド”候補（UI側の命名揺れを吸収）
  const rawProductName = pickFirst(root, ["productName", "product_name", "product", "name", "title"]);
  const rawGoal = pickFirst(root, ["purpose", "goal", "useCase", "usage", "intent"]);
  const rawSellingPoints = pickFirst(root, ["strengths", "sellingPoints", "selling_points", "features", "featureList"]);
  const rawAudience = pickFirst(root, ["target", "audience", "persona", "customer", "reader"]);

  // meta 内に入ってしまう実装も吸収（念のため）
  const rawProductName2 = pickFirst(meta, ["productName", "product_name", "product", "name", "title"]);
  const rawGoal2 = pickFirst(meta, ["purpose", "goal", "useCase", "usage", "intent"]);
  const rawSellingPoints2 = pickFirst(meta, ["strengths", "sellingPoints", "selling_points", "features", "featureList"]);
  const rawAudience2 = pickFirst(meta, ["target", "audience", "persona", "customer", "reader"]);

  const productName = S(rawProductName ?? rawProductName2);
  const goal = S(rawGoal ?? rawGoal2);
  const audience = S(rawAudience ?? rawAudience2);

  const sellingPointsArr = [
    ...arrOfStrings(rawSellingPoints),
    ...arrOfStrings(rawSellingPoints2),
  ];

  // ✅ “補完 or 上書き” 方針：
  // - UIで必須4項目を入力している前提なので、来ていれば上書き優先。
  if (productName) n.product_name = productName;
  if (goal) n.goal = goal;
  if (audience) n.audience = audience;
  if (sellingPointsArr.length > 0) n.selling_points = sellingPointsArr;

  return {
    productNameLen: productName.length,
    goalLen: goal.length,
    audienceLen: audience.length,
    sellingPointsCount: sellingPointsArr.length,
  };
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const rid = (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  const elapsed = () => Date.now() - t0;

  let model: string | undefined;
  let provider: string | undefined;

  try {
    const ctxResult = await buildWriterRequestContext(req);

    if (!ctxResult.ok) {
      return handleInvalidRequestError(ctxResult.error?.message ?? "invalid request", rid, elapsed());
    }

    // ✅ composedSystem / composedUser は旧設計の残骸。新pipelineでは使わない。
    const { raw: reqInput } = ctxResult.data;

    provider = String((reqInput as any).provider ?? "openai").toLowerCase();
    const rawPrompt = ((reqInput as any).prompt ?? "").toString();
    model = ((reqInput as any).model ?? "gpt-4o-mini").toString();
    const temperature = typeof (reqInput as any).temperature === "number" ? (reqInput as any).temperature : 0.7;

    // ここで受け取る systemOverride は「追加指示」扱いに落とし、L3強制は常に優先させる
    const systemOverrideRaw = (((reqInput as any).system ?? "") as string).toString();

    await writerLog({
      phase: "request",
      model,
      requestId: rid,
    });

    if (!rawPrompt || rawPrompt.trim().length === 0) {
      return handlePromptRequiredError(provider, model, rid, elapsed());
    }

    if (provider !== "openai") {
      return handleUnsupportedProviderError(provider, model, rid, elapsed());
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return handleMissingApiKeyError(provider, model, rid, elapsed());
    }

    // ✅ 課金ゲート（ここで止める）
    const session = await getServerSession(authOptions);
    const gate = await checkSubscriptionGate(session, rid, elapsed());
    if (!gate.ok) return gate.response;

    const n = normalizeInput(rawPrompt) as any;

    // --- UI meta の観測＆補完（template/cta） ---
    const unsafeRawInput = reqInput as any;

    const meta = unsafeRawInput?.meta ?? null;
    const metaTemplate = normalizeTemplateKey(meta?.template);
    const metaCta = normalizeCtaBool(meta?.cta);

    // ✅ pipelineの resolveCtaMode は n.metaCta を見に行くため、ここで渡す（SSOTへの入力）
    if (metaCta !== null) {
      n.metaCta = metaCta;
    }

    // 互換：template を n.platform に反映（pipeline 側が templateKey 判定で拾えるように）
    if (metaTemplate) {
      n.platform = metaTemplate;
    }

    // 互換：cta を n.cta に反映（falseなら確実に無効化）
    // true のときは「既に normalizeInput が詳細文字列を持っている」可能性があるので上書きしすぎない
    if (metaCta === false) {
      n.cta = null;
    } else if (metaCta === true) {
      if (!n.cta) n.cta = "あり";
    }

    // ✅ UI必須4項目（別フィールド）を n に反映（密度Aの土台）
    const required4 = applyUiRequiredFieldsToNormalized(n, unsafeRawInput);

    // --- productId ---
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

    const productContext = productId ? await getProductContextById(productId) : null;

    {
      const payloadPre = {
        phase: "precompose" as const,
        provider,
        model,
        input: {
          category: n.category,
          goal: n.goal,
          platform: n.platform ?? null,
          // 観測用（UIの選択値がサーバに到達しているかを確定させる）
          metaTemplate: metaTemplate ?? null,
          metaCta: metaCta ?? null,
          // 参考：productId有無
          productId: productId ?? null,

          // ✅ 必須4項目が “別フィールドで届いているか” の観測（中身はログに出さない）
          required4,
        },
        hash: {
          prompt_sha256_8: sha256Hex(rawPrompt).slice(0, 8),
        },
      };
      logEvent("ok", payloadPre);
      forceConsoleEvent("ok", payloadPre);
      await emitWriterEvent("ok", payloadPre);
    }

    // ✅ L3編集ルールを system に強制注入（生成の形を固定する）
    const forcedSystem = buildForcedEditingSystem();
    const systemOverride = composeSystemOverride(forcedSystem, systemOverrideRaw);

    // ✅ 新pipelineへ：composedSystem/composedUser は渡さない
    const pipelineResponse = await runWriterPipeline({
      rawPrompt,
      normalized: n,
      provider,
      model,
      temperature,
      systemOverride,
      apiKey,
      t0,
      requestId: rid,
      elapsed,
      productId,
      productContext,
    });

    // --- ✅ SSOT + JSON健全性ガード（最小・原因捕捉用） ---
    // 成功(200)のときだけ「JSONとして読めるか」「data.text/outputが同一か」をここで確定させる。
    // JSONが壊れている場合は壊れたJSONを返さず、500で止める（原因特定の土台）。
    if (pipelineResponse?.status === 200) {
      try {
        const payload = await pipelineResponse.clone().json();

        // okレスポンスのときだけSSOT強制
        if (payload && payload.ok === true && payload.data && typeof payload.data === "object") {
          const textRaw = (payload.data as any).text;
          const finalText = typeof textRaw === "string" ? textRaw : String(textRaw ?? "");

          // SSOT：textは1回だけ確定 → 両方に同一参照
          (payload.data as any).text = finalText;
          (payload as any).output = finalText;

          return NextResponse.json(payload, { status: 200 });
        }

        // okでない / 形が違う場合はそのまま返す（互換維持）
        return pipelineResponse;
      } catch (e) {
        // JSONが壊れている（ConvertFrom-Jsonが落ちる問題のサーバ側検知）
        await emitWriterEvent("ok", {
          phase: "route_json_guard" as const,
          ok: false,
          reason: "PIPELINE_RETURNED_INVALID_JSON",
          requestId: rid,
          durationMs: elapsed(),
          provider: provider ?? null,
          model: model ?? null,
        } as any);

        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "invalid_json_from_pipeline",
              message: "pipeline returned invalid JSON (see server logs / WRITER_EVENT)",
            },
          },
          { status: 500 },
        );
      }
    }

    // 200以外はそのまま返す（エラー互換維持）
    return pipelineResponse;
  } catch (e: unknown) {
    return handleUnexpectedError(e, {
      requestId: rid,
      provider: provider ?? null,
      model: model ?? null,
      durationMs: elapsed(),
    });
  }
}
