import OpenAI from "openai";

// ---------- Client ----------

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// ---------- Types ----------

export type PolishParams = {
  rawText: string;
  rating: number;
  businessName: string;
  city?: string;
};

export type PolishResult = {
  drafts: string[];
};

// ---------- System prompt ----------

const SYSTEM_PROMPT = `You polish a customer's rough Google review into fluent, natural English.

STRICT RULES â€” never break these:
1. Preserve every fact the customer stated. Services, problems, staff, outcomes â€” keep them exact.
2. Add NOTHING. No new services, prices, names, praise, or details.
3. Never use marketing words: "amazing", "best in town", "highly recommend" (unless the customer said it), "top-notch", "outstanding", "exceptional".
4. Never say the review was AI-written or assisted.
5. Sound human â€” casual, natural, like a real person typing on their phone. Vary sentence length. No bullet points. No emojis.
6. 6. Produce exactly ONE polished draft. Pick a natural length between 1 and 3 sentences based on what the customer wrote. Do not produce multiple options.And try to generate a content in a humaniser tone.
7. Match tone to the star rating:
   - 5: warm, satisfied, genuine
   - 4: positive with minor honest note if customer mentioned one
   - 3: balanced, mentions what worked and what didn't
   - 2: disappointed but fair
   - 1: clear about the problem, no insults
8. Do not invent time, place, or context. Only reflect what was said.
9. Output valid JSON only: { "draft": "..." }`;

// ---------- Style hints ----------
// Rotated per call to produce variety between customers.

const STYLE_HINTS = [
  "Start with a short direct sentence about the visit.",
  "Start with how you felt walking out of the shop.",
  "Start by naming the specific thing you came in for.",
  "Start with a quick summary, then add one detail.",
  "Start with a conversational opener like 'Went in for...'.",
  "Start with the outcome, then explain why.",
  "Start with a brief statement of satisfaction, then a reason.",
  "Start with a plain recap of what happened.",
];

function pickStyleHint(): string {
  return STYLE_HINTS[Math.floor(Math.random() * STYLE_HINTS.length)];
}

// ---------- Faithfulness guardrail ----------
// Rejects drafts that mention concrete facts the customer never stated.
// This is NOT a whitelist of allowed words â€” it's a blacklist of factual nouns
// that would count as invented information if they appear without being in the input.

const FACT_KEYWORDS = [
  // Services / products
  "laptop", "desktop", "computer", "printer", "monitor", "screen",
  "keyboard", "mouse", "battery", "charger", "adapter", "cable",
  "windows", "macbook", "hp", "dell", "lenovo", "asus", "acer",
  "cctv", "camera", "router", "wifi", "hardware", "software",
  "phone", "mobile", "tablet", "ssd", "hdd", "ram", "cpu", "gpu",

  // Money
  "rupee", "rupees", "rs", "price", "prices", "cost", "costs",
  "cheap", "cheaper", "expensive", "affordable", "discount",
  "free", "paid", "charged", "refund", "money", "dollars", "dollar",

  // Specific time units (only reject if customer mentioned a duration)
  "minute", "minutes", "hour", "hours", "week", "weeks",
  "month", "months", "year", "years",

  // Staff titles / names
  "manager", "owner", "employee", "technician", "engineer",
  "sir", "madam", "mr", "mrs", "miss",
];

export function isFaithful(
  draft: string,
  rawText: string,
  businessName: string = ""
): boolean {
  const rawLower = rawText.toLowerCase();
  const draftLower = draft.toLowerCase();
  const bizLower = businessName.toLowerCase();

  for (const kw of FACT_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    const inDraft = regex.test(draftLower);
    const inRaw = regex.test(rawLower);
    const inBiz = regex.test(bizLower);

    if (inDraft && !inRaw && !inBiz) {
      console.log("[polish] rejected â€” invented fact keyword:", kw);
      return false;
    }
  }

  return true;
}
// ---------- Main function ----------

export async function polishReview(
  params: PolishParams
): Promise<PolishResult> {
  const { rawText, rating, businessName, city } = params;
  const styleHint = pickStyleHint();

  const userPrompt = `Business: ${businessName}${city ? ` in ${city}` : ""}
Customer rating: ${rating}/5
Customer's rough words: "${rawText}"

Style hint for this generation: ${styleHint}

Rewrite this following ALL the rules. Output only the JSON.`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 1.0,
    presence_penalty: 0.6,
    frequency_penalty: 0.6,
    max_tokens: 180,
  });

  const content = response.choices[0]?.message?.content || "{}";

  let parsed: { drafts?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    console.log("[polish] JSON parse failed:", content);
    return { drafts: [] };
  }

    // Accept either { draft: "..." } (preferred) or legacy { drafts: [...] }
  let rawDrafts: string[] = [];
  if (typeof (parsed as any).draft === "string") {
    rawDrafts = [(parsed as any).draft];
  } else if (Array.isArray(parsed.drafts)) {
    rawDrafts = parsed.drafts.slice(0, 1) as string[];
  }

  console.log("[polish] raw drafts from AI:", rawDrafts);
  console.log("[polish] raw input:", rawText);

    const cleaned = rawDrafts
    .filter((d): d is string => typeof d === "string")
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
    .filter((d) => {
      const ok = isFaithful(d, rawText, businessName);
      if (!ok) console.log("[polish] REJECTED draft:", d);
      return ok;
    })
    .slice(0, 1);

  console.log("[polish] cleaned drafts:", cleaned);

  return { drafts: cleaned };
}
