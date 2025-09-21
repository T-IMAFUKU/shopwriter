// app/api/debug/prisma/route.ts  窶披披披・蜈ｨ譁・ｼ域眠隕丈ｽ懈・・・
// Prisma謗･邯夊ｨｺ譁ｭ繝ｫ繝ｼ繝茨ｼ域圻螳夲ｼ・
// 豕ｨ諢擾ｼ壽悽逡ｪ蜑阪↓蜑企勁縺励※縺上□縺輔＞縲・

import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma =
  (global as any).prisma ??
  new PrismaClient()
if (process.env.NODE_ENV !== "production") {
  ;(global as any).prisma = prisma
}

function json(data: any, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("Content-Type", "application/json; charset=utf-8")
  headers.set("Content-Language", "ja")
  return new NextResponse(JSON.stringify(data, null, 2), { ...init, headers })
}

export async function GET() {
  const report: Record<string, any> = {
    ok: false,
    message: "險ｺ譁ｭ邨先棡",
    env: {
      NODE_ENV: process.env.NODE_ENV ?? null,
      DATABASE_URL: process.env.DATABASE_URL ? "set" : "unset",
    },
    checks: [] as any[],
    errors: [] as any[],
  }

  try {
    await prisma.$connect()
    report.checks.push({ name: "connect", ok: true })
  } catch (e: any) {
    report.errors.push({ stage: "connect", code: e?.code, message: e?.message })
    return json(report, { status: 500 })
  }

  try {
    const pong = await prisma.$queryRawUnsafe("SELECT 1 as ok")
    report.checks.push({ name: "select1", ok: true, pong })
  } catch (e: any) {
    report.errors.push({ stage: "select1", code: e?.code, message: e?.message })
    return json(report, { status: 500 })
  }

  try {
    const one = await prisma.share.findMany({ take: 1 })
    report.checks.push({ name: "share.findMany", ok: true, sample: one })
  } catch (e: any) {
    report.errors.push({ stage: "share.findMany", code: e?.code, message: e?.message })
    return json(report, { status: 500 })
  }

  report.ok = true
  return json(report, { status: 200 })
}

export const dynamic = "force-dynamic"
