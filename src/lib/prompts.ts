import { nanoid } from "nanoid";
import { guardPrice, pricingGuideForPrompt } from "./pricing";
import {
  FORMATS,
  type CreatorContext,
  type Language,
  type LlmStorefront,
  type Product,
  type Storefront,
  type Theme,
  LlmProduct,
} from "./schema";
import type { z } from "zod";

const LANGUAGE_RULE: Record<Language, string> = {
  english:
    "Write all creator-facing copy in simple, warm Indian English. Short sentences. No jargon.",
  hinglish:
    "Write all copy in natural Hinglish (Hindi words in Roman script mixed with English), the way Indian creators write Instagram captions, e.g. 'Ghar pe hi fit raho, bina gym ke'. Product format names may stay in English.",
  hindi:
    "Write all copy in simple, conversational Hindi in Devanagari script. Common English words (course, template, live, 1:1) may stay in English.",
};

const BANNED = [
  "unlock",
  "journey",
  "elevate",
  "game-changer",
  "game changer",
  "transformative",
  "empower",
  "delve",
  "embark",
  "holistic",
  "next level",
  "seamless",
  "in today's fast-paced",
];

export const SYSTEM_PROMPT = `You are the storefront strategist inside SuperProfile, a link-in-bio store used by Indian creators to sell courses, digital products, webinars and 1:1 sessions.

Your job: turn what we know about a creator into a store they would be proud to share today. The creator is usually a micro-creator (5K-100K followers) who has never priced a product and is setting this up on their phone.

How to think:
1. Find the ONE thing this creator's audience already trusts them for. Products must be obvious extensions of that, not generic "coaching".
2. Build a value ladder of 2-4 products with DIFFERENT formats:
   - entry: a low-risk first purchase (usually ₹99-₹499: e-book, template pack, live workshop). Indian buyers try cheap first.
   - core: the main offer (recorded course, cohort, or 1:1).
   - premium (optional): high-touch, limited (1:1, cohort, or community).
   Prefer 3 products. Use 2 only if the input is thin. Use 4 only if the creator clearly has range.
3. Price for Indian buyers: stay within the price bands provided, use familiar price points (₹99, ₹199, ₹499, ₹999, ₹1,999…), and explain each price in one plain sentence the creator understands, referencing format, effort, audience size or comparable products (e.g. "Less than a pizza; easy yes for a first-time buyer").
4. Make titles specific and outcome-led, e.g. "21-Day Home Workout Plan for Busy Moms", not "Fitness Course". Mention concrete deliverables in highlights (number of videos, sessions, pages, duration, WhatsApp support, etc.) that are realistic for one creator to deliver.
5. Prices must rise with the ladder: entry < core < premium. Premium is never cheaper than core.
6. Keep every product internally consistent: the title, description and highlights must agree on durations, counts and format (a "15-minute" title cannot describe a 60-minute session).
7. Bio: first person, 2-3 short sentences, who they help + what result + a human detail from the input. The tagline is a 4-10 word hook.
8. displayName: use the real name or brand from the input. If none is given, NEVER invent a personal name; use a short brand-style name from the niche (e.g. "Desk Yoga Studio") and add "We assumed your store name…" to assumptions.

Honesty rules (strict):
- NEVER invent facts: no fake student counts, testimonials, certifications, years of experience, awards, or results the input does not state.
- Followers are NOT students, clients or customers. Never turn a follower count into "X students taught" or similar.
- If you had to guess something important (e.g. their sub-niche or audience), list it in "assumptions" in short creator-facing language starting with "We assumed…" so they can correct it. Max 3. Empty array if nothing was guessed.
- Avoid hype and these overused words: ${BANNED.join(", ")}.

When to stop and ask instead:
- Set status "need_more_info" ONLY if the input contains no identifiable skill, topic or niche at all (gibberish, random characters, a greeting, or something unrelated like "hello" or "asdf"). Then write ONE friendly, specific question in clarifyingQuestion, leave products empty and other strings empty.
- A single word that is a niche (e.g. "yoga", "astrology", "UPSC") is enough: generate, and record your guesses in assumptions.
- Otherwise status is "ok" and clarifyingQuestion is "".

suggestedTheme: "classic" (clean white and blue, for education, exam prep, finance, business, careers), "midnight" (bold dark, for tech, design, fitness, gaming, music), "blush" (soft pastel, for lifestyle, food, fashion, beauty, astrology, wellness, parenting).

Allowed formats: ${FORMATS.join(", ")}. For "community", the price is per month.`;

export function creatorBlock(ctx: CreatorContext): string {
  const parts: string[] = [];
  if (ctx.igSummary) parts.push(`INSTAGRAM PROFILE (real data, use it):\n${ctx.igSummary}`);
  else if (ctx.handle) parts.push(`Instagram handle: @${ctx.handle} (profile could not be read; do not infer facts from the handle beyond the name)`);
  if (ctx.description) parts.push(`CREATOR'S OWN DESCRIPTION:\n"""${ctx.description}"""`);
  return parts.join("\n\n");
}

export function storefrontUserPrompt(ctx: CreatorContext): string {
  return `${creatorBlock(ctx)}

${pricingGuideForPrompt(ctx.followers)}

LANGUAGE: ${LANGUAGE_RULE[ctx.language]}

Create the storefront now.`;
}

/* ---------------- Quality control ---------------- */

function bannedHits(text: string): string[] {
  const t = text.toLowerCase();
  return BANNED.filter((w) => t.includes(w));
}

export function storefrontQuality(out: LlmStorefront): string[] {
  if (out.status === "need_more_info") {
    return out.clarifyingQuestion.trim() ? [] : ["clarifyingQuestion is empty"];
  }
  const issues: string[] = [];
  if (out.products.length < 2) issues.push("Return 2 to 4 products.");
  if (!out.bio.trim() || out.bio.length < 40) issues.push("Bio is missing or too short.");
  if (!out.displayName.trim()) issues.push("displayName is empty.");
  const formats = new Set(out.products.map((p) => p.format));
  if (formats.size < out.products.length) issues.push("Each product must use a different format.");
  if (!out.products.some((p) => p.tier === "entry")) issues.push("Include one entry-tier product.");
  const maxPrice = (t: string) => Math.max(0, ...out.products.filter((p) => p.tier === t).map((p) => p.priceInr));
  const minPrice = (t: string) => Math.min(Infinity, ...out.products.filter((p) => p.tier === t).map((p) => p.priceInr));
  if (maxPrice("entry") > minPrice("core") || maxPrice("core") > minPrice("premium") || maxPrice("entry") > minPrice("premium"))
    issues.push("Prices must rise with tier: entry < core < premium.");
  const titles = out.products.map((p) => p.title.toLowerCase());
  if (new Set(titles).size < titles.length) issues.push("Product titles must be distinct.");
  const allText = [out.bio, out.tagline, ...out.products.flatMap((p) => [p.title, p.description, ...p.highlights])].join(" ");
  const hits = bannedHits(allText);
  if (hits.length) issues.push(`Remove these overused words: ${hits.join(", ")}.`);
  return issues;
}

export function productQuality(p: z.infer<typeof LlmProduct>, others: Product[]): string[] {
  const issues: string[] = [];
  if (others.some((o) => o.title.trim().toLowerCase() === p.title.trim().toLowerCase()))
    issues.push("Title duplicates another product.");
  const hits = bannedHits([p.title, p.description, ...p.highlights].join(" "));
  if (hits.length) issues.push(`Remove these overused words: ${hits.join(", ")}.`);
  return issues;
}

/* ---------------- Post-processing: LLM output -> app model ---------------- */

const TIER_ORDER = { entry: 0, core: 1, premium: 2 } as const;

export function finalizeProduct(p: z.infer<typeof LlmProduct>, followers?: number): Product {
  const { price, adjusted } = guardPrice(p.format, p.priceInr, followers);
  return { ...p, id: nanoid(8), priceInr: price, priceAdjusted: adjusted || undefined };
}

export function toStorefront(
  out: LlmStorefront,
  ctx: CreatorContext & { avatarUrl?: string; fullName?: string },
): Storefront {
  const products = out.products
    .slice(0, 4)
    .map((p) => finalizeProduct(p, ctx.followers))
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.priceInr - b.priceInr);
  return {
    // A verified Instagram name beats anything the model writes.
    displayName: ctx.fullName?.trim() || out.displayName.trim() || (ctx.handle ? `@${ctx.handle}` : "Creator"),
    handle: ctx.handle,
    avatarUrl: ctx.avatarUrl,
    followers: ctx.followers,
    niche: out.niche,
    tagline: out.tagline,
    bio: out.bio,
    language: ctx.language,
    theme: out.suggestedTheme as Theme,
    products,
  };
}

/* ---------------- Single-part regeneration prompts ---------------- */

export function storeSummary(s: Storefront): string {
  return `CURRENT STORE (creator may have edited it; respect their edits):
Name: ${s.displayName}
Niche: ${s.niche}
Tagline: ${s.tagline}
Bio: ${s.bio}
Products:
${s.products.map((p, i) => `${i + 1}. [${p.tier}/${p.format}] ${p.title} — ₹${p.priceInr}`).join("\n")}`;
}

export function bioPrompt(ctx: CreatorContext, s: Storefront, instruction?: string) {
  return `${creatorBlock(ctx)}

${storeSummary(s)}

Rewrite ONLY the tagline and bio. Make it noticeably different from the current version.${
    instruction ? `\nCreator's request: "${instruction}"` : ""
  }
Rules: first person, 2-3 short sentences, no invented facts, avoid: ${BANNED.join(", ")}.
LANGUAGE: ${LANGUAGE_RULE[s.language]}`;
}

export function productPrompt(ctx: CreatorContext, s: Storefront, index: number, instruction?: string) {
  const cur = s.products[index];
  return `${creatorBlock(ctx)}

${storeSummary(s)}

${pricingGuideForPrompt(ctx.followers)}

Replace product #${index + 1} ("${cur.title}", ${cur.format}, ₹${cur.priceInr}) with a better or fresher idea. Keep the "${cur.tier}" tier unless the creator asks otherwise. It must not duplicate the other products' formats or topics.${
    instruction ? `\nCreator's request: "${instruction}"` : ""
  }
Honesty: no invented facts or testimonials. Avoid: ${BANNED.join(", ")}.
LANGUAGE: ${LANGUAGE_RULE[s.language]}`;
}

export { SYSTEM_PROMPT as BIO_SYSTEM, SYSTEM_PROMPT as PRODUCT_SYSTEM };
