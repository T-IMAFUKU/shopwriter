// FILE: app/debug/session/page.tsx
"use client";

// 本番ビルドで失敗しない安全な静的スタブ。
// （後続フェーズで SessionProvider を導入したら、ここを元の実装に戻せます）
export const dynamic = "force-static";

export default function SessionDebugStub() {
  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-2xl font-semibold">Session Debug</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        本番ビルド簡略化のため、デバッグ出力は一時的に無効化しています。
      </p>
    </div>
  );
}
