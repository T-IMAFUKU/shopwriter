// src/lib/stripe.ts
// Stripe クライアントのシングルトン（サーバーサイド専用）
// - /api/* の Route Handler や Server Action からのみ利用する想定
// - クライアントコンポーネントからは直接 import しないこと
//
// ⚠️ 重要（CI/smoke対策）:
// - import 時点で Stripe Key が無いだけで throw すると、CI build が落ちる。
// - そのため「import 時は落とさない」設計にする。
// - 実際に stripe を使ったタイミング（プロパティアクセス）でだけ明確にエラーにする。
//
// 追加方針（E2E/本番事故防止）:
// - 本番(Production)は Live を優先して参照できるようにする。
// - Preview/Local は Test を優先できるようにする。
// - ただし既存の STRIPE_SECRET_KEY / STRIPE_PRICE_ID_PRO だけでも動く（後方互換）。

import Stripe from "stripe";

type StripeMode = "live" | "test" | "unknown";

function inferStripeModeFromKey(key: string | undefined): StripeMode {
  if (!key) return "unknown";
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return "unknown";
}

function isVercelProd(): boolean {
  // Vercel の production 判定（ローカルでも NODE_ENV=production の可能性はあるが、基本は VERCEL_ENV を優先）
  // - VERCEL_ENV: "production" | "preview" | "development"
  const ve = process.env.VERCEL_ENV;
  if (ve) return ve === "production";
  return process.env.NODE_ENV === "production";
}

function resolveStripeSecretKey(): string | undefined {
  // 互換：従来の単一キー
  const legacy = process.env.STRIPE_SECRET_KEY;

  // 新：モード別キー（入れてあればこちらを優先）
  const live = process.env.STRIPE_SECRET_KEY_LIVE;
  const test = process.env.STRIPE_SECRET_KEY_TEST;

  // 強制モード（任意）："live" | "test"
  const forced = (process.env.STRIPE_MODE ?? "").toLowerCase();

  if (forced === "live") return live ?? legacy;
  if (forced === "test") return test ?? legacy;

  // 本番はLive優先、Preview/LocalはTest優先（ただし未設定なら legacy にフォールバック）
  if (isVercelProd()) return live ?? legacy;
  return test ?? legacy;
}

function resolveProPriceId(): string | undefined {
  const legacy = process.env.STRIPE_PRICE_ID_PRO;

  const live = process.env.STRIPE_PRICE_ID_PRO_LIVE;
  const test = process.env.STRIPE_PRICE_ID_PRO_TEST;

  const forced = (process.env.STRIPE_MODE ?? "").toLowerCase();

  if (forced === "live") return live ?? legacy;
  if (forced === "test") return test ?? legacy;

  if (isVercelProd()) return live ?? legacy;
  return test ?? legacy;
}

const secretKey = resolveStripeSecretKey();

// 触った瞬間にだけ落ちる Stripe（CI build を通すための遅延失敗）
const stripeProxy = new Proxy({} as Stripe, {
  get(_target, _prop) {
    throw new Error(
      "Missing Stripe secret key environment variable. " +
        "Set STRIPE_SECRET_KEY (legacy) or STRIPE_SECRET_KEY_LIVE/TEST in your .env.local / Vercel Project Env before using Stripe.",
    );
  },
});

/**
 * Stripe の公式 Node.js SDK クライアント。
 *
 * メモ:
 * - apiVersion は SDK / アカウント側のデフォルトを利用する。
 * - 明示的にバージョンを固定したくなったら、オプションで apiVersion を指定する。
 */
export const stripe: Stripe = secretKey
  ? new Stripe(secretKey, {
      // 例: 明示的に固定したくなったらコメントアウトを外す
      // apiVersion: "2024-06-20",
    })
  : stripeProxy;

/**
 * ShopWriter 有料プラン（Pro）の Price ID を取得するヘルパー。
 *
 * - STRIPE_PRICE_ID_PRO(legacy) または STRIPE_PRICE_ID_PRO_LIVE/TEST を参照。
 * - 未設定の場合はエラーにして fail-fast。
 *
 * ⚠️ CI/smoke:
 * - ここは「呼ばれたら」エラーでOK（呼ばれない限り build は落ちない）。
 */
export function getProPlanPriceId(): string {
  const priceId = resolveProPriceId();

  if (!priceId) {
    const mode = inferStripeModeFromKey(secretKey);
    throw new Error(
      "Missing Stripe Price ID environment variable. " +
        "Set STRIPE_PRICE_ID_PRO (legacy) or STRIPE_PRICE_ID_PRO_LIVE/TEST. " +
        `Detected secret key mode: ${mode}.`,
    );
  }

  return priceId;
}

/**
 * 公開可能キー（Publishable key）を取得するヘルパー。
 *
 * - クライアント側で Stripe.js を初期化したい場合に使う。
 * - サーバーサイドのみで使うケースもあるため、ここでは throw せずに undefined を許容する。
 */
export function getStripePublishableKey(): string | undefined {
  return process.env.STRIPE_PUBLISHABLE_KEY;
}
