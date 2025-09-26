/* eslint-disable react/no-unescaped-entities */
"use client";

import * as React from "react";

/**
 * Step 1.10 A11y 微修正サンプルページ
 * - label ↔ form control を id/for で厳密に関連付け
 * - aria-describedby で補助テキスト/エラーメッセージを関連付け
 * - フィールドグループは fieldset/legend で区切り、Tab順を自然に
 * - エラー時は aria-invalid / role="alert" を付与
 * - ボタンは type を明示（Enter で送信、Tab 移動が正しく動作）
 */

export default function Page() {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const textareaId = "message";
  const helpId = "message-help";
  const errId = "message-error";

  function validate(v: string) {
    if (v.trim().length === 0) return "本文は必須です。";
    if (v.length < 10) return "本文は10文字以上で入力してください。";
    return null;
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-bold">A11y デバッグ：テキスト入力</h1>

      <form
        noValidate
        aria-describedby={error ? errId : undefined}
        onSubmit={(e) => {
          e.preventDefault();
          const nextErr = validate(value);
          setError(nextErr);
          if (!nextErr) {
            // 実運用では submit 処理へ
            alert("送信しました");
          }
        }}
        className="space-y-6"
      >
        <fieldset className="space-y-2">
          <legend className="text-base font-semibold">本文</legend>

          <label htmlFor={textareaId} className="block text-sm font-medium">
            メッセージ本文 <span className="text-red-600" aria-hidden="true">*</span>
          </label>

          <textarea
            id={textareaId}
            name="message"
            required
            aria-required="true"
            aria-describedby={`${helpId}${error ? ` ${errId}` : ""}`}
            aria-invalid={error ? "true" : "false"}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            className="block w-full rounded-xl border px-3 py-2 leading-6 outline-none focus:ring-2 focus:ring-offset-2"
            rows={6}
            placeholder="ここに本文を入力"
          />

          <p id={helpId} className="text-xs text-muted-foreground">
            10文字以上で入力してください。必須項目です。
          </p>

          {error ? (
            <p
              id={errId}
              role="alert"
              className="text-sm text-red-600"
            >
              {error}
            </p>
          ) : null}
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-xl border px-4 py-2 hover:bg-accent/50"
          >
            送信する
          </button>

          <button
            type="button"
            className="rounded-xl border px-4 py-2 hover:bg-accent/50"
            onClick={() => {
              setValue("");
              setError(null);
              const el = document.getElementById(textareaId);
              if (el) (el as HTMLTextAreaElement).focus();
            }}
          >
            クリア
          </button>
        </div>

        <hr className="my-4" />

        <section aria-labelledby="kbd-check" className="space-y-2">
          <h2 id="kbd-check" className="text-base font-semibold">
            キーボード操作の確認ポイント
          </h2>
          <ul className="list-disc pl-6 text-sm">
            <li>Tab で「本文 → 送信 → クリア」の順に移動すること</li>
            <li>Shift+Tab で逆順に移動すること</li>
            <li>Enter で送信（エラー時はエラーが読み上げられる）</li>
          </ul>
        </section>
      </form>
    </main>
  );
}
