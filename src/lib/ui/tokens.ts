// src/lib/ui/tokens.ts
// UIトークン（最小セット）。必要に応じて増やす。

export const radius = {
  sm: "0.375rem",  // 6px
  md: "0.5rem",    // 8px
  lg: "1rem",      // 16px
  xl: "1.25rem",   // 20px
} as const;

export const spacing = {
  xs: "0.25rem",   // 4px
  sm: "0.5rem",    // 8px
  md: "0.75rem",   // 12px
  lg: "1rem",      // 16px
  xl: "1.5rem",    // 24px
  "2xl": "2rem",   // 32px
} as const;

export type RadiusKey = keyof typeof radius;
export type SpacingKey = keyof typeof spacing;
