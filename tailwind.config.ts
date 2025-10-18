import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

/**
 * Tailwind 統一トークン設定（後方互換フォールバック付き）
 * - 第一次トークン: --radius-*, --shadow-*, --spacing-*
 * - 既存互換   : --ui-radius-*, --ui-shadow-*, --ui-spacing-*
 *   → var(--radius-md, var(--ui-radius-md)) のようにフォールバック
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 基本トークン（globals.css の :root / .dark に対応）
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",

        // 主要UI（brand経由）
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // 追加：成功系（ダッシュボードやトーストで使用）
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
      },

      /**
       * 角丸（radius）
       *  - 第一次: --radius-*
       *  - 互換  : --ui-radius-*
       */
      borderRadius: {
        lg: "var(--radius-lg, var(--ui-radius-lg))",
        md: "var(--radius-md, var(--ui-radius-md))",
        sm: "var(--radius-sm, var(--ui-radius-sm))",
      },

      /**
       * 影（shadow）
       *  - 第一次: --shadow-*
       *  - 互換  : --ui-shadow-*
       */
      boxShadow: {
        // 既存の利用箇所を壊さないために命名は維持＋中身をトークン化
        soft: "var(--shadow-sm, var(--ui-shadow-sm))",
        "soft-md": "var(--shadow-md, var(--ui-shadow-md))",
        // 汎用（必要に応じて）
        sm: "var(--shadow-sm, var(--ui-shadow-sm))",
        md: "var(--shadow-md, var(--ui-shadow-md))",
        lg: "var(--shadow-lg, var(--ui-shadow-lg))",
      },

      /**
       * スペーシング（spacing）
       *  - padding / margin / gap 等で利用できる任意トークン
       *  - 例: p-space-md → class は p-[var(--spacing-md)] を推奨（任意ユーティリティ化）
       */
      spacing: {
        "xs": "var(--spacing-xs, var(--ui-spacing-xs))",
        "sm": "var(--spacing-sm, var(--ui-spacing-sm))",
        "md": "var(--spacing-md, var(--ui-spacing-md))",
        "lg": "var(--spacing-lg, var(--ui-spacing-lg))",
        "xl": "var(--spacing-xl, var(--ui-spacing-xl))",
        "2xl": "var(--spacing-2xl, var(--ui-spacing-2xl))",
        // レイアウト系（セクション余白・ガター）
        "section": "var(--spacing-section, var(--ui-spacing-section))",
        "gutter": "var(--spacing-gutter, var(--ui-spacing-gutter))",
      },

      // ボタン用（高さなど任意ユーティリティ）
      height: {
        btn: "var(--btn-h)",
      },

      // フォント（必要なら後日差し替え）
      fontFamily: {
        sans: [...fontFamily.sans],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
