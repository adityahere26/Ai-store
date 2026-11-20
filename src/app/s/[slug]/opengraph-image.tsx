import { ImageResponse } from "next/og";
import { getStore } from "@/lib/store";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Creator store";

// WhatsApp/Instagram link previews are how this page will travel, so it gets a real card.
// The default OG font is Latin-only, so non-Latin text falls back to the handle.
const latin = (s?: string) => (s && /^[\x20-\x7EÀ-ɏ]+$/.test(s) ? s : undefined);

const COLORS = {
  classic: { bg: "#f9f8ff", ink: "#16101e", accent: "#0059ff", muted: "#5f5a66", accentInk: "#ffffff" },
  midnight: { bg: "#0f0a19", ink: "#f9f8ff", accent: "#0099ff", muted: "#aaa3b8", accentInk: "#ffffff" },
  blush: { bg: "#fff5fb", ink: "#16101e", accent: "#16101e", muted: "#6e5f68", accentInk: "#ffffff" },
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await getStore(slug).catch(() => null);
  const c = COLORS[s?.theme ?? "classic"] ?? COLORS.classic;
  const name = latin(s?.displayName) ?? (s?.handle ? `@${s.handle}` : "Creator store");
  const tagline = latin(s?.tagline) ?? "";
  const titles = (s?.products ?? []).map((p) => latin(p.title)).filter(Boolean).slice(0, 3) as string[];
  const minPrice = s?.products.length ? Math.min(...s.products.map((p) => p.priceInr)) : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: c.bg, color: c.ink, padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 30, color: c.muted }}>{s?.handle ? `@${s.handle}` : "Storefront"}</div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, marginTop: 12, lineHeight: 1.05 }}>{name}</div>
        {tagline && <div style={{ display: "flex", fontSize: 38, marginTop: 20, color: c.muted }}>{tagline}</div>}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 10 }}>
          {titles.map((t) => (
            <div key={t} style={{ display: "flex", fontSize: 30 }}>
              <span style={{ color: c.accent, marginRight: 14 }}>●</span>
              {t}
            </div>
          ))}
          {minPrice !== null && (
            <div style={{ display: "flex", marginTop: 18, fontSize: 30, fontWeight: 700, color: c.accentInk, background: c.accent, padding: "10px 22px", borderRadius: 16, alignSelf: "flex-start" }}>
              {`${s!.products.length} products · from Rs ${minPrice.toLocaleString("en-IN")}`}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
