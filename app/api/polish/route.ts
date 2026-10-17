import { NextRequest, NextResponse } from "next/server";
import { polishReview } from "@/lib/openai";
import { getBusiness } from "@/lib/businesses";

const rateMap = new Map<string, { count: number; reset: number }>();
const LIMIT = Number(process.env.POLISH_RATE_LIMIT || 20);
const WINDOW_MS = 60 * 60 * 1000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.reset) {
    rateMap.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > LIMIT;
}

export async function POST(req: NextRequest) {
  try {
        const body = await req.json();
    console.log("[polish] body received:", body);

    const { slug, rawText, rating } = body;

    if (!slug || typeof rawText !== "string" || typeof rating !== "number") {
      console.log("[polish] missing_fields:", { slug, rawText, rating });
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

            const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length;
    const charCount = rawText.trim().length;
    console.log("[polish] text stats:", { wordCount, charCount });
    if (charCount < 40 || wordCount < 6) {
      console.log("[polish] text_too_short");
      return NextResponse.json(
        { error: "text_too_short", minWords: 6, wordCount, charCount },
        { status: 400 }
      );
    }

    if (rawText.length > 800) {
      return NextResponse.json({ error: "text_too_long" }, { status: 400 });
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: "invalid_rating" }, { status: 400 });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (rateLimited(ip)) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const biz = getBusiness(slug);
    if (!biz) {
      return NextResponse.json({ error: "unknown_business" }, { status: 404 });
    }

    const sheetUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
    const secret = process.env.GOOGLE_SHEET_SECRET;
    if (sheetUrl && secret) {
      fetch(sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          slug,
          type: "polish",
          rating,
          userAgent: req.headers.get("user-agent") || "",
        }),
      }).catch(() => {});
    }

    const result = await polishReview({
      rawText: rawText.trim(),
      rating,
      businessName: biz.name,
    });

    if (result.drafts.length === 0) {
      return NextResponse.json({ error: "generation_failed" }, { status: 502 });
    }

    return NextResponse.json({ drafts: result.drafts });
  } catch (err) {
    console.error("[polish] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}