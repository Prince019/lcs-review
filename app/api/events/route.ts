import { NextRequest, NextResponse } from "next/server";

const ALLOWED_TYPES = ["scan", "copy", "outbound"];

export async function POST(req: NextRequest) {
  try {
    const { slug, type, rating } = await req.json();

    if (!slug || !type || !ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }

    const url = process.env.GOOGLE_SHEET_WEBHOOK_URL;
    const secret = process.env.GOOGLE_SHEET_SECRET;

    if (!url || !secret) {
      return NextResponse.json({ ok: true, logged: false });
    }

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        slug,
        type,
        rating: typeof rating === "number" ? rating : null,
        userAgent: req.headers.get("user-agent") || "",
      }),
    }).catch(() => {});

    return NextResponse.json({ ok: true, logged: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}