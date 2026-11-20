"use client";

import Link from "next/link";
import { useState } from "react";
import { formatInr } from "@/lib/pricing";
import { FORMAT_LABEL, THEMES, type Product, type Storefront, type Theme } from "@/lib/schema";

export function compactCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

/** Older drafts may carry retired theme names; never render an unstyled page. */
export function safeTheme(t: string | undefined): Theme {
  return (THEMES as readonly string[]).includes(t ?? "") ? (t as Theme) : "classic";
}

const FORMAT_ICON: Record<Product["format"], string> = {
  ebook: "📘",
  template_pack: "🧩",
  live_workshop: "🎥",
  recorded_course: "🎓",
  cohort_course: "👥",
  one_on_one: "📞",
  community: "💬",
};

function Avatar({ s }: { s: Storefront }) {
  const [broken, setBroken] = useState(false);
  const initials = s.displayName
    .replace(/^@/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const ring = "h-24 w-24 rounded-full ring-[5px] ring-sf-bg shadow-[0_8px_24px_rgba(22,16,30,0.18)]";
  if (s.avatarUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={s.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`${ring} object-cover`} />
    );
  }
  return (
    <div className={`${ring} grid place-items-center bg-sf-ink text-3xl font-semibold text-sf-bg`}>
      {initials || "★"}
    </div>
  );
}

interface Props {
  storefront: Storefront;
  mode: "public" | "edit";
  onEditBio?: () => void;
  onEditProduct?: (index: number) => void;
  busy?: { bio?: boolean; product?: number | null; all?: boolean };
  onProductClick?: (p: Product) => void;
}

function EditFrame({
  editing,
  onClick,
  busy,
  label,
  children,
}: {
  editing: boolean;
  onClick?: () => void;
  busy?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (!editing) return <>{children}</>;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={busy ? undefined : onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && onClick?.()}
      className="group relative cursor-pointer rounded-[22px] outline-2 outline-offset-4 outline-dashed outline-transparent transition hover:outline-[#0099ff]/60 focus-visible:outline-[#0099ff]"
    >
      {children}
      <span className="pointer-events-none absolute -top-3 right-3 rounded-full bg-[#0059ff] px-3 py-0.5 text-xs font-semibold text-white shadow">
        ✎ Edit
      </span>
      {busy && (
        <div className="absolute inset-0 grid place-items-center rounded-[22px] bg-sf-surface/80 backdrop-blur-[2px]">
          <span className="animate-pulse text-sm font-medium text-sf-muted">✨ Rewriting…</span>
        </div>
      )}
    </div>
  );
}

export default function StorefrontView({ storefront: s, mode, onEditBio, onEditProduct, busy, onProductClick }: Props) {
  const editing = mode === "edit";
  const theme = safeTheme(s.theme);
  const sectionTitle = s.language === "hindi" ? "मेरे प्रोडक्ट्स" : s.language === "hinglish" ? "Mere products" : "What I offer";

  return (
    <div className={`theme-${theme} bg-sf-bg text-sf-ink`} lang={s.language === "hindi" ? "hi" : "en"}>
      {/* Cover band */}
      <div className="h-32 w-full" style={{ background: "var(--sf-cover)" }} aria-hidden />

      <div className="mx-auto -mt-14 max-w-md px-4 pb-10">
        <EditFrame editing={editing} onClick={onEditBio} busy={busy?.bio || busy?.all} label="Edit name, tagline and bio">
          <header className="flex flex-col items-center text-center">
            <Avatar s={s} />
            <h1 className="tight mt-4 text-[30px] leading-[1.05] font-semibold">{s.displayName}</h1>
            <p className="mt-1.5 text-sm text-sf-muted">
              {s.handle && <>@{s.handle}</>}
              {s.handle && s.followers ? " · " : ""}
              {s.followers ? <>{compactCount(s.followers)} followers</> : null}
            </p>
            {s.niche && (
              <span className="mt-3 rounded-full bg-sf-soft px-3.5 py-1 text-[12px] font-semibold tracking-wide">{s.niche}</span>
            )}
            {s.tagline && (
              <p className="font-serif-i mt-5 text-[26px] leading-[1.15]">{s.tagline}</p>
            )}
            {s.bio && <p className="mt-3 text-[15.5px] leading-relaxed whitespace-pre-line text-sf-muted">{s.bio}</p>}
          </header>
        </EditFrame>

        <div className="mt-10 mb-4 flex items-center gap-3">
          <h2 className="tight text-[20px] font-semibold">{sectionTitle}</h2>
          <span className="h-px flex-1 bg-sf-line" />
        </div>

        <div className="flex flex-col gap-5">
          {s.products.map((p, i) => (
            <EditFrame
              key={p.id}
              editing={editing}
              onClick={() => onEditProduct?.(i)}
              busy={busy?.product === i || busy?.all}
              label={`Edit product ${p.title}`}
            >
              <article className="rise overflow-hidden rounded-[20px] border border-sf-line bg-sf-surface shadow-[0_2px_12px_rgba(22,16,30,0.05)]">
                <div className="flex items-center justify-between gap-2 bg-sf-soft px-5 py-2.5">
                  <span className="text-[12.5px] font-semibold">
                    <span aria-hidden>{FORMAT_ICON[p.format]} </span>
                    {FORMAT_LABEL[p.format]}
                  </span>
                  {p.tier === "premium" && <span className="text-[12px] font-semibold">⚡ Limited spots</span>}
                  {p.tier === "entry" && <span className="text-[12px] font-semibold">Best place to start</span>}
                </div>
                <div className="p-5">
                  <h3 className="tight text-[21px] leading-snug font-semibold">{p.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-sf-muted">{p.description}</p>
                  {p.highlights.length > 0 && (
                    <ul className="mt-4 space-y-2">
                      {p.highlights.map((h, j) => (
                        <li key={j} className="flex gap-2.5 text-[14.5px] leading-snug">
                          <span aria-hidden className="mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#00b67a] text-[10px] font-bold text-white">
                            ✓
                          </span>
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-sf-line pt-4">
                    <p className="tight text-[26px] font-bold">
                      {p.priceInr === 0 ? "Free" : formatInr(p.priceInr)}
                      {p.format === "community" && p.priceInr > 0 && <span className="text-sm font-medium text-sf-muted">/month</span>}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        if (editing) return;
                        e.stopPropagation();
                        onProductClick?.(p);
                      }}
                      tabIndex={editing ? -1 : 0}
                      className="min-h-12 rounded-full bg-sf-accent px-6 text-[15px] font-semibold text-sf-accent-ink shadow-sm transition active:scale-[0.98]"
                    >
                      {p.cta} →
                    </button>
                  </div>
                </div>
              </article>
            </EditFrame>
          ))}
        </div>

        {!editing && (
          <footer className="mt-12 text-center text-[13px] text-sf-muted">
            Made with{" "}
            <Link href="/" className="font-semibold text-sf-ink underline-offset-2 hover:underline">
              Storefront AI
            </Link>{" "}
            · Build your own store in a minute
          </footer>
        )}
      </div>
    </div>
  );
}
