import { z } from "zod";
import { buildInspiration } from "@/lib/inspiration";
import { LlmError } from "@/lib/llm";
import { CreatorContext, Storefront } from "@/lib/schema";

export const maxDuration = 90;

const Body = z.object({ ctx: CreatorContext, storefront: Storefront });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ kind: "bad_request", message: "Something was off with that request." }, { status: 400 });
  try {
    const inspiration = await buildInspiration(parsed.data.ctx, parsed.data.storefront);
    return Response.json({ kind: "ok", inspiration });
  } catch (e) {
    console.error("[inspiration] failed:", (e as LlmError).kind, (e as Error).message);
    return Response.json(
      { kind: "ai_unavailable", message: "Couldn't load inspiration right now. Your store is safe. Try again in a moment." },
      { status: 503 },
    );
  }
}
