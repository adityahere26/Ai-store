import { z } from "zod";
import { SLUG_RE, track } from "@/lib/store";

const Body = z.object({
  slug: z.string().regex(SLUG_RE),
  kind: z.enum(["view", "click"]),
  productId: z.string().max(20).optional(),
});

// Called with navigator.sendBeacon from the public page. Always 204: analytics must never break the page.
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(JSON.parse(await req.text()));
    if (parsed.success && (parsed.data.kind === "view" || parsed.data.productId)) {
      await track(parsed.data.slug, parsed.data.kind, parsed.data.productId);
    }
  } catch {
    /* ignore */
  }
  return new Response(null, { status: 204 });
}
