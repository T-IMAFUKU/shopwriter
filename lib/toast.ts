// lib/toast.ts
// 旧APIを撤去。src/lib/toast.ts を単純再エクスポートして一本化。

export * from "../src/lib/toast";
export { appToast as default } from "../src/lib/toast";
