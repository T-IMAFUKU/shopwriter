"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export function AuthButton() {
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated";

  return signedIn ? (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600">
        {session?.user?.name ?? session?.user?.email ?? "ログイン中"}
      </span>
      <button onClick={() => signOut()} className="rounded-xl border px-3 py-1.5">
        サインアウト
      </button>
    </div>
  ) : (
    <button onClick={() => signIn("github")} className="rounded-xl border px-3 py-1.5">
      サインイン
    </button>
  );
}
