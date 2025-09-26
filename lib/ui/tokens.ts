/**
 * UIトークン（Step 1.9-2）
 * - 角丸、影、余白など共通スタイルを集中管理
 * - shadcn/ui + Tailwind をベースにクラス名をプリセット化
 */

export const radius = {
  sm: "rounded-md",
  md: "rounded-xl",
  lg: "rounded-2xl",
};

export const shadow = {
  sm: "shadow-sm",
  md: "shadow",
  lg: "shadow-lg",
};

export const spacing = {
  xs: "p-1",
  sm: "p-2",
  md: "p-4",
  lg: "p-6",
};

export const density = {
  compact: "gap-1",
  normal: "gap-2",
  loose: "gap-4",
};

/**
 * まとめて import できるよう export
 */
export const uiTokens = {
  radius,
  shadow,
  spacing,
  density,
};

export default uiTokens;
