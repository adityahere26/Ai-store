import { z } from "zod";
import { generateStorefront } from "@/lib/generate";
import { Attachment, LANGUAGES, MAX_FILES, MAX_TOTAL_BYTES } from "@/lib/schema";

export const maxDuration = 90;

const Body = z.object({
  handle: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  language: z.enum(LANGUAGES).default("english"),
  ideas: z.string().max(1000).optional(),
  files: z.array(Attachment).max(MAX_FILES).optional(),
  newPage: z.boolean().optional(),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ kind: "bad_request", message: "Please add your Instagram handle or a short description." }, { status: 400 });
  }
  const { handle, description, language, ideas, files, newPage } = body.data;
  const totalBytes = (files ?? []).reduce((n, f) => n + Math.floor((f.data.length * 3) / 4), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return Response.json({ kind: "bad_request", message: "Those files are a bit big. Please keep uploads under 3 MB in total." }, { status: 413 });
  }
  if (!handle?.trim() && !description?.trim() && !ideas?.trim() && !files?.length) {
    return Response.json({ kind: "bad_request", message: "Please add your Instagram handle or a short description." }, { status: 400 });
  }
  const outcome = await generateStorefront({ handle, description, language, ideas, files, newPage });
  return Response.json(outcome, { status: outcome.kind === "ai_unavailable" ? 503 : 200 });
}
