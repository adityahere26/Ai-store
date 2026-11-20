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
      category?: string;
      captions: string[];
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

export async function lookupInstagram(raw: string): Promise<IgResult> {
  const handle = normalizeHandle(raw);
  if (!isValidHandle(handle)) return { status: "invalid", handle };

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
          avatarUrl: u.profile_pic_url_hd || u.profile_pic_url || undefined,
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
      const rawDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i)?.[1];
      const rawTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i)?.[1];
      const desc = rawDesc ? decodeEntities(rawDesc) : undefined;
      const title = rawTitle ? decodeEntities(rawTitle) : undefined;
      // A missing profile renders Instagram's error shell and no profile meta tags.
      if (!desc && /PolarisErrorRoot/.test(html)) return { status: "not_found", handle };
      if (desc && /Followers/i.test(desc)) {
        // e.g. "12K Followers, 300 Following, 450 Posts - See Instagram photos and videos from Priya (@priya)"
        const followers = desc.match(/([\d.,]+\s*[KkMm]?)\s+Followers/)?.[1];
        const fullName = title?.split("(@")[0]?.trim();
        const bio = desc.split(/:\s*"/)[1]?.replace(/"\s*$/, "");
        return {
          status: "found",
          handle,
          fullName: fullName || undefined,
          bio: bio || undefined,
          followers: followers ? parseCount(followers) : undefined,
          captions: [],
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
    r.bio && `Bio: ${r.bio}`,
    r.isPrivate && `(Account is private: no posts visible)`,
    r.captions.length > 0 && `Recent post captions:\n${r.captions.map((c) => `- ${c.replace(/\s+/g, " ")}`).join("\n")}`,
  ].filter(Boolean);
  return parts.join("\n");
}
