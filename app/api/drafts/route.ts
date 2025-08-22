import { NextResponse } from "next/server";

type DraftReq = { productName?: string; audience?: string };

function validate(b: DraftReq) {
  const e: Record<string, string> = {};
  if (!b.productName?.trim()) e.productName = "productName は必須です。";
  if (!b.audience?.trim()) e.audience = "audience は必須です。";
  return e;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DraftReq;
    const errors = validate(body);
    if (Object.keys(errors).length) {
      return NextResponse.json({ ok: false, errors }, { status: 400 });
    }
    return NextResponse.json({ ok: true, draft: body }, { status: 200 });
  } catch {
    return NextResponse.json(
      { ok: false, errors: { body: "JSON の解析に失敗しました。" } },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "drafts endpoint" }, { status: 200 });
}
