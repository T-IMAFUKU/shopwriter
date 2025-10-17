// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
    reporters: ["default"],
    /**
     * ✅ 共通モックを常時読込（OpenAI/next-auth をネットワーク遮断）
     * ※ .env の読み込みは PowerShell で設定した NODE_OPTIONS(--require ./tests/preload-env.cjs)
     *    に任せるため、ここでは .env 系の setup は行いません。
     */
    setupFiles: ["tests/setup.writers.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
