// app/api/debug/prisma/route.ts
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPublicDeployment(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Content-Language", "ja");
  headers.set("Cache-Control", "no-store, must-revalidate");

  return new NextResponse(JSON.stringify(data, null, 2), {
    ...init,
    headers,
  });
}

function getPrismaClient(): PrismaClient {
  const globalForPrisma = globalThis as typeof globalThis & {
    prisma?: PrismaClient;
  };

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }

  return globalForPrisma.prisma;
}

/**
 * GET /api/debug/prisma
 *
 * 開発環境専用のPrisma診断API。
 * 公開環境ではDB接続前に 404 を返す。
 */
export async function GET() {
  if (isPublicDeployment()) {
    return notFound();
  }

  const prisma = getPrismaClient();

  const report: {
    ok: boolean;
    message: string;
    checks: Array<{ name: string; ok: boolean; count?: number }>;
    errors: Array<{ stage: string; code?: string; message?: string }>;
  } = {
    ok: false,
    message: "Prisma development diagnostics",
    checks: [],
    errors: [],
  };

  try {
    await prisma.$connect();
    report.checks.push({ name: "connect", ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    report.errors.push({
      stage: "connect",
      code: err.code,
      message: err.message,
    });
    return json(report, { status: 500 });
  }

  try {
    await prisma.$queryRawUnsafe("SELECT 1 as ok");
    report.checks.push({ name: "select1", ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    report.errors.push({
      stage: "select1",
      code: err.code,
      message: err.message,
    });
    return json(report, { status: 500 });
  }

  try {
    const count = await prisma.share.count();
    report.checks.push({ name: "share.count", ok: true, count });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    report.errors.push({
      stage: "share.count",
      code: err.code,
      message: err.message,
    });
    return json(report, { status: 500 });
  }

  report.ok = true;
  return json(report, { status: 200 });
}