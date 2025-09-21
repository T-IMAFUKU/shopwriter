// app/api/metrics/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prisma Client・磯幕逋ｺ荳ｭ縺ｮ繝帙ャ繝医Μ繝ｭ繝ｼ繝芽先ｧ・・
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["warn", "error"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// 蜿鈴倥・繧､繝ｭ繝ｼ繝峨・譛蟆上せ繧ｭ繝ｼ繝・
const PayloadSchema = z
  .object({
    event: z.string().min(1, "event is required"),
    props: z.record(z.any()).optional(),
    ts: z.number().int().positive().optional(), // epoch 遘・繝溘Μ遘偵←縺｡繧峨〒繧ょ庄
  })
  .strict();

function j(data: unknown, init?: number | ResponseInit) {
  if (typeof init === "number") return NextResponse.json(data, { status: init });
  return NextResponse.json(data, init);
}

function clientIp(req: NextRequest): string | undefined {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  const rip = req.headers.get("x-real-ip");
  if (rip) return rip.trim();
  return undefined;
}

function normalizeTsMs(n?: number): bigint | undefined {
  if (n == null) return undefined;
  // 1e12 譛ｪ貅縺ｯ縲檎ｧ偵阪→縺ｿ縺ｪ縺励Α繝ｪ遘貞喧
  const ms = n < 1e12 ? Math.trunc(n * 1000) : Math.trunc(n);
  return BigInt(ms);
}

// POST 莉･螟悶・ 405
export async function GET() {
  return j(
    { ok: false, error: "method_not_allowed", allow: ["POST"] },
    { status: 405, headers: { Allow: "POST" } }
  );
}

// 繝舌Μ繝・・繧ｷ繝ｧ繝ｳ + 繝医・繧ｯ繝ｳ隱崎ｨｼ + Prisma INSERT
export async function POST(req: NextRequest) {
  const expected = process.env.METRICS_INGEST_TOKEN ?? "";
  const provided = req.headers.get("x-metrics-token") ?? "";

  if (!expected || !provided || provided !== expected) {
    return j({ ok: false, error: "unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return j({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return j(
      { ok: false, error: "validation_error", issues: parsed.error.flatten() },
      400
    );
  }

  const data = parsed.data;
  const created = await prisma.metricEvent.create({
    data: {
      event: data.event,
      props: (data.props ?? null) as any,
      ts: normalizeTsMs(data.ts),
      ip: clientIp(req),
      ua: req.headers.get("user-agent") ?? undefined,
      // userId / shareId 縺ｯ蟆・擂諡｡蠑ｵ縺ｧ莉倅ｸ・
    },
  });

  // BigInt 繧貞性繧繧ｪ繝悶ず繧ｧ繧ｯ繝医・逶ｴ謗･霑斐＆縺ｪ縺・ｼ・SON蛹悶お繝ｩ繝ｼ蝗樣∩・・
  return j(
    {
      ok: true,
      id: created.id,
      receivedAt: created.receivedAt.toISOString(),
      env: process.env.VERCEL ? "vercel" : "local",
    },
    200
  );
}
