// FILE: app/debug/session/page.tsx
"use client";

// 譛ｬ逡ｪ繝薙Ν繝峨〒螟ｱ謨励＠縺ｪ縺・ｮ牙・縺ｪ髱咏噪繧ｹ繧ｿ繝悶・
// ・亥ｾ檎ｶ壹ヵ繧ｧ繝ｼ繧ｺ縺ｧ SessionProvider 繧貞ｰ主・縺励◆繧峨√％縺薙ｒ蜈・・螳溯｣・↓謌ｻ縺帙∪縺呻ｼ・
export const dynamic = "force-static";

export default function SessionDebugStub() {
  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-2xl font-semibold">Session Debug</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        譛ｬ逡ｪ繝薙Ν繝臥ｰ｡逡･蛹悶・縺溘ａ縲√ョ繝舌ャ繧ｰ蜃ｺ蜉帙・荳譎ら噪縺ｫ辟｡蜉ｹ蛹悶＠縺ｦ縺・∪縺吶・
      </p>
    </div>
  );
}
