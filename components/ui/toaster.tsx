// components/ui/toaster.tsx
"use client";

import * as React from "react";
import { Toaster } from "sonner";

/**
 * 繧｢繝励Μ蜈ｨ菴薙〒 1 蠎ｦ縺縺鷹・鄂ｮ縺吶ｋ繝医・繧ｹ繧ｿ繝ｼ縲・ * - Next.js 15 / React 18 縺ｫ蟇ｾ蠢・ * - sonner v2.0.7 縺ｧ縺ｯ ariaProps 縺ｯ譛ｪ繧ｵ繝昴・繝・ */
export default function SonnerToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      expand
      duration={3000}
      visibleToasts={3}
    />
  );
}

