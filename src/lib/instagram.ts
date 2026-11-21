/**
 * Instagram handle helpers.
 *
 * Minute Store deliberately does NOT read Instagram profiles: scraping is
 * against platform terms and blocked from cloud servers, and the brief treats a
 * short self-description as a fully valid input. A handle is only used as the
 * creator's name/link. The production path would be Instagram's official API,
 * with the creator connecting their own account.
 */

const HANDLE_RE = /^(?!.*\.\.)(?!\.)[a-z0-9._]{1,30}(?<!\.)$/;

/** Accepts "@name", "name", or an instagram.com URL. */
export function normalizeHandle(raw: string): string {
  let h = raw.trim().toLowerCase();
  const m = h.match(/instagram\.com\/([^/?#\s]+)/);
  if (m) h = m[1];
  return h.replace(/^@+/, "").replace(/\/+$/, "");
}

/** Instagram's username rules: letters, digits, dots, underscores; max 30; no leading/trailing or double dots. */
export function isValidHandle(h: string): boolean {
  return HANDLE_RE.test(h);
}
