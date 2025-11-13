"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * HeadingPreview（LEVEL3-Lite｜即時表示＋毎回リセット）
 * 目的：
 *  - 「生成する」クリック or 生成中UIへの遷移を検知して *即時* に仮見出しを出す
 *  - ストリーミング本文から *確定見出し* を後追いで上書き
 *  - ジョブ終了時はフェードアウト
 *  - 2回目以降の生成でも必ず再表示（セッションIDでリセット）
 *
 * 実装ポイント：
 *  - 生成開始検知：フォームの [type=submit] ボタンの状態変化（disabled/テキスト変化）を監視
 *  - 仮見出し：左フォーム（商品名 / 用途・目的 / 特徴）から組み立て
 *  - 確定見出し：右の出力カード(.prose 等)から抽出
 *  - 追従表示：出力カードの上辺に追従＋初回だけスクロール補正
 */

type OverlayStyle = { top: number; left: number; width: number };

const OUTPUT_SELECTORS = [
  ".prose",
  "article.prose",
  "[data-writer-output]",
  "#writer-output",
  "[data-testid='writer-output']",
  ".output-card",
  "section[aria-label='出力']",
  "section[aria-label*='出力']:not([aria-label*='通知']):not([aria-label*='announce'])",
  "section[aria-live='polite']:not(next-route-announcer *):not([id*='route-announcer'])",
  ".prose pre",
  "article pre",
  "#output",
] as const;

const SUBMIT_BTN_SELECTOR = "form button[type='submit'], form [data-action='generate']";

const INACTIVITY_MS = 1500;
const FADEOUT_MS = 900;
const MAX_HEADING_LEN = 56;

const VIEWPORT_MARGIN = 8;
const CARD_OFFSET_TOP = 8;

function sanitizeHeading(s: string): string {
  let t = s.replace(/[*_#`>]/g, "").trim();
  if (t.length > MAX_HEADING_LEN) t = t.slice(0, MAX_HEADING_LEN - 1) + "…";
  return t;
}

function extractHeadingFromText(text: string): string | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(#{1,3})\s+(.+)$/.exec(line);
    if (m?.[2]) return sanitizeHeading(m[2]);
  }
  const md2 = /(^|\n)##\s+(.+)/.exec(text);
  if (md2?.[2]) return sanitizeHeading(md2[2]);

  const first = lines.find((l) => l.trim().length > 0);
  return first ? sanitizeHeading(first) : null;
}

function isNoise(el: Element | null): boolean {
  if (!el) return true;
  if (el.closest("next-route-announcer")) return true;
  const id = (el as HTMLElement).id || "";
  if (id.includes("route-announcer")) return true;
  if (el.closest("header, nav, footer")) return true;
  return false;
}

export default function HeadingPreview() {
  // 表示データ
  const [heading, setHeading] = useState<string>("");
  const [active, setActive] = useState<boolean>(false);
  const [visible, setVisible] = useState<boolean>(false);
  const [style, setStyle] = useState<OverlayStyle | null>(null);

  // セッション管理（毎回の生成ごとにインクリメント）
  const sessionRef = useRef<number>(0);
  const didAutoScrollRef = useRef(false);

  // 進行監視
  const lastLenRef = useRef<number>(0);
  const lastChangeAtRef = useRef<number>(0);
  const obsRef = useRef<MutationObserver | null>(null);

  // ===== 参照系ユーティリティ =====
  const getOutputEl = useMemo(() => {
    return (): HTMLElement | null => {
      for (const sel of OUTPUT_SELECTORS) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el || isNoise(el)) continue;
        const txt = el.textContent?.trim() ?? "";
        if (txt.length > 10) return el;
      }
      return null;
    };
  }, []);

  const getOutputText = () => getOutputEl()?.textContent ?? "";

  // 左フォームから「仮見出し」を組み立て
  function makeProvisionalHeading(): string | null {
    // ラベルの日本語から推測（環境差吸収のため広めに）
    const root = document.body;
    if (!root) return null;

    // 代表値：商品名 / 用途・目的 / 特徴
    const read = (labelLike: RegExp) => {
      const labels = Array.from(root.querySelectorAll("label, [aria-label], [placeholder]")) as HTMLElement[];
      const hit = labels.find((el) => {
        const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim();
        return labelLike.test(text);
      });
      if (!hit) return "";
      // 近くの input/textarea の値を拾う
      const candidate = hit.closest("div")?.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
      return candidate?.value?.trim() || "";
    };

    const product = read(/商品名|商品/);
    const purpose = read(/用途|目的|使い道|目的・用途/);
    const feature = read(/特徴|強み|セールスポイント|差別化/);

    // 優先順位：目的 > 特徴 > 商品名
    const parts = [purpose, feature, product].filter(Boolean);
    if (parts.length === 0) return null;

    // シンプル合成
    const t = parts.join("｜");
    return sanitizeHeading(t);
  }

  // ===== 位置計算 & スクロール補正 =====
  function updateOverlayPosition() {
    const el = getOutputEl();
    if (!el) return;
    const r = el.getBoundingClientRect();

    const width = Math.min(r.width, 720);
    const left = Math.round(r.left + r.width / 2 - width / 2);
    const top = Math.round(Math.max(VIEWPORT_MARGIN, r.top + CARD_OFFSET_TOP));

    setStyle({ top, left: Math.max(VIEWPORT_MARGIN, left), width });
  }

  function ensureVisibleOnce() {
    if (didAutoScrollRef.current) return;
    const el = getOutputEl();
    if (!el) return;

    const r = el.getBoundingClientRect();
    const inView = r.top >= 0 && r.top <= window.innerHeight * 0.8;
    if (!inView) {
      didAutoScrollRef.current = true;
      const y = window.scrollY + r.top - 80;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    }
  }

  // ===== 生成開始/終了の検知（ボタン状態） =====
  function isGeneratingNow(btn: HTMLButtonElement): boolean {
    const txt = (btn.textContent || "").trim();
    // 「生成しています」「生成中」「実行中です」などを広く吸収
    const busyText = /(生成しています|生成中|実行中|考えています|running|loading|processing)/;
    return btn.disabled || busyText.test(txt);
  }

  function detectSubmitButton(): HTMLButtonElement | null {
    const el = document.querySelector(SUBMIT_BTN_SELECTOR) as HTMLButtonElement | null;
    return el ?? null;
  }

  // ===== メイン効果 =====
  useEffect(() => {
    const root = document.body;
    if (!root) return;

    // --- 生成ボタンの監視（開始トリガー） ---
    let prevBusy = false;
    const watchSubmit = () => {
      const btn = detectSubmitButton();
      if (!btn) return;

      const nowBusy = isGeneratingNow(btn);
      if (nowBusy && !prevBusy) {
        // ▶ 生成開始を検知：セッション更新・即時仮見出し表示
        sessionRef.current += 1;
        didAutoScrollRef.current = false;
        lastLenRef.current = 0;
        lastChangeAtRef.current = performance.now();

        const provisional = makeProvisionalHeading();
        if (provisional) setHeading(provisional); // 即時表示
        setActive(true);
        setVisible(true);
        updateOverlayPosition();
        ensureVisibleOnce();
      }

      // 生成終了を検知（busy→not busy）
      if (!nowBusy && prevBusy) {
        // ストリーミング停止から一定時間後にフェードアウト（本文監視と併用）
        const endTimer = window.setTimeout(() => {
          setActive(false);
          const t = setTimeout(() => setVisible(false), FADEOUT_MS);
          return () => clearTimeout(t);
        }, 300);
        return () => window.clearTimeout(endTimer);
      }

      prevBusy = nowBusy;
    };

    const submitObserver = new MutationObserver(watchSubmit);
    submitObserver.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });

    // --- 本文の監視（確定見出し & 進捗判定） ---
    const handleTick = () => {
      const text = getOutputText();
      const len = text.length;

      if (len > lastLenRef.current) {
        lastLenRef.current = len;
        lastChangeAtRef.current = Date.now();

        // 確定見出しを上書き（初回のみ）
        const h = extractHeadingFromText(text);
        if (h) setHeading((prev) => prev || h);

        setActive(true);
        setVisible(true);
        updateOverlayPosition();
      }

      // しばらく伸びが無ければ終了扱い
      if (active && Date.now() - lastChangeAtRef.current > INACTIVITY_MS) {
        setActive(false);
        const t = setTimeout(() => setVisible(false), FADEOUT_MS);
        return () => clearTimeout(t);
      }
    };

    // 初期実行
    watchSubmit();
    handleTick();
    updateOverlayPosition();

    // DOM監視 + 予備ポーリング
    obsRef.current?.disconnect();
    const obs = new MutationObserver(() => {
      handleTick();
      updateOverlayPosition();
      watchSubmit();
    });
    obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
    obsRef.current = obs;

    const id = window.setInterval(() => {
      handleTick();
      updateOverlayPosition();
      watchSubmit();
    }, 300);

    // スクロール/リサイズ追従
    const onScroll = () => updateOverlayPosition();
    const onResize = () => updateOverlayPosition();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      submitObserver.disconnect();
      obs.disconnect();
      window.clearInterval(id);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!heading || !visible || !style) return null;

  return (
    <div
      className={[
        "pointer-events-none fixed z-40",
        active ? "opacity-100" : "opacity-0",
        "transition-opacity duration-300",
      ].join(" ")}
      style={{ top: style.top, left: style.left, width: style.width }}
      aria-live="polite"
    >
      <div className="rounded-2xl border bg-white/85 px-5 py-4 shadow backdrop-blur">
        <h2 className="text-lg font-bold leading-tight md:text-xl">{heading}</h2>
        <p className="mt-1 text-xs text-muted-foreground">（先出し）</p>
      </div>
    </div>
  );
}
