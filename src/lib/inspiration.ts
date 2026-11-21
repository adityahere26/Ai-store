import { lookupInstagram, normalizeHandle } from "./instagram";
import { generateJson } from "./llm";
import { BANNED, LANGUAGE_RULE, creatorBlock } from "./prompts";
import { LlmInspiration, type CreatorContext, type Inspiration, type InspirationCreator, type Storefront } from "./schema";

/**
 * "Starting out?" inspiration: creators to learn from, what works in the niche,
 * and post ideas that each sell a product from the store.
 *
 * Honesty by design:
 * - Instagram does not expose post performance without its official API, so we
 *   never claim view/like numbers. We link to each creator's real Reels instead.
 * - The model suggests creator handles; every handle is checked live against
 *   Instagram. Accounts that don't exist (or are private) are dropped.
 */

const SYSTEM = `You are a content strategist for Indian creators who are just starting out on Instagram.
You help them learn from established creators in their niche and plan posts that sell the products in their new store.

Rules:
- creators: 6 to 10 REAL, well-known Indian Instagram creators in this exact niche. Prefer 100K+ followers, mixing a few big names with relatable mid-size ones. Give the exact handle without "@", spelled exactly as on Instagram. Every handle is checked live and wrong ones are discarded, so include the ones you are most sure about first. "why" = one line on what a beginner can learn from them (their style or format), not invented stats.
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

LANGUAGE for hooks and outlines: ${LANGUAGE_RULE[s.language]} (creator names and "why" lines in simple English.)`;
}

/** Run async work with at most `n` in flight (be gentle with Instagram). */
async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function verifyCreators(
  list: LlmInspiration["creators"],
  skip: Set<string>,
): Promise<{ kept: InspirationCreator[]; dropped: string[] }> {
  const candidates = list
    .map((c) => ({ ...c, handle: normalizeHandle(c.handle) }))
    .filter((c) => c.handle && !skip.has(c.handle) && skip.add(c.handle))
    .slice(0, 10);

  const checked = await mapLimit(
    candidates,
    6,
    async (c): Promise<InspirationCreator | null> => {
      const r = await lookupInstagram(c.handle);
      if (r.status === "found") {
        if (r.isPrivate || (r.followers ?? 0) < 10_000) return null; // not a useful public example
        return { handle: r.handle, name: r.fullName || c.name, why: c.why, check: "verified", followers: r.followers, posts: r.posts, avatarUrl: r.avatarUrl };
      }
      if (r.status === "unavailable") return { handle: c.handle, name: c.name, why: c.why, check: "unchecked" };
      return null; // not_found / invalid: the model got it wrong, drop it
    },
  );
  console.info(`[inspiration] creator check: ${candidates.map((c, i) => `@${c.handle}=${checked[i]?.check ?? "dropped"}`).join(", ")}`);
  return {
    kept: checked.filter((c): c is InspirationCreator => !!c),
    dropped: candidates.filter((_, i) => !checked[i]).map((c) => c.handle),
  };
}

const sortCreators = (list: InspirationCreator[]) =>
  // Verified first, biggest first; keep the list short enough to actually study.
  [...list].sort((a, b) => (a.check === b.check ? (b.followers ?? 0) - (a.followers ?? 0) : a.check === "verified" ? -1 : 1)).slice(0, 5);

function matchProduct(title: string, s: Storefront): string | null {
  const t = title.trim().toLowerCase();
  if (!t) return null;
  const hit =
    s.products.find((p) => p.title.trim().toLowerCase() === t) ??
    s.products.find((p) => p.title.toLowerCase().includes(t) || t.includes(p.title.toLowerCase()));
  return hit?.title ?? null;
}

export async function buildInspiration(ctx: CreatorContext, s: Storefront): Promise<Inspiration> {
  const res = await generateJson({
    schema: LlmInspiration,
    system: SYSTEM,
    user: promptFor(ctx, s),
    temperature: 0.9,
    qualityCheck: (d) => {
      const issues: string[] = [];
      if (d.creators.length < 3) issues.push("Suggest at least 3 real creators (more if you're confident).");
      const text = JSON.stringify(d.ideas).toLowerCase();
      const hits = BANNED.filter((w) => text.includes(w));
      if (hits.length) issues.push(`Remove these overused words: ${hits.join(", ")}.`);
      if (/\b\d+(\.\d+)?\s*(k|m|lakh)?\s*(views|likes)\b/i.test(JSON.stringify(d.patterns))) issues.push("Don't state view or like numbers.");
      return issues;
    },
  });
  const seen = new Set<string>(ctx.handle ? [ctx.handle] : []);
  const first = await verifyCreators(res.data.creators, seen);
  let creators = first.kept;

  // One correction round if too few handles were real: tell the model exactly what failed.
  if (creators.filter((c) => c.check === "verified").length < 3) {
    try {
      const retry = await generateJson({
        schema: LlmInspiration.pick({ creators: true }),
        system: SYSTEM,
        user: `${promptFor(ctx, s)}

Only return "creators". We checked your earlier suggestions on Instagram.
These handles DO NOT exist (don't repeat them or near-spellings): ${first.dropped.map((h) => "@" + h).join(", ") || "none"}.
Already confirmed (don't repeat): ${creators.map((c) => "@" + c.handle).join(", ") || "none"}.
Suggest 6 to 10 different real Indian creators in "${s.niche}" with exact handles.`,
        temperature: 0.7,
        budgetMs: 35_000,
      });
      creators = [...creators, ...(await verifyCreators(retry.data.creators, seen)).kept];
    } catch {
      /* keep what we have */
    }
  }

  return {
    niche: s.niche,
    creators: sortCreators(creators),
    patterns: res.data.patterns,
    ideas: res.data.ideas.map((i) => ({ ...i, productTitle: matchProduct(i.productTitle, s) })),
    createdAt: Date.now(),
  };
}
