"use client";

// useToast を "@/hooks/use-toast" に統一するための薄いラッパー（sonner を利用）
import { toast as sonnerToast } from "sonner";

export type ToastParam = Parameters<typeof sonnerToast>[0];

// 既存コードの { toast } 想定を満たす
export function useToast() {
  return { toast: sonnerToast };
}

// ダイレクト import 用
export const toast = sonnerToast;
