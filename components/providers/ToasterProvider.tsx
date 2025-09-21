"use client";

import * as React from "react";
import { Toaster, toast } from "sonner";

/**
 * ShopWriter - Toast 驍ｨ・ｱ闕ｳﾂ郢晢ｽｫ郢晢ｽｼ郢晢ｽｫ
 * - 隰御ｻ咏ｲ･:   驍ｱ繝ｻ/ 驕擾ｽｭ郢ｧ繝ｻ(2.0s)     遶翫・notify.success()
 * - 髫ｴ・ｦ陷ｻ繝ｻ   魄溘・/ 闕ｳ・ｭ鬮｢繝ｻ(3.5s)     遶翫・notify.warning()
 * - 陞滂ｽｱ隰ｨ繝ｻ   隘搾ｽ､ / 鬮滂ｽｷ郢ｧ繝ｻ(5.0s)     遶翫・notify.error()
 * - 隲繝ｻ・ｰ・ｱ:   隴鯉ｽ｢陞ｳ繝ｻ(3.0s)          遶翫・notify.info()
 *
 * 郢ｧ・｢郢ｧ・ｯ郢ｧ・ｻ郢ｧ・ｷ郢晁侭ﾎ懃ｹ昴・縺・
 * - Toaster 邵ｺ・ｯ aria-live polite 郢ｧ雋槭・鬩幢ｽｨ邵ｺ・ｧ闖ｴ・ｿ騾包ｽｨ繝ｻ閧ｲ蛻､鬮ｱ・｢髫ｱ・ｭ邵ｺ・ｿ闕ｳ鄙ｫ・｡陝・ｽｾ陟｢諛ｶ・ｼ繝ｻ
 * - 郢ｧ・ｿ郢ｧ・､郢晏現ﾎ晉ｸｺ・ｯ驍・ｽ｡雋取鱒ﾂ竏ｬ・ｪ・ｬ隴丞ｼｱ繝ｻ闔会ｽｻ隲｢荳環繧奇ｽ｡謔溯劒郢晄㈱縺｡郢晢ｽｳ邵ｺ・ｯ actionLabel/onAction 郢ｧ蝣､・ｵ・ｱ闕ｳﾂ邵ｲ繝ｻ
 */

type NotifyInput =
  | string
  | {
      title?: string;
      description?: string;
      /** 隴鯉ｽ｢陞ｳ繝ｻ success=2000, warning=3500, error=5000, info=3000 */
      duration?: number;
      /** 闔会ｽｻ隲｢荳翫・闕ｳﾂ隲｢邨・繝ｻ逎ｯ纃ｾ髫阪・讀幄ｱ・ｽ｢邵ｺ・ｫ闖ｴ・ｿ騾包ｽｨ陷ｿ・ｯ繝ｻ繝ｻ*/
      id?: string | number;
      /** 郢晄㈱縺｡郢晢ｽｳ隴√・・ｨﾂ繝ｻ莠包ｽｾ繝ｻ "陷ｿ謔ｶ・願ｱｸ蛹ｻ・"繝ｻ繝ｻ*/
      actionLabel?: string;
      /** 郢晄㈱縺｡郢晢ｽｳ隰夲ｽｼ闕ｳ蛹ｺ蜃ｾ郢昜ｸ莞ｦ郢晏ｳｨﾎ・*/
      onAction?: () => void;
    };

type Built = {
  title: string;
  description?: string;
  duration: number;
  id?: string | number;
  action?: { label: string; onClick: () => void } | undefined;
};

function build(input: NotifyInput, fallbackTitle: string, defaultDuration: number): Built {
  if (typeof input === "string") {
    return { title: input, duration: defaultDuration };
  }
  const title = input.title || fallbackTitle;
  const duration = input.duration ?? defaultDuration;
  const action =
    input.actionLabel && input.onAction
      ? { label: input.actionLabel, onClick: input.onAction }
      : undefined;

  return {
    title,
    description: input.description,
    duration,
    id: input.id,
    action,
  };
}

/** Sonner 邵ｺ・ｯ warning 郢ｧ蛛ｵ縺礼ｹ晄亢繝ｻ郢晁肩・ｼ蛹ｻ繝ｰ郢晢ｽｼ郢ｧ・ｸ郢晢ｽｧ郢晢ｽｳ邵ｺ・ｫ郢ｧ蛹ｻ笆ｲ邵ｺ・ｦ邵ｺ・ｯ .warning 邵ｺ讙寂伯邵ｺ繝ｻ・ｰ・ｴ陷ｷ蛹ｻ竊楢岷蜷ｶ竏ｴ邵ｺ・ｦ郢晁ｼ斐°郢晢ｽｼ郢晢ｽｫ郢晁・繝｣郢ｧ・ｯ繝ｻ繝ｻ*/
const hasWarning = (toast as any).warning instanceof Function;

const notify = {
  /** 隰御ｻ咏ｲ･: 驍ｱ繝ｻ/ 2.0s */
  success(input: NotifyInput) {
    const b = build(input, "陞ｳ蠕｡・ｺ繝ｻ・邵ｺ・ｾ邵ｺ蜉ｱ笳・, 2000);
    toast.success(b.title, {
      id: b.id,
      description: b.description,
      duration: b.duration,
      action: b.action,
    });
  },
  /** 髫ｴ・ｦ陷ｻ繝ｻ 魄溘・/ 3.5s */
  warning(input: NotifyInput) {
    const b = build(input, "邵ｺ逧ｮ・｢・ｺ髫ｱ髦ｪ・･邵ｺ・ｰ邵ｺ霈費ｼ・, 3500);
    if (hasWarning) {
      (toast as any).warning(b.title, {
        id: b.id,
        description: b.description,
        duration: b.duration,
        action: b.action,
      });
    } else {
      // 郢晁ｼ斐°郢晢ｽｼ郢晢ｽｫ郢晁・繝｣郢ｧ・ｯ: 魄溘・繝ｨ郢晢ｽｼ郢晢ｽｳ鬯夲ｽｨ邵ｺ・ｮ className 闔牙・ｽｸ雜｣・ｼ繝ｻichColors 邵ｺ・ｨ闖ｴ・ｵ騾包ｽｨ陷ｿ・ｯ繝ｻ繝ｻ
      toast.message(b.title, {
        id: b.id,
        description: b.description,
        duration: b.duration,
        action: b.action,
        className:
          "bg-yellow-500 text-white dark:bg-yellow-500/90 dark:text-white",
      });
    }
  },
  /** 陞滂ｽｱ隰ｨ繝ｻ 隘搾ｽ､ / 5.0s */
  error(input: NotifyInput) {
    const b = build(input, "郢ｧ・ｨ郢晢ｽｩ郢晢ｽｼ邵ｺ讙主験騾墓ｺ假ｼ邵ｺ・ｾ邵ｺ蜉ｱ笳・, 5000);
    toast.error(b.title, {
      id: b.id,
      description: b.description,
      duration: b.duration,
      action: b.action,
    });
  },
  /** 隲繝ｻ・ｰ・ｱ: 隴鯉ｽ｢陞ｳ繝ｻ/ 3.0s */
  info(input: NotifyInput) {
    const b = build(input, "邵ｺ鬘碑｡咲ｹｧ蟲ｨ笳・, 3000);
    toast.message(b.title, {
      id: b.id,
      description: b.description,
      duration: b.duration,
      action: b.action,
    });
  },
};

/**
 * 郢ｧ・ｰ郢晢ｽｭ郢晢ｽｼ郢晁・ﾎ晁ｬ・唱陌夐具ｽｺ霓｣・ｫ繝ｻ蝓滂ｽ､諛・ｽｨ・ｼ騾包ｽｨ繝ｻ繝ｻ
 * - DevTools 邵ｺ荵晢ｽ・ window.__notify.success("郢ｧ・ｳ郢晄鱒繝ｻ邵ｺ蜉ｱ竏ｪ邵ｺ蜉ｱ笳・)
 * - 隴幢ｽｬ騾｡・ｪ邵ｺ・ｧ郢ｧ繧・ｽｮ・ｳ邵ｺ・ｯ邵ｺ・ｪ邵ｺ繝ｻ窶ｲ邵ｲ竏晢ｽｰ繝ｻ謫るｧ繝ｻ竊鍋ｹ晁ｼ釆帷ｹｧ・ｰ邵ｺ・ｧ陋ｻ・ｶ陟包ｽ｡陷ｿ・ｯ
 */
function exposeToWindow() {
  if (typeof window !== "undefined") {
    // @ts-expect-error - 陷肴・蝎ｪ郢晏干ﾎ溽ｹ昜ｻ｣繝ｦ郢ｧ・｣
    window.__notify = notify;
  }
}

exposeToWindow();

export function useNotify() {
  return React.useMemo(() => notify, []);
}

/**
 * 隴鯉ｽ｢陝・･繝ｻ Provider 郢ｧ蝣､・ｽ・ｮ隰蟶吮斡
 * - 郢ｧ・｢郢晏干ﾎ懆怦・ｱ鬨ｾ螢ｹ縲・Toaster 郢ｧ繝ｻ1 驍ゅ・蝨堤ｸｺ・ｫ鬮ｮ繝ｻ・ｴ繝ｻ
 * - richColors / closeButton 郢ｧ蜻域剰怏・ｹ陋ｹ繝ｻ
 * - 闖ｴ蜥ｲ・ｽ・ｮ邵ｺ・ｯ UX 髫ｱ蜥ｲ陦埼寞・ｰ髣包ｽｷ邵ｺ・ｮ闖ｴ蠑ｱ・・"top-right"
 */
export default function ToasterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          // 郢ｧ・ｰ郢晢ｽｭ郢晢ｽｼ郢晁・ﾎ晁ｭ鯉ｽ｢陞ｳ螟ｲ・ｼ莠･謗ｨ鬨ｾ螟り｡咲ｸｺ・ｧ闕ｳ鬆大ｶ檎ｸｺ謳ｾ・ｼ繝ｻ
          duration: 3000,
        }}
      />
    </>
  );
}

