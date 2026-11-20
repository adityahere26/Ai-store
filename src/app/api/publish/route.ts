import { z } from "zod";
import { Storefront } from "@/lib/schema";
import { createStore, updateStore, SLUG_RE } from "@/lib/store";

const Body = z.object({
  storefront: Storefront,
  slug: z.string().regex(SLUG_RE).optional(),
  editToken: z.string().max(64).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json(
      { kind: "invalid", message: `Please check ${first?.path.join(" ") || "your store"}: ${first?.message ?? "invalid"}` },
      { status: 400 },
    );
  }
  const { storefront, slug, editToken } = parsed.data;
  try {
    if (slug && editToken && (await updateStore(slug, editToken, storefront))) {
      return Response.json({ kind: "ok", slug, editToken, updated: true });
    }
    const created = await createStore(storefront);
    return Response.json({ kind: "ok", ...created, updated: false });
  } catch (e) {
    console.error("[publish] failed:", (e as Error).message);
    return Response.json({ kind: "error", message: "Couldn't publish right now. Your edits are safe on this device. Try again." }, { status: 503 });
  }
}
