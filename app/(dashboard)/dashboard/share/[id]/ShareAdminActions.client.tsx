"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

type ShareAdminActionsProps = {
  shareId: string;
  isPublic: boolean;
  publicPath: string;
  publicUrl: string;
  isDev: boolean;
  devUserId: string | null;
};

type PatchPayload = {
  id?: string;
  isPublic: boolean;
};

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const json = (await res.json()) as {
        error?: unknown;
        message?: unknown;
        code?: unknown;
      };

      if (typeof json.error === "string" && json.error.trim()) return json.error;
      if (typeof json.message === "string" && json.message.trim()) return json.message;
      if (typeof json.code === "string" && json.code.trim()) return json.code;
      return "";
    }

    const text = await res.text();
    return text ? text.slice(0, 200) : "";
  } catch {
    return "";
  }
}

async function copyText(text: string): Promise<void> {
  const value = text.trim();
  if (!value) throw new Error("コピーする内容がありません。");

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!ok) {
    throw new Error("コピーに失敗しました。");
  }
}

export default function ShareAdminActions({
  shareId,
  isPublic,
  publicPath,
  publicUrl,
  isDev,
  devUserId,
}: ShareAdminActionsProps) {
  const router = useRouter();
  const [currentIsPublic, setCurrentIsPublic] = useState(isPublic);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isToggling, setIsToggling] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setCurrentIsPublic(isPublic);
  }, [isPublic]);

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [message]);

  async function patchShare(url: string, payload: PatchPayload): Promise<Response> {
    const extraHeaders: Record<string, string> = {};

    if (isDev && devUserId) {
      extraHeaders["x-user-id"] = devUserId;
    }

    return fetch(url, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...extraHeaders,
      },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
  }

  async function handleTogglePublic() {
    if (isToggling) return;

    setError("");
    setMessage("切り替え中…");
    setIsToggling(true);

    const nextIsPublic = !currentIsPublic;

    try {
      let res = await patchShare(`/api/shares/${encodeURIComponent(shareId)}`, {
        isPublic: nextIsPublic,
      });

      if (res.status === 405) {
        res = await patchShare("/api/shares", {
          id: shareId,
          isPublic: nextIsPublic,
        });
      }

      if (res.status === 401 || res.status === 403) {
        window.location.href = "/api/auth/signin";
        return;
      }

      if (!res.ok) {
        const errorMessage = await readErrorMessage(res);
        throw new Error(errorMessage || `切り替えに失敗しました（HTTP ${res.status}）。`);
      }

      setCurrentIsPublic(nextIsPublic);
      setMessage("更新しました");

      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setMessage("");
      setError(e instanceof Error ? e.message : "切り替えに失敗しました。");
    } finally {
      setIsToggling(false);
    }
  }

  async function handleCopyUrl() {
    setError("");

    try {
      await copyText(publicUrl);
      setMessage("コピーしました");
    } catch (e) {
      setMessage("");
      setError(e instanceof Error ? e.message : "コピーに失敗しました。");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          variant={currentIsPublic ? "outline" : "primary"}
          onClick={handleTogglePublic}
          disabled={isToggling}
          aria-busy={isToggling}
          aria-label="公開/非公開を切り替える"
        >
          {isToggling ? "切り替え中…" : currentIsPublic ? "非公開にする" : "公開にする"}
        </Button>

        <Button type="button" variant="secondary" onClick={handleCopyUrl} aria-label="共有URLをコピー">
          共有URLをコピー
        </Button>

        <Button asChild variant="outline">
          <Link href={publicPath} prefetch={false}>
            公開ページを見る
          </Link>
        </Button>

        {message ? <span className="self-center pl-1 text-xs text-muted-foreground">{message}</span> : null}
      </div>

      {error ? <div className="text-xs text-destructive">{error}</div> : null}
    </div>
  );
}

export function ShareAdminBodyCopyButton({ body }: { body: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => {
      setMessage("");
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [message]);

  async function handleCopyBody() {
    setError("");

    try {
      await copyText(body);
      setMessage("コピーしました");
    } catch (e) {
      setMessage("");
      setError(e instanceof Error ? e.message : "コピーに失敗しました。");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        disabled={!body}
        aria-disabled={!body}
        onClick={handleCopyBody}
        aria-label="本文をコピー"
      >
        本文をコピー
      </Button>

      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
