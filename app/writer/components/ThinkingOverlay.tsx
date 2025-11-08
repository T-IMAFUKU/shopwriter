"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ThinkingOverlay — 出力欄の先頭に「擬似思考ログ」を表示（ChatGPT風）
 * LEVEL3 安定版（prod差異吸収）:
 *  - 回転は「visible===true」に連動して確実に起動（Busy依存を排除）
 *  - 5秒おきに自己復活ガード（ブラウザ/バックグラウンドのタイマー抑制対策）
 *  - Busy(=生成中) が true の間は必ず可視化（本文0文字でも隠さない）
 *  - hide条件は「Busy=false かつ テキスト伸びが INACTIVITY_MS 超停止」
 *  - 最低表示保証(MIN_SHOW_MS)と僅かなフェード猶予(HIDE_DELAY_MS)
 */

type Phase = "start" | "intro" | "outline" | "body" | "cta" | "closing" | "idle";
type Host = { container: HTMLElement; portal: HTMLElement } | null;

const OUTPUT_SELECTORS = [
  ".prose",
  "article.prose",
  "[data-writer-output]",
  "#writer-output",
  "[data-testid='writer-output']",
  ".output-card .prose",
  ".output-card",
  "section[aria-label='出力']",
  "section[aria-label*='出力']:not([aria-label*='通知']):not([aria-label*='announce'])",
  "section[aria-live='polite']:not(next-route-announcer *):not([id*='route-announcer'])",
  ".prose pre",
  "article pre",
  "#output",
] as const;

const SUBMIT_BTN_SELECTOR =
  "form button[type='submit'], form [data-action='generate'], [data-testid='writer-submit']";

const INACTIVITY_MS = 1500; // 本文が伸びない時間の閾値
const ROTATE_MS = 1100; // メッセージ回転間隔
const HIDE_DELAY_MS = 400; // 完了後のフェード猶予
const MIN_SHOW_MS = 900; // 最低表示保証（チラつき防止）
const REVIVE_GUARD_MS = 5000; // タイマー自己復活ガード
const MAX_LINE_LEN = 80;

const PHRASES: Record<Phase, string[]> = {
  start: ["見出し案を洗い出しています…", "入力の意図を要約中…", "文体とトーンを最適化中…"],
  intro: ["導入文を組み立てています…", "最初の一文を磨いています…", "読みやすい導入を設計中…"],
  outline: ["要点の箇条書きを整理中…", "章立ての順番を検討中…", "論点の抜け漏れを確認中…"],
  body: ["本文の論理を展開しています…", "具体例と根拠を肉付け中…", "読みやすい段落に整形中…"],
  cta: ["CTAの言い回しを比較中…", "行動を促すフレーズを調整中…", "ラスト1文のトーンを合わせています…"],
  closing: ["締めのまとめを整えています…", "全体の流れを最終チェック中…", "読み終わりの余韻を調整中…"],
  idle: ["構想を始めています…"],
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const choose = (arr: string[], avoid?: string) => {
  if (!arr.length) return "";
  const pool = avoid ? arr.filter((s) => s !== avoid) : arr;
  const list = pool.length ? pool : arr;
  return list[Math.floor(Math.random() * list.length)];
};

function sanitizeLine(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  if (t.length > MAX_LINE_LEN) t = t.slice(0, MAX_LINE_LEN - 1) + "…";
  return t;
}
function isNoise(el: Element | null) {
  if (!el) return true;
  if (el.closest("next-route-announcer")) return true;
  const id = (el as HTMLElement).id || "";
  if (id.includes("route-announcer")) return true;
  return false;
}
function queryOutputEl(): HTMLElement | null {
  for (const sel of OUTPUT_SELECTORS) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el || isNoise(el)) continue;
    return el;
  }
  return null;
}
function ensureHost(): Host {
  const container = queryOutputEl();
  if (!container) return null;
  const existed = container.querySelector<HTMLElement>("[data-thinking-host='1']");
  if (existed) return { container, portal: existed };
  const portal = document.createElement("div");
  portal.setAttribute("data-thinking-host", "1");
  container.insertBefore(portal, container.firstChild);
  return { container, portal };
}

// 本文→フェーズ推定
function inferPhase(text: string): Phase {
  const L = text.length;
  const h1 = /^#\s+.+/m.test(text);
  const h2 = /^##\s+.+/m.test(text);
  const bullets = (text.match(/(^|\n)\s*(?:・|\*|-|\d+\.)\s+/g) || []).length;
  const cta = /(購入|お申込み|お問い合わせ|詳細はこちら|今すぐ|申し込み)/.test(text);
  const closing = /(まとめ|要約|結論|最後に)/.test(text);

  if (L < 5) return "start";
  if (!h1 && L < 60) return "intro";
  if ((h1 || h2) && L < 160) return "outline";
  if (bullets >= 2 && L < 400) return "body";
  if (cta) return "cta";
  if (closing || L > 600) return "closing";
  return "body";
}

// Busy(=生成中) 厳密判定：disabledは含めない
function isGeneratingNow(btn: HTMLButtonElement): boolean {
  const txt = (btn.textContent || "").trim();
  const busy =
    btn.getAttribute("aria-busy") === "true" ||
    btn.getAttribute("data-state") === "loading" ||
    btn.classList.contains("loading") ||
    /(生成しています|生成中|実行中|考えています|running|loading|processing)/.test(txt);
  return !!busy;
}
function detectSubmitButton(): HTMLButtonElement | null {
  return document.querySelector(SUBMIT_BTN_SELECTOR) as HTMLButtonElement | null;
}

export default function ThinkingOverlay() {
  const [host, setHost] = useState<Host>(null);
  const [label, setLabel] = useState("構想を始めています…");
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(false);

  // 状態/ガード
  const busyRef = useRef(false); // 最新のBusy状態
  const prevBusyRef = useRef(false);
  const shownRef = useRef(false);

  // 進捗
  const lastLenRef = useRef(0);
  const lastChangeAtRef = useRef(0);
  const showStartedAtRef = useRef(0);
  const rotateTimerRef = useRef<number | null>(null);
  const reviveGuardRef = useRef<number | null>(null);

  const getText = useMemo(() => {
    return () => queryOutputEl()?.innerText ?? "";
  }, []);

  function showNow() {
    if (shownRef.current) return;
    const h = ensureHost();
    setHost(h);
    if (!h) return;

    shownRef.current = true;
    setVisible(true);
    setActive(true);
    setLabel(choose(PHRASES.start));
    showStartedAtRef.current = performance.now();
    lastLenRef.current = 0;
    lastChangeAtRef.current = Date.now();
  }

  function hideSoon() {
    if (!shownRef.current) return;
    const rest = clamp(
      MIN_SHOW_MS - (performance.now() - showStartedAtRef.current),
      0,
      MIN_SHOW_MS
    );
    window.setTimeout(() => {
      setActive(false);
      setVisible(false);
      // DOM掃除（残留防止）
      if (host?.portal && host.portal.parentNode) {
        host.portal.parentNode.removeChild(host.portal);
      }
      setHost(null);
      shownRef.current = false;
    }, rest + HIDE_DELAY_MS);
  }

  // 🔁 回転：visible に連動させる（Busy依存をやめる）
  useEffect(() => {
    const clearRotate = () => {
      if (rotateTimerRef.current) {
        window.clearInterval(rotateTimerRef.current);
        rotateTimerRef.current = null;
      }
    };
    const clearRevive = () => {
      if (reviveGuardRef.current) {
        window.clearInterval(reviveGuardRef.current);
        reviveGuardRef.current = null;
      }
    };

    if (visible) {
      // 直ちに回転を開始
      if (!rotateTimerRef.current) {
        rotateTimerRef.current = window.setInterval(() => {
          const phase = inferPhase(getText());
          setLabel((prev) => choose(PHRASES[phase] || PHRASES.idle, prev));
        }, ROTATE_MS) as unknown as number;
      }
      // タイマー自己復活ガード
      if (!reviveGuardRef.current) {
        reviveGuardRef.current = window.setInterval(() => {
          if (!rotateTimerRef.current) {
            rotateTimerRef.current = window.setInterval(() => {
              const phase = inferPhase(getText());
              setLabel((prev) => choose(PHRASES[phase] || PHRASES.idle, prev));
            }, ROTATE_MS) as unknown as number;
          }
        }, REVIVE_GUARD_MS) as unknown as number;
      }
    } else {
      clearRotate();
      clearRevive();
    }

    // タブが非表示→表示のときも復活
    const onVis = () => {
      if (document.visibilityState === "visible" && visible && !rotateTimerRef.current) {
        rotateTimerRef.current = window.setInterval(() => {
          const phase = inferPhase(getText());
          setLabel((prev) => choose(PHRASES[phase] || PHRASES.idle, prev));
        }, ROTATE_MS) as unknown as number;
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearRotate();
      clearRevive();
    };
  }, [visible, getText]);

  // 単発監視：Busy と 出力伸び を観測（show/hide のみ担当）
  useEffect(() => {
    const root = document.body;
    if (!root) return;

    const watchSubmit = () => {
      const btn = detectSubmitButton();
      if (!btn) return;

      const nowBusy = isGeneratingNow(btn);
      busyRef.current = nowBusy;
      const prev = prevBusyRef.current;

      if (nowBusy && !prev) {
        showNow(); // 生成開始：即表示
      }
      // 完了時は tick 側で inactivity とANDで hide 判定
      prevBusyRef.current = nowBusy;
    };

    const tick = () => {
      // 出力テキスト進捗
      const t = getText();
      const len = t.length;
      if (len > lastLenRef.current) {
        lastLenRef.current = len;
        lastChangeAtRef.current = Date.now();
      }

      // Busy中は必ず表示維持
      if (busyRef.current && shownRef.current) {
        if (!visible) setVisible(true);
        if (!active) setActive(true);
      }

      // hide条件：Busy=false AND テキスト伸びが INACTIVITY_MS 超停止
      const stopByInactivity = Date.now() - lastChangeAtRef.current > INACTIVITY_MS;
      if (!busyRef.current && shownRef.current && stopByInactivity) {
        hideSoon();
      }

      // hostの再作成（無ければ単発）
      if (!host || (host && !document.contains(host.portal))) {
        const h = ensureHost();
        if (h) setHost(h);
      }
    };

    // 初期実行
    watchSubmit();
    tick();

    // 監視
    const submitObserver = new MutationObserver(watchSubmit);
    submitObserver.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    const obs = new MutationObserver(() => {
      watchSubmit();
      tick();
    });
    obs.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });

    const id = window.setInterval(() => {
      watchSubmit();
      tick();
    }, 300);

    return () => {
      submitObserver.disconnect();
      obs.disconnect();
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, visible, active, getText]);

  if (!host || !visible) return null;

  return createPortal(
    <div
      className={[
        "pointer-events-none",
        "transition-opacity duration-200 ease-in-out",
        active ? "opacity-100" : "opacity-0",
      ].join(" ")}
      style={{ marginBottom: "0.5rem" }}
      aria-live="polite"
    >
      <div className="inline-flex items-center rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
        <span className="font-medium">{sanitizeLine(label)}</span>
        <span className="ml-1 inline-block animate-pulse">…</span>
      </div>
    </div>,
    host.portal
  );
}
