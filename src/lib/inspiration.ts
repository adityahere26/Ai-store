import { generateJson } from "./llm";
import { BANNED, LANGUAGE_RULE, creatorBlock } from "./prompts";
import { LlmInspiration, type CreatorContext, type Inspiration, type Storefront } from "./schema";

/**
 * "Starting out?" inspiration: where to find top content in the niche, what
 * formats work, and post ideas that each sell a product from the store.
 *
 * Honesty by design: we don't read Instagram, so we never name specific
 * creators (unverified handles are often wrong) or quote view/like numbers.
 * Instead we point to hashtag pages, which always exist and show real top posts.
 */

const SYSTEM = `You are a content strategist for Indian creators who are just starting out on Instagram.
You help them learn from what already works in their niche and plan posts that sell the products in their new store.

Rules:
- hashtags: 3-6 real, commonly used Instagram hashtags for this niche (without "#", lowercase, letters/digits/underscores only), mixing broad (e.g. "yoga") and specific/Indian ones (e.g. "yogaindia", "deskyoga"). "why" = one line on what kind of top posts the creator will find there and what to notice in them. Don't name specific creators.
- patterns: 2-4 content patterns that work in this niche on Instagram (format + a concrete example). These are general patterns, NOT claims about specific posts. Never state view, like or follower numbers.
- ideas: 6 specific post ideas for THIS creator, a mix of reels, carousels and stories. Each has a scroll-stopping hook (first line / first 2 seconds), a 2-4 step outline, and productTitle = the exact title of the store product it naturally leads to (or "" if none). Ideas must be doable by one person with a phone.
- Avoid these overused words: ${BANNED.join(", ")}.`;

function promptFor(ctx: CreatorContext, s: Storefront) {
  return `${creatorBlock(ctx)}

STORE
Niche: ${s.niche}
Tagline: ${s.tagline}
Products:
${s.products.map((p) => `- "${p.title}" (${p.format}, ₹${p.priceInr})`).join("\n")}

LANGUAGE for hooks and outlines: ${LANGUAGE_RULE[s.language]} (hashtags and "why" lines in simple English.)`;
}

function matchProduct(title: string, s: Storefront): string | null {
  const t = title.trim().toLowerCase();
  if (!t) return null;
  const hit =
    s.products.find((p) => p.title.trim().toLowerCase() === t) ??
    s.products.find((p) => p.title.toLowerCase().includes(t) || t.includes(p.title.toLowerCase()));
  return hit?.title ?? null;
}

const cleanTag = (t: string) => t.replace(/^#+/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");

export async function buildInspiration(ctx: CreatorContext, s: Storefront): Promise<Inspiration> {
  const res = await generateJson({
    schema: LlmInspiration,
    system: SYSTEM,
    user: promptFor(ctx, s),
    temperature: 0.9,
    qualityCheck: (d) => {
      const issues: string[] = [];
      const text = JSON.stringify(d.ideas).toLowerCase();
      const hits = BANNED.filter((w) => text.includes(w));
      if (hits.length) issues.push(`Remove these overused words: ${hits.join(", ")}.`);
      if (/\b\d+(\.\d+)?\s*(k|m|lakh)?\s*(views|likes)\b/i.test(JSON.stringify(d.patterns))) issues.push("Don't state view or like numbers.");
      return issues;
    },
  });
  const seen = new Set<string>();
  const hashtags = res.data.hashtags
    .map((h) => ({ ...h, tag: cleanTag(h.tag) }))
    .filter((h) => h.tag.length >= 2 && !seen.has(h.tag) && seen.add(h.tag));
  return {
    niche: s.niche,
    hashtags,
    patterns: res.data.patterns,
    ideas: res.data.ideas.map((i) => ({ ...i, productTitle: matchProduct(i.productTitle, s) })),
    createdAt: Date.now(),
  };
}
