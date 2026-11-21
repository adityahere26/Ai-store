import { z } from "zod";
import { isValidHandle, normalizeHandle } from "@/lib/instagram";
import { generateJson } from "@/lib/llm";

export const maxDuration = 30;

/**
 * One-liner ideas from an Instagram username, for the long tail the keyword list
 * can't cover (e.g. "@newmomfitness", "@chai.and.code", "@plantparentpune").
 * Only called when keyword matching finds nothing or a mix of niches.
 * Plain names ("@riya.sharma") return isName=true so the UI keeps generic lines.
 * Reads only the username text; never looks anything up on Instagram.
 */

const Body = z.object({ handle: z.string().max(60) });

const Out = z.object({
  isName: z.boolean(),
  niche: z.string().max(40),
  lines: z.array(z.string().min(15).max(140)).max(3),
});

const SYSTEM = `You read an Instagram username and suggest how the creator might describe themselves.
- If the username is mainly a person's or brand's name with no clear topic (e.g. "riya.sharma", "ankit_k", "thekapoors"), set isName true, niche "", lines [].
- Otherwise infer the topic AND the audience from the words in it (e.g. "newmomfitness" = fitness for new mothers, "plantparentpune" = gardening in Pune, "chai.and.code" = coding).
  Set niche to a short label (2-4 words, e.g. "fitness for new moms") and write 3 different first-person one-liners an Indian creator with this username might use: what they create and for whom. Each under 110 characters, simple English, varied angles.
- Never invent numbers, credentials, cities or achievements that aren't in the username.
- Avoid overused words: journey, unlock, elevate, empower, transform, game-changer, sanctuary.`;

// Usernames repeat a lot while people type and retype; keep answers for a while.
const cache = new Map<string, z.infer<typeof Out>>();

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ kind: "bad_request" }, { status: 400 });
  const handle = normalizeHandle(parsed.data.handle);
  if (!isValidHandle(handle) || handle.length < 4) return Response.json({ kind: "ok", isName: true, niche: "", lines: [] });
  const hit = cache.get(handle);
  if (hit) return Response.json({ kind: "ok", ...hit });
  try {
    const r = await generateJson({
      schema: Out,
      system: SYSTEM,
      user: `Username: @${handle}`,
      temperature: 0.6,
      budgetMs: 20_000,
    });
    const data = r.data.isName ? { isName: true, niche: "", lines: [] } : r.data;
    if (cache.size > 1000) cache.delete(cache.keys().next().value!);
    cache.set(handle, data);
    return Response.json({ kind: "ok", ...data });
  } catch {
    // Not critical: the UI keeps the keyword or generic suggestions.
    return Response.json({ kind: "unavailable" }, { status: 503 });
  }
}
