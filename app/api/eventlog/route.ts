import { NextResponse } from "next/server";
import { prisma } from "../../../src/lib/prisma";
import {
  VER_LABEL_EVENTLOG,
  EventLogSchema,
  EventLogResponseSchema,
} from "../../../src/contracts/eventlog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, init?: number | ResponseInit) {
  return typeof init === "number"
    ? NextResponse.json(data, { status: init })
    : NextResponse.json(data, init);
}

// POST /api/eventlog
export async function POST(req: Request) {
  try {
    const userId = req.headers.get("x-user-id") ?? undefined;
    const sessionId = req.headers.get("x-session-id") ?? undefined;

    const body = await req.json().catch(() => ({}));
    const parsed = EventLogSchema.safeParse(body);
    if (!parsed.success) {
      return json(
        { ok: false as const, ver: VER_LABEL_EVENTLOG, error: { message: "Invalid body", issues: parsed.error.flatten() } },
        400
      );
    }

    const { category, event, level, payload } = parsed.data;

    const row = await prisma.eventLog.create({
      data: { category, event, level, payload, userId, sessionId },
    });

    const payloadRes = { ok: true as const, ver: VER_LABEL_EVENTLOG, data: { id: row.id } };
    EventLogResponseSchema.parse(payloadRes);
    return json(payloadRes, 201);
  } catch {
    return json({ ok: false as const, ver: VER_LABEL_EVENTLOG, error: { message: "Internal error" } }, 500);
  }
}
