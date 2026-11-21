/**
 * Best-effort Instagram profile lookup.
 *
 * Instagram blocks most server-side requests, so this is designed to fail
 * quietly and fast. Every outcome maps to a clear next step for the creator;
 * it never blocks generation for more than a few seconds.
 */

export type IgResult =
  | {
      status: "found";
      handle: string;
      fullName?: string;
      bio?: string;
      followers?: number;
      following?: number;
      posts?: number;
      category?: string;
      captions: string[];
      /** Embedded as a data: URI. Instagram's CDN links are signed and expire in days. */
      avatarUrl?: string;
      isPrivate: boolean;
    }
  | { status: "invalid"; handle: string }
  | { status: "not_found"; handle: string }
  | { status: "unavailable"; handle: string };

const HANDLE_RE = /^(?!.*\.\.)(?!\.)[a-z0-9._]{1,30}(?<!\.)$/;

/** Accepts "@name", "name", or an instagram.com URL. */
export function normalizeHandle(raw: string): string {
  let h = raw.trim().toLowerCase();
  const m = h.match(/instagram\.com\/([^/?#\s]+)/);
  if (m) h = m[1];
  return h.replace(/^@+/, "").replace(/\/+$/, "");
}

export function isValidHandle(h: string): boolean {
  return HANDLE_RE.test(h);
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function parseCount(s: string): number | undefined {
  const m = s.replace(/,/g, "").match(/([\d.]+)\s*([KkMm])?/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  const mult = m[2]?.toLowerCase() === "m" ? 1e6 : m[2]?.toLowerCase() === "k" ? 1e3 : 1;
  return Math.round(n * mult);
}

/**
 * Download the profile photo once and inline it. CDN URLs carry an expiry
 * (`oe=` param, ~4 days), but published stores must outlive that.
 */
async function embedAvatar(url?: string): Promise<string | undefined> {
  if (!url || !/^https:\/\/[^/]*(cdninstagram\.com|fbcdn\.net)\//.test(url)) return undefined;
  try {
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, 3000);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 150_000) return undefined;
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Read <meta> tags regardless of attribute order. */
function metaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name)="([^"]+)"/i)?.[1];
    const content = tag.match(/\bcontent="([^"]*)"/i)?.[1];
    if (key && content !== undefined && !(key in out)) out[key] = decodeEntities(content);
  }
  return out;
}

// Short-lived cache: the live profile preview and the generation step look up the
// same handle seconds apart, and we want to be gentle with Instagram.
const cache = new Map<string, { at: number; result: IgResult }>();
const TTL = 10 * 60_000;

export async function lookupInstagram(raw: string): Promise<IgResult> {
  const handle = normalizeHandle(raw);
  if (!isValidHandle(handle)) return { status: "invalid", handle };
  const hit = cache.get(handle);
  if (hit && Date.now() - hit.at < TTL) return hit.result;
  const result = await lookupUncached(handle);
  // Don't cache transient failures; do cache definite answers.
  if (result.status !== "unavailable") {
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    cache.set(handle, { at: Date.now(), result });
  }
  return result;
}

async function lookupUncached(handle: string): Promise<IgResult> {

  // 1) Public web JSON endpoint (richest: bio, followers, captions).
  try {
    const res = await fetchWithTimeout(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
      { headers: { "x-ig-app-id": "936619743392459", "User-Agent": UA, Accept: "application/json" } },
      3500,
    );
    // Note: this endpoint returns 404 for *every* logged-out request now, so a 404 here
    // proves nothing. Only a 200 with data is trusted.
    if (res.ok) {
      const json = await res.json().catch(() => null);
      const u = json?.data?.user;
      if (json && json.data && u === null) return { status: "not_found", handle };
      if (u) {
        const edges: { node?: { edge_media_to_caption?: { edges?: { node?: { text?: string } }[] } } }[] =
          u.edge_owner_to_timeline_media?.edges ?? [];
        const captions = edges
          .map((e) => e.node?.edge_media_to_caption?.edges?.[0]?.node?.text ?? "")
          .filter(Boolean)
          .slice(0, 8)
          .map((c) => c.slice(0, 300));
        return {
          status: "found",
          handle,
          fullName: u.full_name || undefined,
          bio: u.biography || undefined,
          followers: u.edge_followed_by?.count,
          category: u.category_name || undefined,
          captions,
          following: u.edge_follow?.count,
          posts: u.edge_owner_to_timeline_media?.count,
          avatarUrl: await embedAvatar(u.profile_pic_url_hd || u.profile_pic_url),
          isPrivate: !!u.is_private,
        };
      }
    }
  } catch {
    /* fall through to the HTML fallback */
  }

  // 2) Profile HTML meta tags (followers + name + bio snippet), often still served.
  try {
    const res = await fetchWithTimeout(
      `https://www.instagram.com/${encodeURIComponent(handle)}/`,
      { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } },
      3500,
    );
    if (res.status === 404) return { status: "not_found", handle };
    if (res.ok) {
      const html = await res.text();
      const meta = metaTags(html);
      // e.g. 'name=description': '12K Followers, 300 Following, 450 Posts - Priya (@priya) on Instagram: "bio…"'
      const desc = meta["description"] ?? meta["og:description"];
      // A missing profile renders Instagram's error shell and no profile meta tags.
      if (!/Followers/i.test(desc ?? "")) {
        if (/PolarisErrorRoot/.test(html)) return { status: "not_found", handle };
      } else {
        const count = (label: string) => {
          const m = desc!.match(new RegExp(`([\\d.,]+\\s*[KkMm]?)\\s+${label}`));
          return m ? parseCount(m[1]) : undefined;
        };
        const fullName = meta["og:title"]?.split("(@")[0]?.trim();
        const bio = desc!.match(/on Instagram:\s*"([\s\S]*)"\s*$/)?.[1]?.trim();
        return {
          status: "found",
          handle,
          fullName: fullName || undefined,
          bio: bio || undefined,
          followers: count("Followers"),
          following: count("Following"),
          posts: count("Posts"),
          captions: [],
          avatarUrl: await embedAvatar(meta["og:image"]),
          isPrivate: /This account is private/i.test(html),
        };
      }
    }
  } catch {
    /* ignore */
  }

  return { status: "unavailable", handle };
}

function decodeEntities(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/** Compact text for the prompt. */
export function igSummary(r: Extract<IgResult, { status: "found" }>): string {
  const parts = [
    `Instagram @${r.handle}`,
    r.fullName && `Name: ${r.fullName}`,
    r.category && `Category: ${r.category}`,
    r.followers !== undefined && `Followers: ${r.followers.toLocaleString("en-IN")}`,
    r.posts !== undefined && `Posts: ${r.posts.toLocaleString("en-IN")}`,
    r.bio && `Bio: ${r.bio}`,
    r.isPrivate && `(Account is private: no posts visible)`,
    r.captions.length > 0 && `Recent post captions:\n${r.captions.map((c) => `- ${c.replace(/\s+/g, " ")}`).join("\n")}`,
  ].filter(Boolean);
  return parts.join("\n");
}
