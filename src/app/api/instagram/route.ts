import type { NextRequest } from "next/server";
import { lookupInstagram } from "@/lib/instagram";

/**
 * Live profile preview for the input screen ("Is this you?").
 * Uses the same cached lookup as generation, so confirming a profile here
 * makes the later generation step instant on the Instagram side.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("handle") ?? "";
  if (!raw.trim() || raw.length > 100) return Response.json({ status: "invalid" }, { status: 400 });
  const r = await lookupInstagram(raw);
  if (r.status !== "found") return Response.json({ status: r.status, handle: r.handle });
  return Response.json({
    status: "found",
    profile: {
      handle: r.handle,
      fullName: r.fullName,
      bio: r.bio,
      followers: r.followers,
      following: r.following,
      posts: r.posts,
      avatarUrl: r.avatarUrl,
      isPrivate: r.isPrivate,
    },
  });
}
