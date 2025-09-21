"use client";

import * as React from "react";
import { Toaster, toast } from "sonner";

/**
 * ShopWriter - Toast 邨ｱ荳繝ｫ繝ｼ繝ｫ
 * - 謌仙粥:   邱・/ 遏ｭ繧・(2.0s)     竊・notify.success()
 * - 隴ｦ蜻・   鮟・/ 荳ｭ髢・(3.5s)     竊・notify.warning()
 * - 螟ｱ謨・   襍､ / 髟ｷ繧・(5.0s)     竊・notify.error()
 * - 諠・ｱ:   譌｢螳・(3.0s)          竊・notify.info()
 *
 * 繧｢繧ｯ繧ｻ繧ｷ繝薙Μ繝・ぅ:
 * - Toaster 縺ｯ aria-live polite 繧貞・驛ｨ縺ｧ菴ｿ逕ｨ・育判髱｢隱ｭ縺ｿ荳翫￡蟇ｾ蠢懶ｼ・
 * - 繧ｿ繧､繝医Ν縺ｯ邁｡貎斐∬ｪｬ譏弱・莉ｻ諢上り｡悟虚繝懊ち繝ｳ縺ｯ actionLabel/onAction 繧堤ｵｱ荳縲・
 */

type NotifyInput =
  | string
  | {
      title?: string;
      description?: string;
      /** 譌｢螳・ success=2000, warning=3500, error=5000, info=3000 */
      duration?: number;
      /** 莉ｻ諢上・荳諢終D・磯㍾隍・椛豁｢縺ｫ菴ｿ逕ｨ蜿ｯ・・*/
      id?: string | number;
      /** 繝懊ち繝ｳ譁・ｨ・井ｾ・ "蜿悶ｊ豸医＠"・・*/
      actionLabel?: string;
      /** 繝懊ち繝ｳ謚ｼ荳区凾繝上Φ繝峨Λ */
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

/** Sonner 縺ｯ warning 繧偵し繝昴・繝茨ｼ医ヰ繝ｼ繧ｸ繝ｧ繝ｳ縺ｫ繧医▲縺ｦ縺ｯ .warning 縺檎┌縺・ｴ蜷医↓蛯吶∴縺ｦ繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ・・*/
const hasWarning = (toast as any).warning instanceof Function;

const notify = {
  /** 謌仙粥: 邱・/ 2.0s */
  success(input: NotifyInput) {
    const b = build(input, "螳御ｺ・＠縺ｾ縺励◆", 2000);
    toast.success(b.title, {
      id: b.id,
      description: b.description,
      duration: b.duration,
      action: b.action,
    });
  },
  /** 隴ｦ蜻・ 鮟・/ 3.5s */
  warning(input: NotifyInput) {
    const b = build(input, "縺皮｢ｺ隱阪￥縺縺輔＞", 3500);
    if (hasWarning) {
      (toast as any).warning(b.title, {
        id: b.id,
        description: b.description,
        duration: b.duration,
        action: b.action,
      });
    } else {
      // 繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ: 鮟・ヨ繝ｼ繝ｳ鬚ｨ縺ｮ className 莉倅ｸ趣ｼ・ichColors 縺ｨ菴ｵ逕ｨ蜿ｯ・・
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
  /** 螟ｱ謨・ 襍､ / 5.0s */
  error(input: NotifyInput) {
    const b = build(input, "繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆", 5000);
    toast.error(b.title, {
      id: b.id,
      description: b.description,
      duration: b.duration,
      action: b.action,
    });
  },
  /** 諠・ｱ: 譌｢螳・/ 3.0s */
  info(input: NotifyInput) {
    const b = build(input, "縺顔衍繧峨○", 3000);
    toast.message(b.title, {
      id: b.id,
      description: b.description,
      duration: b.duration,
      action: b.action,
    });
  },
};

/**
 * 繧ｰ繝ｭ繝ｼ繝舌Ν謇句虚逋ｺ轣ｫ・域､懆ｨｼ逕ｨ・・
 * - DevTools 縺九ｉ: window.__notify.success("繧ｳ繝斐・縺励∪縺励◆")
 * - 譛ｬ逡ｪ縺ｧ繧ょｮｳ縺ｯ縺ｪ縺・′縲∝ｰ・擂逧・↓繝輔Λ繧ｰ縺ｧ蛻ｶ蠕｡蜿ｯ
 */
function exposeToWindow() {
  if (typeof window !== "undefined") {
    // @ts-expect-error - 蜍慕噪繝励Ο繝代ユ繧｣
    window.__notify = notify;
  }
}

exposeToWindow();

export function useNotify() {
  return React.useMemo(() => notify, []);
}

/**
 * 譌｢蟄倥・ Provider 繧堤ｽｮ謠帙∴
 * - 繧｢繝励Μ蜈ｱ騾壹〒 Toaster 繧・1 邂・園縺ｫ髮・ｴ・
 * - richColors / closeButton 繧呈怏蜉ｹ蛹・
 * - 菴咲ｽｮ縺ｯ UX 隱咲衍雋闕ｷ縺ｮ菴弱＞ "top-right"
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
          // 繧ｰ繝ｭ繝ｼ繝舌Ν譌｢螳夲ｼ亥推騾夂衍縺ｧ荳頑嶌縺搾ｼ・
          duration: 3000,
        }}
      />
    </>
  );
}
