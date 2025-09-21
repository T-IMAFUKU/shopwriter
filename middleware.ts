// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * 譁ｹ驥晢ｼ・
 * - /api 縺ｯ邨ｶ蟇ｾ縺ｫ騾壹＆縺ｪ縺・ｼ医Α繝峨Ν繧ｦ繧ｧ繧｢縺ｮ蠖ｱ髻ｿ繧ｼ繝ｭ・・
 * - 髱咏噪/蜀・Κ繝代せ・・next, 髱咏噪繝輔ぃ繧､繝ｫ・峨ｂ蟇ｾ雎｡螟・
 * - 縺昴ｌ莉･螟厄ｼ医・繝ｼ繧ｸ驕ｷ遘ｻ邉ｻ・峨・蟆・擂縺ｮ諡｡蠑ｵ縺ｫ蛯吶∴縺ｦ邏騾壹ｊ・・o-op・・
 */

export function middleware(_req: NextRequest) {
  // 菴輔ｂ縺励↑縺・ｼ育ｴ騾壹ｊ・・
  return NextResponse.next();
}

/**
 * matcher 縺ｮ驥崎ｦ√・繧､繝ｳ繝茨ｼ・
 * - `((?!api|_next|.*\\..*).*)` 縺ｧ /api 縺ｨ /_next 縺ｨ諡｡蠑ｵ蟄蝉ｻ倥″髱咏噪雉・肇繧貞ｮ悟・髯､螟・
 * - /share/* 縺ｪ縺ｩ縺ｮ蜈ｬ髢九ン繝･繝ｼ縺ｯ縺薙％縺ｧ邏騾壹ｊ縺輔○繧具ｼ医Ο繧ｸ繝・け縺ｯ蠕檎ｶ壹〒螳溯｣・庄閭ｽ・・
 */
export const config = {
  matcher: [
    // 縺吶∋縺ｦ縺ｮ /api 繧帝勁螟悶・ _next / 髱咏噪繝輔ぃ繧､繝ｫ繧る勁螟厄ｼ井ｾ・ .png, .svg, .ico, .js, .css 縺ｪ縺ｩ・・
    "/((?!api|_next|.*\\..*).*)",
  ],
};
