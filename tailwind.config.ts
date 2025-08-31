/** @type {import('tailwindcss').Config} */
import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(221 39% 11%)", foreground: "hsl(0 0% 100%)" },
        secondary: { DEFAULT: "hsl(210 40% 96%)", foreground: "hsl(221 39% 11%)" },
        muted: { DEFAULT: "hsl(210 40% 96%)", foreground: "hsl(215 16% 47%)" },
        accent: { DEFAULT: "hsl(210 40% 96%)", foreground: "hsl(221 39% 11%)" },
        destructive: { DEFAULT: "hsl(0 84% 60%)", foreground: "hsl(0 0% 98%)" },
        card: { DEFAULT: "hsl(0 0% 100%)", foreground: "hsl(221 39% 11%)" },
      },
      borderRadius: { lg: "0.75rem", xl: "1rem", "2xl": "1.25rem" },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
}

export default config
