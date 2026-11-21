import { z } from "zod";
import { igSummary, lookupInstagram } from "@/lib/instagram";
import { generateJson, LlmError } from "@/lib/llm";
import { LANGUAGE_RULE } from "@/lib/prompts";
import { LANGUAGES } from "@/lib/schema";

export const maxDuration = 60;

/**
 * Drafts the "About you" answers from the creator's one-liner (and public
 * Instagram profile, if any). The creator then edits them.
 *
 * Honesty: who/what/why may be phrased from the input, but social proof and the
 * personal story are NEVER invented. They are only filled with facts the input
 * states (e.g. a follower count); otherwise they stay empty for the creator.
 */

const Body = z.object({
  description: z.string().max(1000).optional(),
  handle: z.string().max(100).optional(),
  language: z.enum(LANGUAGES).default("english"),
});

const Draft = z.object({
  who: z.string().max(300),
  what: z.string().max(300),
  why: z.string().max(300),
  proof: z.string().max(400),
});

const SYSTEM = `You help Indian creators introduce themselves on their store page.
From what we know about the creator, draft short first-person answers they will edit:
- who: who they are, in one sentence (e.g. "I'm a yoga teacher and a working mom from Pune.").
- what: what they do or create and for whom, one sentence.
- why: why someone should follow them: the specific value or angle, one or two sentences.
- proof: social proof ONLY from facts explicitly present in the input (follower count, years of experience, certifications, results, clients, press). Phrase them plainly. If the input states none, return "". NEVER invent achievements, numbers, credentials or testimonials.
Keep each answer short, specific and human. No hype words (unlock, journey, elevate, game-changer, transform). If something isn't known, write it in a general but honest way rather than inventing specifics (no made-up cities, names or ages).`;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ kind: "bad_request", message: "Something was off with that request." }, { status: 400 });
  const { description, handle, language } = parsed.data;
  if (!description?.trim() && !handle?.trim())
    return Response.json({ kind: "bad_request", message: "Add a one-line description first so we have something to draft from." }, { status: 400 });

  let profile = "";
  if (handle?.trim()) {
    const ig = await lookupInstagram(handle);
    if (ig.status === "found") profile = igSummary(ig);
  }

  try {
    const res = await generateJson({
      schema: Draft,
      system: SYSTEM,
      user: `${profile ? `INSTAGRAM PROFILE (real data):\n${profile}\n\n` : ""}CREATOR'S ONE-LINER:\n"""${description?.trim() || "(none)"}"""

LANGUAGE: ${LANGUAGE_RULE[language]}`,
      temperature: 0.7,
      budgetMs: 40_000,
    });
    return Response.json({ kind: "ok", draft: res.data });
  } catch (e) {
    console.error("[about] failed:", (e as LlmError).kind, (e as Error).message);
    return Response.json({ kind: "ai_unavailable", message: "Couldn't draft this right now. You can write it yourself, or try again." }, { status: 503 });
  }
}
