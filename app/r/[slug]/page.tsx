import { notFound } from "next/navigation";
import { getBusiness } from "@/lib/businesses";
import ReviewForm from "@/components/ReviewForm";

export const instant = false;

async function logScan(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, type: "scan" }),
    });
    const text = await res.text();
    console.log("[page] scan logged:", res.status, text);
  } catch (err) {
    console.error("[page] scan log failed:", err);
  }
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const biz = getBusiness(slug);
  if (!biz) notFound();

    await logScan(slug);

  return (
        <main className="review-page">
      <header className="review-header">
        <div
          className="review-logo"
          style={{ background: biz.brand_color }}
        >
          {biz.logo_letter}
        </div>
        <h1 className="review-shop-name">{biz.name}</h1>
        <p className="review-shop-sub">Your feedback helps us improve</p>
      </header>

      <ReviewForm biz={biz} />
    </main>
  );
}