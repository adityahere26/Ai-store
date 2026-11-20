import { z } from "zod";
import { canEdit, getStore, SLUG_RE, stats } from "@/lib/store";

const Body = z.object({ slug: z.string().regex(SLUG_RE), editToken: z.string().max(64) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ kind: "bad_request" }, { status: 400 });
  const { slug, editToken } = parsed.data;
  if (!(await canEdit(slug, editToken))) return Response.json({ kind: "forbidden" }, { status: 403 });
  const s = await getStore(slug);
  return Response.json({ kind: "ok", ...(await stats(slug, s?.products.map((p) => p.id) ?? [])) });
}
