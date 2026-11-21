import { lookupInstagram, normalizeHandle } from "./instagram";
import { generateJson } from "./llm";
import { BANNED, LANGUAGE_RULE, creatorBlock } from "./prompts";
import { LlmInspiration, type CreatorContext, type Inspiration, type InspirationCreator, type Storefront } from "./schema";
import { webSearch, type WebSource } from "./webSearch";

/**
 * "Starting out?" inspiration: creators to learn from, hashtags with real top
 * posts, what works in the niche, and post ideas that each sell a product.
 *
 * Honesty by design:
 * - Creators come from the WEB first: we search for published lists of creators
 *   in the niche (Tavily), and the model may only pick people named in those
 *   pages, citing them. Code then checks the name (and handle) really appear in
 *   the cited page. Each card links to its source.
 * - If web search is unavailable, we fall back to model suggestions, checked
 *   against public Instagram profiles where possible, and clearly labelled.
 * - Instagram doesn't expose post performance publicly, so we never claim
 *   view/like numbers; hashtags and Reels links show real top posts instead.
 */

const SYSTEM = `You are a content strategist for Indian creators who are just starting out on Instagram.
You help them learn from established creators in their niche and plan posts that sell the products in their new store.

Rules:
- creators: see the CREATORS rule in the user message.
- hashtags: 3-6 real, commonly used Instagram hashtags for this niche (without "#", lowercase, letters/digits/underscores only), mixing broad and specific/Indian ones. "why" = one line on what kind of top posts the creator will find there.
- patterns: 2-4 content patterns that work in this niche on Instagram (format + a concrete example). These are general patterns, NOT claims about specific posts. Never state view, like or follower numbers.
- ideas: 6 specific post ideas for THIS creator, a mix of reels, carousels and stories. Each has a scroll-stopping hook (first line / first 2 seconds), a 2-4 step outline, and productTitle = the exact title of the store product it naturally leads to (or "" if none). Ideas must be doable by one person with a phone.
- Avoid these overused words: ${BANNED.join(", ")}.`;

const MEMORY_CREATORS_RULE = `CREATORS rule: 6 to 10 REAL, well-known Indian Instagram creators in this exact niche. Prefer 100K+ followers, mixing a few big names with relatable mid-size ones. Give the exact handle without "@", spelled exactly as on Instagram. Every handle is checked live and wrong ones are discarded, so include the ones you are most sure about first. "why" = one line on what a beginner can learn from them (their style or format), not invented stats. sourceIds = [].`;

function webCreatorsRule(sources: WebSource[]) {
  return `CREATORS rule: up to 8 creators in this niche who are NAMED IN THE WEB SOURCES below (prefer Indian creators). Never add anyone who isn't in the sources. Only include non-Indian creators if the sources name fewer than 3 Indian ones. For each: name exactly as written in the source; handle without "@" only if the source shows it, otherwise ""; why = one line on what a beginner can learn from them, based on what the source says; sourceIds = the [n] numbers of the sources that mention them. Ignore sources that aren't about this niche.

WEB SOURCES:
${sources.map((x) => `[${x.id}] ${x.title} (${x.domain})\n${x.content}`).join("\n\n")}`;
}

function promptFor(ctx: CreatorContext, s: Storefront, creatorsRule = MEMORY_CREATORS_RULE) {
  return `${creatorBlock(ctx)}

STORE
Niche: ${s.niche}
Tagline: ${s.tagline}
Products:
${s.products.map((p) => `- "${p.title}" (${p.format}, ₹${p.priceInr})`).join("\n")}

LANGUAGE for hooks and outlines: ${LANGUAGE_RULE[s.language]} (creator names, hashtags and "why" lines in simple English.)

${creatorsRule}`;
}

const norm = (t: string) =>
  t
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9@._ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Keep only creators the cited pages really mention (name must appear in a cited
 * source; a handle is kept only if it appears there too), then check handles on
 * Instagram where reachable.
 */
async function groundWebCreators(list: LlmInspiration["creators"], sources: WebSource[], skip: Set<string>): Promise<InspirationCreator[]> {
  const byId = new Map(sources.map((x) => [x.id, x]));
  const grounded: (InspirationCreator & { handle: string })[] = [];
  const seenNames = new Set<string>();
  for (const c of list) {
    const cited = c.sourceIds.map((id) => byId.get(id)).filter((x): x is WebSource => !!x);
    const name = c.name.trim();
    const n = norm(name);
    if (!n || seenNames.has(n)) continue;
    const hit = cited.find((x) => norm(x.content + " " + x.title).includes(n));
    if (!hit) continue; // the model named someone its sources don't mention: drop
    let handle = normalizeHandle(c.handle || "");
    if (handle && (!norm(hit.content).includes(handle.toLowerCase()) || skip.has(handle))) handle = ""; // handle not in the page: don't trust it
    seenNames.add(n);
    grounded.push({ handle, name, why: c.why, check: "web", source: { title: hit.title, url: hit.url, domain: hit.domain } });
  }

  // Bonus: confirm handles on Instagram when reachable (works locally; blocked from cloud servers).
  const checked = await mapLimit(grounded, 5, async (c) => {
    if (!c.handle) return c;
    const r = await lookupInstagram(c.handle);
    // A "top creator" with a tiny account means the page's handle points at someone else (e.g. @warikoo
    // vs the real @ankurwarikoo): keep the person, drop the handle.
    if (r.status === "found" && !r.isPrivate && (r.followers ?? 0) >= 5_000)
      return { ...c, name: r.fullName || c.name, check: "verified" as const, followers: r.followers, posts: r.posts, avatarUrl: r.avatarUrl };
    if (r.status === "found" || r.status === "not_found" || r.status === "invalid") return { ...c, handle: "" };
    return c;
  });
  console.info(`[inspiration] web creators: ${checked.map((c) => `${c.name}${c.handle ? ` @${c.handle}` : ""}=${c.check}`).join(", ") || "none"}`);
  return checked;
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
): Promise<{ kept: InspirationCreator[]; dropped: string[]; reachable: boolean }> {
  const candidates = list
    .map((c) => ({ ...c, handle: normalizeHandle(c.handle) }))
    .filter((c) => c.handle && !skip.has(c.handle) && skip.add(c.handle))
    .slice(0, 10);

  let reachable = false;
  const checked = await mapLimit(
    candidates,
    6,
    async (c): Promise<InspirationCreator | null> => {
      const r = await lookupInstagram(c.handle);
      if (r.status !== "unavailable") reachable = true;
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
    reachable,
  };
}

const sortCreators = (list: InspirationCreator[]) =>
  // Verified first, biggest first; keep the list short enough to actually study.
  [...list]
    .sort((a, b) => {
      const rank = { verified: 0, web: 1, unchecked: 2 } as const;
      return rank[a.check] - rank[b.check] || (b.followers ?? 0) - (a.followers ?? 0);
    })
    .slice(0, 5);

function matchProduct(title: string, s: Storefront): string | null {
  const t = title.trim().toLowerCase();
  if (!t) return null;
  const hit =
    s.products.find((p) => p.title.trim().toLowerCase() === t) ??
    s.products.find((p) => p.title.toLowerCase().includes(t) || t.includes(p.title.toLowerCase()));
  return hit?.title ?? null;
}

export async function buildInspiration(ctx: CreatorContext, s: Storefront): Promise<Inspiration> {
  // 1) Look for published creator lists on the web (not Instagram).
  const sources = await webSearch(`top Indian Instagram ${s.niche} creators influencers to follow`, {
    maxResults: 8,
    excludeDomains: ["instagram.com", "facebook.com", "threads.net"],
  });
  const webMode = sources.length >= 2;

  const res = await generateJson({
    schema: LlmInspiration,
    system: SYSTEM,
    user: promptFor(ctx, s, webMode ? webCreatorsRule(sources) : MEMORY_CREATORS_RULE),
    temperature: 0.9,
    qualityCheck: (d) => {
      const issues: string[] = [];
      if (!webMode && d.creators.length < 3) issues.push("Suggest at least 3 real creators (more if you're confident).");
      const text = JSON.stringify(d.ideas).toLowerCase();
      const hits = BANNED.filter((w) => text.includes(w));
      if (hits.length) issues.push(`Remove these overused words: ${hits.join(", ")}.`);
      if (/\b\d+(\.\d+)?\s*(k|m|lakh)?\s*(views|likes)\b/i.test(JSON.stringify(d.patterns))) issues.push("Don't state view or like numbers.");
      return issues;
    },
  });
  const seen = new Set<string>(ctx.handle ? [ctx.handle] : []);
  let creators: InspirationCreator[] = [];
  if (webMode) creators = await groundWebCreators(res.data.creators, sources, seen);
  // Fall back to model suggestions if the web gave us too little.
  const first = creators.length >= 2 ? { kept: creators, dropped: [] as string[], reachable: false } : await verifyCreators(res.data.creators.filter((c) => c.handle), seen);
  creators = first.kept;

  // Up to two correction rounds if too few handles were real: tell the model exactly what failed.
  const dropped = [...first.dropped];
  // Correction rounds only help when Instagram actually answered; from cloud servers it usually doesn't.
  for (let round = 0; first.reachable && round < 2 && creators.filter((c) => c.check === "verified").length < 3; round++) {
    try {
      const retry = await generateJson({
        schema: LlmInspiration.pick({ creators: true }),
        system: SYSTEM,
        user: `${promptFor(ctx, s)}

Only return "creators". We checked your earlier suggestions on Instagram.
These handles DO NOT exist (don't repeat them or near-spellings): ${dropped.map((h) => "@" + h).join(", ") || "none"}.
Already confirmed (don't repeat): ${creators.map((c) => "@" + c.handle).join(", ") || "none"}.
Suggest 6 to 10 different real Indian creators in "${s.niche}" (or the broader ${s.niche.split(/\s|&/)[0]} space) with exact handles.`,
        temperature: 0.7,
        budgetMs: 30_000,
      });
      const more = await verifyCreators(retry.data.creators, seen);
      creators = [...creators, ...more.kept];
      dropped.push(...more.dropped);
    } catch {
      break; // keep what we have
    }
  }

  const seenTags = new Set<string>();
  const hashtags = res.data.hashtags
    .map((h) => ({ ...h, tag: h.tag.replace(/^#+/, "").toLowerCase().replace(/[^a-z0-9_]/g, "") }))
    .filter((h) => h.tag.length >= 2 && !seenTags.has(h.tag) && seenTags.add(h.tag));

  return {
    niche: s.niche,
    creators: sortCreators(creators),
    hashtags,
    patterns: res.data.patterns,
    ideas: res.data.ideas.map((i) => ({ ...i, productTitle: matchProduct(i.productTitle, s) })),
    createdAt: Date.now(),
  };
}
