import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind クラス結合ヘルパー（shadcn/ui準拠） */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
