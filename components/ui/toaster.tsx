// FILE: components/ui/toaster.tsx
"use client";

// Radix版の useToast({ toasts }) 実装は使いません。
// 既存の sonner 用 Toaster をここでも提供して互換にします。
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return <SonnerToaster richColors position="top-center" />;
}
