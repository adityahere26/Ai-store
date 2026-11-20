import { z } from "zod";
import { generateStorefront } from "@/lib/generate";
import { LANGUAGES } from "@/lib/schema";

export const maxDuration = 90;

const Body = z.object({
  handle: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  language: z.enum(LANGUAGES).default("english"),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ kind: "bad_request", message: "Please add your Instagram handle or a short description." }, { status: 400 });
  }
  const { handle, description, language } = body.data;
  if (!handle?.trim() && !description?.trim()) {
    return Response.json({ kind: "bad_request", message: "Please add your Instagram handle or a short description." }, { status: 400 });
  }
  const outcome = await generateStorefront({ handle, description, language });
  return Response.json(outcome, { status: outcome.kind === "ai_unavailable" ? 503 : 200 });
}
