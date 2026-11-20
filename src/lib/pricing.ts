import type { Format } from "./schema";

/**
 * Pricing guardrails for Indian creator products.
 *
 * The LLM proposes a price and a rationale; this module is the deterministic
 * safety net. It keeps prices inside a sane band for the format and audience
 * size, and snaps them to price points Indian buyers are used to (₹499, ₹999…).
 * The model is good at "what fits this niche", bad at staying consistent;
 * code is the reverse. So each does what it is good at.
 */

/** Familiar Indian price points, ascending. */
export const PRICE_POINTS = [
  49, 99, 149, 199, 249, 299, 349, 399, 499, 599, 699, 799, 999, 1199, 1499,
  1999, 2499, 2999, 3499, 3999, 4999, 5999, 7499, 9999, 12999, 14999, 19999,
  24999,
];

type Band = [min: number, max: number];

/** Price bands per format, by audience tier (small <10K, mid 10–50K, large 50K+). */
const BANDS: Record<Format, { small: Band; mid: Band; large: Band }> = {
  ebook: { small: [49, 299], mid: [99, 499], large: [149, 799] },
  template_pack: { small: [99, 499], mid: [149, 999], large: [199, 1499] },
  live_workshop: { small: [49, 299], mid: [99, 499], large: [199, 999] },
  recorded_course: { small: [299, 1999], mid: [499, 2999], large: [999, 4999] },
  cohort_course: { small: [999, 4999], mid: [1499, 7499], large: [2999, 14999] },
  one_on_one: { small: [199, 999], mid: [499, 1999], large: [999, 4999] },
  community: { small: [49, 299], mid: [99, 499], large: [199, 999] },
};

export type AudienceTier = "small" | "mid" | "large";

export function audienceTier(followers?: number): AudienceTier {
  if (!followers || followers < 10_000) return "small";
  if (followers < 50_000) return "mid";
  return "large";
}

export function priceBand(format: Format, followers?: number): Band {
  return BANDS[format][audienceTier(followers)];
}

export function snapToPricePoint(price: number): number {
  let best = PRICE_POINTS[0];
  for (const p of PRICE_POINTS) {
    if (Math.abs(p - price) < Math.abs(best - price)) best = p;
  }
  return best;
}

/** Returns a guarded price and whether we had to move it. */
export function guardPrice(
  format: Format,
  proposed: number,
  followers?: number,
): { price: number; adjusted: boolean } {
  const [min, max] = priceBand(format, followers);
  const clamped = Math.min(max, Math.max(min, proposed));
  let price = snapToPricePoint(clamped);
  // Snapping can step just outside the band; walk back in.
  if (price > max) price = [...PRICE_POINTS].reverse().find((p) => p <= max) ?? max;
  if (price < min) price = PRICE_POINTS.find((p) => p >= min) ?? min;
  return { price, adjusted: price !== proposed };
}

/** Text block injected into the prompt so the model reasons with the same bands. */
export function pricingGuideForPrompt(followers?: number): string {
  const tier = audienceTier(followers);
  const lines = (Object.keys(BANDS) as Format[]).map((f) => {
    const [a, b] = BANDS[f][tier];
    return `- ${f}: ₹${a}–₹${b}${f === "community" ? " per month" : ""}`;
  });
  return `Audience tier: ${tier}${followers ? ` (~${followers.toLocaleString("en-IN")} followers)` : " (unknown, assume small)"}.\nPrice bands for this tier:\n${lines.join("\n")}`;
}

export function formatInr(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}
