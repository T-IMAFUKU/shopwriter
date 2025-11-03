// vitest.config.ts （全文置換）
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // ✅ tsconfig.json の paths をそのまま解決（@/* -> src/*）
  plugins: [tsconfigPaths()],

  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
    reporters: ["default"],

    // ✅ 実APIが 12–16s に及ぶケースに備え timeout 拡張
    testTimeout: 30000,
    hookTimeout: 30000,

    // ✅ 実APIが並列で詰まるのを防止
    sequence: { concurrent: false },

    // ✅ ネットワーク揺らぎ対策の軽い再試行
    retry: 1,

    /**
     * 共通モック／セットアップ
     * ※ .env の読み込みは PowerShell 側の
     *   NODE_OPTIONS(--require ./tests/preload-env.cjs)
     *   に任せるため、ここでは .env 系 setup は行わない。
     */
    setupFiles: ["tests/setup.writers.ts"],
  },
});
