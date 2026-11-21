import { z } from "zod";
import { generateJson, LlmError } from "@/lib/llm";
import {
  SYSTEM_PROMPT,
  bioPrompt,
  languageQuality,
  finalizeProduct,
  productPrompt,
  productQuality,
  storefrontQuality,
  storefrontUserPrompt,
  toStorefront,
} from "@/lib/prompts";
import { CreatorContext, IG_BIO_MAX, LlmBio, LlmProduct, LlmStorefront, Storefront, fitBio } from "@/lib/schema";

export const maxDuration = 90;

const Body = z.object({
  ctx: CreatorContext,
  storefront: Storefront,
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("bio") }),
    z.object({ kind: z.literal("product"), index: z.number().int().min(0).max(3) }),
    z.object({ kind: z.literal("all") }),
  ]),
  instruction: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ kind: "bad_request", message: "Something was off with that request." }, { status: 400 });
  const { ctx, storefront: s, target, instruction } = parsed.data;
  // Keep the creator's current language choice for every regeneration.
  const c = { ...ctx, language: s.language };

  try {
    if (target.kind === "bio") {
      const r = await generateJson({
        schema: LlmBio,
        system: SYSTEM_PROMPT,
        user: bioPrompt(c, s, instruction),
        temperature: 1,
        qualityCheck: (d) => [
          ...(d.bio.trim().length > IG_BIO_MAX ? [`Bio is ${d.bio.trim().length} characters; rewrite it under ${IG_BIO_MAX} (Instagram's limit).`] : []),
          ...languageQuality(d, c.language),
        ],
      });
      return Response.json({ kind: "ok", bio: fitBio(r.data.bio), tagline: r.data.tagline });
    }

    if (target.kind === "product") {
      if (target.index >= s.products.length) return Response.json({ kind: "bad_request", message: "That product no longer exists." }, { status: 400 });
      const others = s.products.filter((_, i) => i !== target.index);
      const r = await generateJson({
        schema: LlmProduct,
        system: SYSTEM_PROMPT,
        user: productPrompt(c, s, target.index, instruction),
        qualityCheck: (p) => productQuality(p, others, s.displayName),
        temperature: 1,
      });
      return Response.json({ kind: "ok", product: finalizeProduct(r.data, c.followers) });
    }

    const r = await generateJson({
      schema: LlmStorefront,
      system: SYSTEM_PROMPT,
      user: storefrontUserPrompt(c) + (instruction ? `\nCreator's request: "${instruction}"` : "") +
        `\nGive a fresh take that differs from: ${s.products.map((p) => p.title).join("; ")}`,
      qualityCheck: (o) => (o.status === "ok" ? [...storefrontQuality(o), ...languageQuality(o, c.language)] : storefrontQuality(o)),
      temperature: 1,
    });
    if (r.data.status !== "ok" || r.data.products.length < 2) throw new LlmError("invalid", "no products");
    const next = toStorefront(r.data, { ...c, avatarUrl: s.avatarUrl, fullName: s.displayName });
    // Preserve identity the creator may have set.
    return Response.json({
      kind: "ok",
      storefront: { ...next, displayName: s.displayName, handle: s.handle, avatarUrl: s.avatarUrl, theme: s.theme },
      assumptions: r.data.assumptions,
    });
  } catch (e) {
    console.error("[regenerate] failed:", (e as LlmError).kind, (e as Error).message);
    return Response.json(
      { kind: "ai_unavailable", message: "Couldn't rewrite that right now. Your current version is kept. Try again in a moment." },
      { status: 503 },
    );
  }
}
