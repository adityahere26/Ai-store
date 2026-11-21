import { z } from "zod";
import { isValidHandle, lookupInstagram, normalizeHandle } from "@/lib/instagram";
import { generateJson, LlmError } from "@/lib/llm";

export const maxDuration = 60;

/**
 * Username ideas for creators starting a new Instagram page.
 * The model brainstorms; every suggestion is then checked against Instagram's
 * public profile page. We only show names that look free. ("Looks", because
 * deactivated or reserved names can't be seen publicly; Instagram decides at sign-up.)
 */

const Body = z.object({
  description: z.string().max(1000).optional(),
  current: z.string().max(100).optional(),
});

const Suggestions = z.object({ handles: z.array(z.string().min(3).max(40)).min(6).max(12) });

const SYSTEM = `You suggest Instagram usernames for Indian creators starting a brand-new page.
Rules: 6 to 12 suggestions. Lowercase letters, digits, dots and underscores only; no spaces; 6 to 24 characters; no dot at the start or end; no two dots in a row.
Make them short, easy to say aloud and spell, clearly about the creator's niche, and brandable (e.g. "desk.yoga.daily", "yogawithriya").
Mix styles: name-based, niche-based, playful. Avoid trademarks and celebrity names. Don't just add random numbers.`;

async function checkAll(handles: string[]) {
  const out: { handle: string; status: "available" | "taken" | "unknown"; name?: string; followers?: number }[] = [];
  let i = 0;
  // At most 4 checks in flight: be gentle with Instagram.
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (i < handles.length) {
        const h = handles[i++];
        const r = await lookupInstagram(h);
        if (r.status === "not_found") out.push({ handle: h, status: "available" });
        else if (r.status === "found") out.push({ handle: h, status: "taken", name: r.fullName, followers: r.followers });
        else if (r.status === "unavailable") out.push({ handle: h, status: "unknown" });
      }
    }),
  );
  // Keep the model's order.
  return handles.map((h) => out.find((o) => o.handle === h)).filter((x): x is NonNullable<typeof x> => !!x);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ kind: "bad_request", message: "Something was off with that request." }, { status: 400 });
  const { description, current } = parsed.data;
  try {
    const res = await generateJson({
      schema: Suggestions,
      system: SYSTEM,
      user: `About the creator: """${description?.trim() || "(no description)"}"""${
        current?.trim() ? `\nThey tried "@${normalizeHandle(current)}" (taken or not suitable); suggest alternatives in a similar spirit.` : ""
      }\nSuggest usernames now.`,
      temperature: 1,
      budgetMs: 35_000,
    });
    const seen = new Set<string>();
    const handles = res.data.handles
      .map(normalizeHandle)
      .filter((h) => isValidHandle(h) && h.length >= 4 && !seen.has(h) && seen.add(h))
      .slice(0, 10);
    const checked = await checkAll(handles);
    return Response.json({
      kind: "ok",
      // Only free-looking names are offered; unknowns only if Instagram couldn't be reached at all.
      suggestions: checked.filter((c) => c.status === "available").slice(0, 6),
      unchecked: checked.every((c) => c.status === "unknown") ? checked.map((c) => c.handle).slice(0, 6) : [],
      takenCount: checked.filter((c) => c.status === "taken").length,
    });
  } catch (e) {
    console.error("[handles] failed:", (e as LlmError).kind, (e as Error).message);
    return Response.json({ kind: "ai_unavailable", message: "Couldn't suggest names right now. Try typing one instead." }, { status: 503 });
  }
}
