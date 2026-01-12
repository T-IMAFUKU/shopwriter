"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export function AuthButton() {
  const { status } = useSession();
  const signedIn = status === "authenticated";

  // B仕様：常に「ログイン/ログアウト」だけ（ユーザー名は表示しない）
  if (signedIn) {
    return (
      <button
        type="button"
        onClick={() => signOut()}
        className="rounded-xl border px-3 py-1.5 text-sm hover:bg-muted"
      >
        ログアウト
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signIn("github")}
      className="rounded-xl border px-3 py-1.5 text-sm hover:bg-muted"
    >
      ログイン
    </button>
  );
}
