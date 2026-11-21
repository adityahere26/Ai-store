import { z } from "zod";

export const FORMATS = [
  "ebook",
  "template_pack",
  "live_workshop",
  "recorded_course",
  "cohort_course",
  "one_on_one",
  "community",
] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABEL: Record<Format, string> = {
  ebook: "E-book / Guide",
  template_pack: "Template pack",
  live_workshop: "Live workshop",
  recorded_course: "Recorded course",
  cohort_course: "Cohort course",
  one_on_one: "1:1 session",
  community: "Community",
};

/** Instagram's bio limit. Our store bio must also fit, so creators can reuse it on their profile. */
export const IG_BIO_MAX = 150;

/**
 * Last-resort guarantee that a bio fits Instagram: cut at the last full sentence
 * under the limit, else the last whole word. Never adds "…" (that would look broken on Instagram).
 */
export function fitBio(text: string, max = IG_BIO_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "), head.lastIndexOf("। "));
  // A complete sentence reads better than a longer fragment.
  if (sentenceEnd >= 40) return head.slice(0, sentenceEnd + 1).trim();
  if (/[.!?।]$/.test(head)) return head;
  const lastSpace = head.lastIndexOf(" ");
  return head.slice(0, lastSpace > 40 ? lastSpace : max).replace(/[\s,;:–-]+$/, "").trim();
}

export const LANGUAGES = ["english", "hinglish", "hindi"] as const;
export type Language = (typeof LANGUAGES)[number];

export const THEMES = ["classic", "midnight", "blush"] as const;
export type Theme = (typeof THEMES)[number];

/* ---------- What the LLM must return (validated, never trusted blindly) ---------- */

export const LlmProduct = z.object({
  title: z.string().min(3).max(80),
  format: z.enum(FORMATS),
  tier: z.enum(["entry", "core", "premium"]),
  priceInr: z.number().int().positive(),
  priceRationale: z.string().min(10).max(220),
  description: z.string().min(40).max(500),
  highlights: z.array(z.string().min(3).max(90)).min(2).max(4),
  cta: z.string().min(2).max(24),
  /** "creator" = came from the creator's own ideas or uploaded material. */
  origin: z.enum(["creator", "ai"]),
});

export const LlmStorefront = z.object({
  status: z.enum(["ok", "need_more_info"]),
  clarifyingQuestion: z.string().max(200),
  displayName: z.string().max(60),
  niche: z.string().max(60),
  tagline: z.string().max(90),
  bio: z.string().max(400),
  assumptions: z.array(z.string().max(140)).max(3),
  suggestedTheme: z.enum(THEMES),
  products: z.array(LlmProduct).max(4),
  /** Facts pulled from uploaded files, kept so later regenerations stay grounded. Empty if no files. */
  materialSummary: z.string().max(1500),
});
export type LlmStorefront = z.infer<typeof LlmStorefront>;

export const LlmBio = z.object({
  tagline: z.string().min(3).max(90),
  bio: z.string().min(40).max(400),
});

/* ---------- What the app stores and renders ---------- */

export const Product = LlmProduct.extend({
  id: z.string(),
  priceAdjusted: z.boolean().optional(),
  // Free-form edits: the creator can override anything, so loosen limits.
  title: z.string().min(1).max(120),
  priceRationale: z.string().max(400),
  description: z.string().max(1200),
  highlights: z.array(z.string().max(160)).max(6),
  cta: z.string().min(1).max(40),
  priceInr: z.number().int().min(0).max(500000),
  origin: z.enum(["creator", "ai"]).optional(), // older drafts lack it
});
export type Product = z.infer<typeof Product>;

export const Storefront = z.object({
  displayName: z.string().min(1).max(80),
  handle: z.string().max(40).optional(),
  avatarUrl: z.string().url().optional(),
  followers: z.number().int().nonnegative().optional(),
  niche: z.string().max(80),
  tagline: z.string().max(140),
  bio: z.string().max(800),
  language: z.enum(LANGUAGES),
  theme: z.enum(THEMES),
  products: z.array(Product).min(1).max(4),
});
export type Storefront = z.infer<typeof Storefront>;

/** The creator's own answers about themselves (written by them or AI-drafted then edited). */
export const AboutYou = z.object({
  who: z.string().max(300),
  what: z.string().max(300),
  why: z.string().max(300),
  proof: z.string().max(400),
  story: z.string().max(1200),
});
export type AboutYou = z.infer<typeof AboutYou>;

/** Context kept alongside the draft so regenerations stay on-brief. */
export const CreatorContext = z.object({
  handle: z.string().max(40).optional(),
  description: z.string().max(1000).optional(),
  igSummary: z.string().max(3000).optional(),
  followers: z.number().int().nonnegative().optional(),
  language: z.enum(LANGUAGES),
  /** What the creator already sells or wants to sell, in their words. */
  ideas: z.string().max(1000).optional(),
  /** Summary of uploaded files (the files themselves are never stored). */
  materialSummary: z.string().max(1500).optional(),
  /** Creator said their Instagram page is new / just starting. */
  newPage: z.boolean().optional(),
  /** "About you" answers + personal story, used for a personalised bio. */
  about: AboutYou.partial().optional(),
});
export type CreatorContext = z.infer<typeof CreatorContext>;

/* ---------- Uploaded material (read once by the model, never stored) ---------- */

export const ATTACHMENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"] as const;
export const MAX_FILES = 3;
/** Raw bytes across all files. Base64 adds ~33%, keeping requests under Vercel's 4.5 MB body limit. */
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

export const Attachment = z.object({
  name: z.string().max(120),
  mimeType: z.enum(ATTACHMENT_TYPES),
  data: z.string().max(4_200_000), // base64
});
export type Attachment = z.infer<typeof Attachment>;

/* ---------- Inspiration for new creators ---------- */

export const POST_FORMATS = ["reel", "carousel", "story", "live"] as const;

export const LlmInspiration = z.object({
  creators: z
    .array(
      z.object({
        handle: z.string().min(1).max(40),
        name: z.string().max(80),
        why: z.string().min(10).max(160),
      }),
    )
    .max(12),
  /** Real hashtags to explore on Instagram. Hashtag pages always exist and show actual top posts. */
  hashtags: z
    .array(
      z.object({
        tag: z.string().min(2).max(40),
        why: z.string().min(8).max(140),
      }),
    )
    .min(3)
    .max(6),
  patterns: z
    .array(
      z.object({
        title: z.string().min(3).max(60),
        format: z.enum(POST_FORMATS),
        example: z.string().min(10).max(200),
      }),
    )
    .min(2)
    .max(4),
  ideas: z
    .array(
      z.object({
        format: z.enum(POST_FORMATS),
        hook: z.string().min(5).max(140),
        outline: z.array(z.string().min(3).max(140)).min(2).max(4),
        productTitle: z.string().max(120),
      }),
    )
    .min(4)
    .max(6),
});
export type LlmInspiration = z.infer<typeof LlmInspiration>;

export interface InspirationCreator {
  handle: string;
  name: string;
  why: string;
  /** "verified": public profile checked just now. "unchecked": Instagram unreachable (e.g. from cloud servers). */
  check: "verified" | "unchecked";
  followers?: number;
  posts?: number;
  avatarUrl?: string;
}

export interface Inspiration {
  niche: string;
  creators: InspirationCreator[];
  hashtags: LlmInspiration["hashtags"];
  patterns: LlmInspiration["patterns"];
  ideas: (Omit<LlmInspiration["ideas"][number], "productTitle"> & { productTitle: string | null })[];
  createdAt: number;
}
