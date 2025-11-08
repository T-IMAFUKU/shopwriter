"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * ThinkingOverlay — 出力欄の先頭に「擬似思考ログ」を表示（ChatGPT風）
 * LEVEL3-final（テンポ/Easing/初回遅延）
 *  - 1.0〜1.2s帯の自然な切替（既定= 1100ms）
 *  - フェードに ease-in-out を追加して自然化
 *  - 初回切替は 1周期待つ（初期表示→1.1s後に最初の切替）
 *  - Busy中は常時表示 / 完了後は自然フェード→DOM除去
 *  - hide条件: Busy=false && inactivity>INACTIVITY_MS（MIN_SHOW_MS保証）
 *  - タイマー多重防止 / 監視useEffectはマウント1回のみ
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
  "form button[type='submit'], form [data-action='generate']";

/** ==== Tunables（必要ならここだけ触る） ==== */
const INACTIVITY_MS = 1500; // 本文が伸びない時間の閾値
const ROTATE_MS = 1100;     // メッセージ回転間隔（体感：1000/1100/1200が推奨）
const HIDE_DELAY_MS = 200;  // 完了後のフェード猶予
const MIN_SHOW_MS = 900;    // 最低表示保証（チラつき防止）
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

// 全Phaseを連結し、重複除去したグローバル回転リスト
const GLOBAL_MESSAGES = Array.from(
  new Set(
    (Object.keys(PHRASES) as Phase[]).flatMap((k) => PHRASES[k])
  )
);

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

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

// 出力テキスト（オーバーレイ自身を除外して取得）
function getOutputTextSansOverlay(host: Host): string {
  const container = host?.container ?? queryOutputEl();
  if (!container) return "";
  let acc = "";
  container.childNodes.forEach((node) => {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).getAttribute?.("data-thinking-host") === "1"
    ) {
      return; // overlay自身はスキップ
    }
    acc += (node as HTMLElement | ChildNode)?.textContent ?? "";
  });
  return acc;
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

  const busyRef = useRef(false);
  const prevBusyRef = useRef(false);
  const shownRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);

  const lastLenRef = useRef(0);
  const lastChangeAtRef = useRef(0);
  const showStartedAtRef = useRef(0);

  // 回転系タイマー
  const rotateTimerRef = useRef<number | null>(null);
  const initialRotateDelayRef = useRef<number | null>(null);

  // グローバル回転インデックス（フェーズ配列が1件でも強制で進む）
  const globalIdxRef = useRef(0);

  // hostの参照を回転処理から見えるように保持
  const hostRef = useRef<Host>(null);
  useEffect(() => {
    hostRef.current = host;
  }, [host]);

  // 出力テキスト取得（オーバーレイ自身を除外）
  const getText = useMemo(() => {
    return () => getOutputTextSansOverlay(hostRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nextGlobalMessage(prev?: string) {
    let idx = (globalIdxRef.current + 1) % GLOBAL_MESSAGES.length;
    if (GLOBAL_MESSAGES[idx] === prev) {
      idx = (idx + 1) % GLOBAL_MESSAGES.length;
    }
    globalIdxRef.current = idx;
    return GLOBAL_MESSAGES[idx];
  }

  function startRotate() {
    if (rotateTimerRef.current || initialRotateDelayRef.current) return;

    // 初回は1周期分だけ遅らせて自然化（初期表示→1.1s後に最初の切替）
    initialRotateDelayRef.current = window.setTimeout(() => {
      setLabel((prev) => nextGlobalMessage(prev));
      // 以後は等間隔ローテーション
      rotateTimerRef.current = window.setInterval(() => {
        const text = getText(); // overlay除外済み
        const phase = inferPhase(text);
        const list = PHRASES[phase] || PHRASES.idle;
        setLabel((prev) => {
          if (list.length >= 2) {
            const candidates = list.filter((s) => s !== prev);
            const choice =
              candidates[Math.floor(Math.random() * candidates.length)] ??
              list[0];
            if (choice === prev) return nextGlobalMessage(prev);
            return choice;
          } else {
            return nextGlobalMessage(prev);
          }
        });
      }, ROTATE_MS) as unknown as number;

      // 初回ディレイ完了マーク
      if (initialRotateDelayRef.current) {
        clearTimeout(initialRotateDelayRef.current);
        initialRotateDelayRef.current = null;
      }
    }, ROTATE_MS) as unknown as number;
  }

  function stopRotate() {
    if (initialRotateDelayRef.current) {
      clearTimeout(initialRotateDelayRef.current);
      initialRotateDelayRef.current = null;
    }
    if (rotateTimerRef.current) {
      clearInterval(rotateTimerRef.current);
      rotateTimerRef.current = null;
    }
  }

  function showNow() {
    if (shownRef.current) return;
    const h = ensureHost();
    setHost(h);
    if (!h) return;
    shownRef.current = true;

    setVisible(true);
    setActive(true);
    setLabel(GLOBAL_MESSAGES[globalIdxRef.current] ?? "構想を始めています…");
    showStartedAtRef.current = performance.now();
    lastLenRef.current = 0;
    lastChangeAtRef.current = Date.now();
    startRotate();
  }

  function hideSoon() {
    if (!shownRef.current || hideTimerRef.current) return;
    const rest = clamp(MIN_SHOW_MS - (performance.now() - showStartedAtRef.current), 0, MIN_SHOW_MS);
    hideTimerRef.current = window.setTimeout(() => {
      setActive(false);
      setTimeout(() => {
        setVisible(false);
        if (hostRef.current?.portal?.parentNode) hostRef.current.portal.parentNode.removeChild(hostRef.current.portal);
        setHost(null);
        shownRef.current = false;
        hideTimerRef.current = null;
        stopRotate();
      }, HIDE_DELAY_MS);
    }, rest);
  }

  // 監視はマウント1回のみ（依存=[]）— 途中のstate変化でcleanupしない
  useEffect(() => {
    const root = document.body;
    if (!root) return;

    const watchSubmit = () => {
      const btn = detectSubmitButton();
      if (!btn) return;
      const nowBusy = isGeneratingNow(btn);
      busyRef.current = nowBusy;
      const prev = prevBusyRef.current;
      if (nowBusy && !prev) showNow();
      prevBusyRef.current = nowBusy;
    };

    const tick = () => {
      // 出力テキスト進捗（overlay除外）
      const t = getText();
      const len = t.length;
      if (len > lastLenRef.current) {
        lastLenRef.current = len;
        lastChangeAtRef.current = Date.now();
      }
      // Busy中は表示維持
      if (busyRef.current && shownRef.current) {
        if (!visible) setVisible(true);
        if (!active) setActive(true);
      }
      // hide条件
      const stopByInactivity = Date.now() - lastChangeAtRef.current > INACTIVITY_MS;
      if (!busyRef.current && shownRef.current && stopByInactivity) hideSoon();
      // hostの自己修復
      if (!hostRef.current || (hostRef.current && !document.contains(hostRef.current.portal))) {
        const h = ensureHost();
        if (h) setHost(h);
      }
    };

    // 初期
    watchSubmit();
    tick();

    // 監視
    const obs = new MutationObserver(() => {
      watchSubmit();
      tick();
    });
    obs.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });

    const id = window.setInterval(() => {
      watchSubmit();
      tick();
    }, 300);

    return () => {
      obs.disconnect();
      window.clearInterval(id);
      // 回転停止は hide 完了でのみ行う（途中cleanupでは止めない）
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 依存=[] に固定

  if (!host || !visible) return null;

  return createPortal(
    <div
      className={[
        "pointer-events-none",
        "transition-opacity duration-200 ease-in-out", // ★ Easing追加
        active ? "opacity-100" : "opacity-0",
      ].join(" ")}
      style={{ marginBottom: "0.5rem" }}
      aria-live="polite"
    >
      <div className="inline-flex items-center rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm">
        <span className="font-medium">{sanitizeLine(label)}</span>
        <span className="ml-1 inline-block animate-pulse">…</span>
      </div>
    </div>,
    host.portal
  );
}
