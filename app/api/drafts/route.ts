// app/api/drafts/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMP: Draft 繝｢繝・Ν蟒・ｭ｢縺ｫ莨ｴ縺・ン繝ｫ繝峨お繝ｩ繝ｼ蝗樣∩逕ｨ繧ｹ繧ｿ繝悶・
 * - 譌ｧ /api/drafts 縺ｯ 410 Gone 繧定ｿ斐☆
 * - 莉雁ｾ後・ /api/shares 遲峨↓髮・ｴ・ｺ亥ｮ・
 */

function j(data: unknown, init?: number | ResponseInit) {
  if (typeof init === "number") return NextResponse.json(data, { status: init });
  return NextResponse.json(data, init);
}

export async function GET() {
  return j(
    {
      ok: false,
      error: "deprecated_endpoint",
      message: "This endpoint was removed. Use /api/shares instead.",
    },
    410
  );
}

export async function POST(_req: NextRequest) {
  return j(
    {
      ok: false,
      error: "deprecated_endpoint",
      message: "This endpoint was removed. Use /api/shares instead.",
    },
    410
  );
}
