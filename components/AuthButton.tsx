"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export function AuthButton() {
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated";

  return signedIn ? (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600">
        {session?.user?.name ?? session?.user?.email ?? "繝ｭ繧ｰ繧､繝ｳ荳ｭ"}
      </span>
      <button onClick={() => signOut()} className="rounded-xl border px-3 py-1.5">
        繧ｵ繧､繝ｳ繧｢繧ｦ繝・
      </button>
    </div>
  ) : (
    <button onClick={() => signIn("github")} className="rounded-xl border px-3 py-1.5">
      繧ｵ繧､繝ｳ繧､繝ｳ
    </button>
  );
}
