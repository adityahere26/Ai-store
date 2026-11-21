import { lookupInstagram, igSummary, normalizeHandle, type IgResult } from "./instagram";
import { generateJson, LlmError } from "./llm";
import { SYSTEM_PROMPT, storefrontQuality, storefrontUserPrompt, toStorefront } from "./prompts";
import { LlmStorefront, type AboutYou, type Attachment, type CreatorContext, type Language, type Storefront } from "./schema";

export type IgStatus = IgResult["status"] | "private" | "skipped";

export type GenerateOutcome =
  | {
      kind: "ok";
      storefront: Storefront;
      ctx: CreatorContext;
      assumptions: string[];
      source: { igStatus: IgStatus; usedInstagram: boolean; captions: number; usedIdeas: boolean; files: number };
      meta: { model: string; attempts: number; ms: number };
    }
  /** We need a description before we can do anything useful. */
  | { kind: "needs_description"; igStatus: IgStatus; handle?: string; message: string }
  /** The model judged the input to have no usable niche; ask a specific question. */
  | { kind: "need_more_info"; question: string }
  | { kind: "ai_unavailable"; message: string };

const IG_MESSAGES: Record<string, string> = {
  invalid: "That doesn't look like an Instagram handle. Handles use letters, numbers, dots and underscores.",
  not_found: "We couldn't find that Instagram account. Check the spelling, or just tell us about yourself below.",
  unavailable: "Instagram didn't let us read that profile right now. No problem: tell us about yourself in a line or two.",
  private: "That account is private, so we can't see your posts. Tell us what you create in a line or two.",
};

/**
 * Pull a follower count out of free text ("15K followers", "2 lakh subscribers"),
 * so self-described creators get audience-appropriate pricing too.
 */
export function followersFromText(s?: string): number | undefined {
  if (!s) return undefined;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(k|m|lakh|lac|l)?\+?\s*(?:followers|subscribers|subs|audience|fans)/i);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(",", "."));
  const unit = m[2]?.toLowerCase();
  const mult = unit === "k" ? 1e3 : unit === "m" ? 1e6 : unit === "lakh" || unit === "lac" || unit === "l" ? 1e5 : 1;
  const v = Math.round(n * mult);
  return v > 0 && v < 1e9 ? v : undefined;
}

/** Cheap local gate so obvious junk never costs an LLM call. */
export function looksEmpty(s: string): boolean {
  const letters = s.match(/\p{L}/gu)?.length ?? 0;
  return letters < 2;
}

export async function generateStorefront(input: {
  handle?: string;
  description?: string;
  language: Language;
  /** Products the creator already has in mind, in their words. */
  ideas?: string;
  /** Existing material (e-book, outline, rate card…), read once by the model. */
  files?: Attachment[];
  /** Creator says their Instagram page is new. */
  newPage?: boolean;
  /** "About you" answers + story. */
  about?: Partial<AboutYou>;
}): Promise<GenerateOutcome> {
  const t0 = Date.now();
  const description = input.description?.trim() || undefined;
  const rawHandle = input.handle?.trim() || undefined;
  const ideas = input.ideas?.trim() || undefined;
  const files = input.files ?? [];
  // Ideas or files are enough to build from, even without a readable profile or description.
  const about = input.about && Object.values(input.about).some((v) => v?.trim()) ? input.about : undefined;
  const hasOwnMaterial = !!ideas || files.length > 0 || !!(about?.who?.trim() || about?.what?.trim());

  let ctx: CreatorContext = {
    description,
    ideas,
    newPage: input.newPage || undefined,
    about,
    language: input.language,
    followers: followersFromText(description) ?? followersFromText(ideas),
  };
  let igStatus: IgStatus = "skipped";
  let avatarUrl: string | undefined;
  let fullName: string | undefined;
  let captions = 0;

  if (rawHandle) {
    const ig = await lookupInstagram(rawHandle);
    ctx.handle = ig.handle || normalizeHandle(rawHandle);
    igStatus = ig.status;
    if (ig.status === "found") {
      const thin = ig.isPrivate && !ig.bio;
      if (thin) igStatus = "private";
      ctx = { ...ctx, igSummary: igSummary(ig), followers: ig.followers ?? ctx.followers };
      avatarUrl = ig.avatarUrl;
      fullName = ig.fullName;
      captions = ig.captions.length;
      if (thin && !description && !hasOwnMaterial) {
        return { kind: "needs_description", igStatus, handle: ig.handle, message: IG_MESSAGES.private };
      }
    } else {
      if (ig.status === "invalid") ctx.handle = undefined;
      if (!description && !hasOwnMaterial) {
        const message =
          input.newPage && ig.status === "not_found"
            ? `@${ig.handle} is free, nice! Now tell us in a line what your new page will be about.`
            : IG_MESSAGES[ig.status];
        return { kind: "needs_description", igStatus, handle: ig.handle, message };
      }
    }
  }

  if (!ctx.igSummary && !hasOwnMaterial && (!description || looksEmpty(description))) {
    return {
      kind: "need_more_info",
      question: "Tell us what you teach or create, and who it's for. For example: \"I teach spoken English to college students\".",
    };
  }

  try {
    const res = await generateJson({
      schema: LlmStorefront,
      system: SYSTEM_PROMPT,
      user: storefrontUserPrompt(ctx, files.map((f) => f.name)),
      qualityCheck: storefrontQuality,
      files: files.map((f) => ({ mimeType: f.mimeType, data: f.data })),
    });
    const out = res.data;
    if (out.status === "need_more_info" || out.products.length < 2) {
      return {
        kind: "need_more_info",
        question: out.clarifyingQuestion || "Could you tell us a bit more about what you create and who follows you?",
      };
    }
    // Keep a compact summary of the files (not the files) so later rewrites stay grounded.
    if (files.length && out.materialSummary.trim()) ctx = { ...ctx, materialSummary: out.materialSummary.trim().slice(0, 1500) };
    return {
      kind: "ok",
      storefront: toStorefront(out, { ...ctx, avatarUrl, fullName }),
      ctx,
      assumptions: out.assumptions,
      source: { igStatus, usedInstagram: !!ctx.igSummary, captions, usedIdeas: !!ideas, files: files.length },
      meta: { model: res.model, attempts: res.attempts, ms: Date.now() - t0 },
    };
  } catch (e) {
    const err = e as LlmError;
    console.error("[generate] failed:", err.kind, err.message);
    return {
      kind: "ai_unavailable",
      message:
        err.kind === "timeout"
          ? "Our AI is taking longer than usual. Your details are saved. Please try again."
          : "Our AI is having a moment. Your details are saved. Please try again.",
    };
  }
}
