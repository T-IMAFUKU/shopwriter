// tailwind.config.js — Project Baseline (ShopWriter)
// Next.js 15 / Tailwind 3.4 / shadcn/ui
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./pages/**/*.{ts,tsx}",
  ],
  theme: {
    // レイアウト幅（共通基準）
    container: {
      center: true,
      padding: "1rem", // 16px（基準）
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1400px",
      },
    },
    extend: {
      // 配色（globals.cssのCSS変数に追従：変更なし）
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
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
      },

      // 角丸：プロジェクト固定値（基準=lg=12px）
      borderRadius: {
        none: "0px",
        sm: "6px",
        DEFAULT: "8px",
        md: "10px",
        lg: "12px",    // 基準
        xl: "14px",
        "2xl": "16px",
        "3xl": "20px",
        full: "9999px",
      },

      // 影：段階を固定（基準=shadow-sm / hover: md / モーダル: lg）
      boxShadow: {
        sm: "0 1px 2px 0 hsl(0 0% 0% / 0.08)",
        DEFAULT:
          "0 1px 3px 0 hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.08)",
        md: "0 4px 6px -1px hsl(0 0% 0% / 0.12), 0 2px 4px -2px hsl(0 0% 0% / 0.10)",
        lg: "0 10px 15px -3px hsl(0 0% 0% / 0.14), 0 4px 6px -4px hsl(0 0% 0% / 0.12)",
        xl: "0 20px 25px -5px hsl(0 0% 0% / 0.16), 0 10px 10px -5px hsl(0 0% 0% / 0.10)",
      },

      // shadcn/ui（変更なし）
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
