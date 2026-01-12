// FILE: app/debug/session/page.tsx
"use client";

import { useEffect, useState } from "react";

type SessionJson = Record<string, unknown> | null;

export default function DebugSessionPage() {
  const [session, setSession] = useState<SessionJson>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "include",
          headers: { accept: "application/json" },
          cache: "no-store",
        });

        const text = await res.text();
        const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

        if (!cancelled) setSession(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setSession(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-2xl font-semibold">Session Debug</h1>

      <p className="mt-2 text-sm text-muted-foreground">
        ブラウザのログインCookieがある場合に限り、/api/auth/session の内容が表示されます。
      </p>

      <div className="mt-6 rounded-lg border bg-background p-4">
        {loading ? (
          <p className="text-sm">loading...</p>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-destructive">error</p>
            <pre className="whitespace-pre-wrap break-words text-sm">{error}</pre>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words text-sm">
            {JSON.stringify(session, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
