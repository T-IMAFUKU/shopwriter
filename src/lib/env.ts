// src/lib/env.ts
// 目的：環境変数の「ダミー／デフォルト注入」を全面禁止し、必須チェックを一元化。
//       OPENAIキーを含む重要値は "必須"。欠落時は即時に明確エラーで落とす。
//       ※ テストをモックで回す場合は WRITER_PROVIDER=mock を明示設定してください。

import { z } from "zod";

// Postgres URL (postgres:// or postgresql://) 判定用
const pgUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must start with postgres:// or postgresql://");

// URL だがローカルも許可したい値（NEXTAUTH_URLなど）
const anyUrl = z.string().min(4, "URL-like string required");

// 必須キーは "min(1)" 以上（＝空やダミー不可）。デフォルト値は付けない！
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Writer/AI
  WRITER_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
  OPENAI_API_KEY: z
    .string({ required_error: "OPENAI_API_KEY is required" })
    .min(20, "OPENAI_API_KEY looks too short"),

  // DB / Auth
  DATABASE_URL: pgUrl,
  NEXTAUTH_URL: anyUrl,
  GITHUB_ID: z.string().min(1, "GITHUB_ID is required"),
  GITHUB_SECRET: z.string().min(1, "GITHUB_SECRET is required"),

  // 任意（保険）
  PRISMA_MIGRATE_SKIP: z.string().optional(),
});

// 解析
const parsed = EnvSchema.safeParse(process.env);

// 失敗時：どのキーが問題かを一覧で出力して即停止
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error("\n[env] Invalid environment variables:\n" + issues + "\n");
  throw new Error("Invalid environment. Fix your .env(.local/.test.local) before running.");
}

// 特別ルール：WRITER_PROVIDER=mock の時だけ OPENAI_API_KEY を使わない運用を許可
// （Schemaは必須にしているので、mock運用にしたい場合は tests/setup など別レイヤで扱う選択もOK）
export const env = parsed.data;

// 補助：実行時ヘルスログ（秘匿のためキー先頭のみ）
if (process.env.NODE_ENV === "test") {
  const head = (env.OPENAI_API_KEY || "").slice(0, 12);
  // eslint-disable-next-line no-console
  console.log(`[env] OPENAI_API_KEY_HEAD: ${head}... LEN=${env.OPENAI_API_KEY.length}`);
}
