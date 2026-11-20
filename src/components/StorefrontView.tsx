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
  const ring = "h-24 w-24 @3xl:h-28 @3xl:w-28 rounded-full ring-[5px] ring-sf-bg shadow-[0_8px_24px_rgba(22,16,30,0.18)]";
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
  /** Rendered after the product list (e.g. the editor's "suggest another product"). */
  afterProducts?: React.ReactNode;
}

function EditFrame({
  editing,
  onClick,
  busy,
  label,
  className = "",
  children,
}: {
  editing: boolean;
  onClick?: () => void;
  busy?: boolean;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (!editing) return <div className={className}>{children}</div>;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={busy ? undefined : onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && onClick?.()}
      className={`group relative cursor-pointer rounded-[22px] outline-2 outline-offset-4 outline-dashed outline-transparent transition hover:outline-[#0099ff]/60 focus-visible:outline-[#0099ff] ${className}`}
    >
      {children}
      <span className="pointer-events-none absolute -top-3 right-3 z-10 rounded-full bg-[#0059ff] px-3 py-0.5 text-xs font-semibold text-white shadow transition group-hover:scale-105">
        ✎ Edit
      </span>
      {busy && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-[22px] bg-sf-surface/80 backdrop-blur-[2px]">
          <span className="animate-pulse text-sm font-medium text-sf-muted">✨ Rewriting…</span>
        </div>
      )}
    </div>
  );
}

/**
 * The creator's store. Layout responds to the width it is given (container
 * queries), not the screen, so the editor's Phone/Desktop preview toggle shows
 * exactly what visitors will see on each device.
 */
export default function StorefrontView({ storefront: s, mode, onEditBio, onEditProduct, busy, onProductClick, afterProducts }: Props) {
  const editing = mode === "edit";
  const theme = safeTheme(s.theme);
  const sectionTitle = s.language === "hindi" ? "मेरे प्रोडक्ट्स" : s.language === "hinglish" ? "Mere products" : "What I offer";

  return (
    <div className={`@container theme-${theme} bg-sf-bg text-sf-ink`} lang={s.language === "hindi" ? "hi" : "en"}>
      {/* Cover band */}
      <div className="h-32 w-full @3xl:h-52" style={{ background: "var(--sf-cover)" }} aria-hidden />

      <div className="mx-auto -mt-14 max-w-md px-4 pb-10 @3xl:-mt-16 @3xl:max-w-6xl @3xl:px-8 @3xl:pb-16">
        <div className="@3xl:grid @3xl:grid-cols-[290px_minmax(0,1fr)] @3xl:items-start @3xl:gap-10 @5xl:grid-cols-[330px_minmax(0,1fr)] @5xl:gap-12">
          {/* Profile column: sticky sidebar on wide layouts */}
          <EditFrame
            editing={editing}
            onClick={onEditBio}
            busy={busy?.bio || busy?.all}
            label="Edit name, tagline and bio"
            className="@3xl:sticky @3xl:top-6"
          >
            <header className="flex flex-col items-center text-center @3xl:items-start @3xl:rounded-[24px] @3xl:border @3xl:border-sf-line @3xl:bg-sf-surface @3xl:p-6 @3xl:text-left @3xl:shadow-[0_8px_30px_rgba(22,16,30,0.06)]">
              <div className="@3xl:-mt-16">
                <Avatar s={s} />
              </div>
              <h1 className="tight mt-4 text-[30px] leading-[1.05] font-semibold">{s.displayName}</h1>
              <p className="mt-1.5 text-sm text-sf-muted">
                {s.handle && <>@{s.handle}</>}
                {s.handle && s.followers ? " · " : ""}
                {s.followers ? <>{compactCount(s.followers)} followers</> : null}
              </p>
              {s.niche && (
                <span className="mt-3 rounded-full bg-sf-soft px-3.5 py-1 text-[12px] font-semibold tracking-wide">{s.niche}</span>
              )}
              {s.tagline && <p className="font-serif-i mt-5 text-[26px] leading-[1.15]">{s.tagline}</p>}
              {s.bio && <p className="mt-3 text-[15.5px] leading-relaxed whitespace-pre-line text-sf-muted">{s.bio}</p>}
              {s.handle && !editing && (
                <a
                  href={`https://instagram.com/${s.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 hidden min-h-10 items-center rounded-full border border-sf-line px-4 text-sm font-semibold @3xl:inline-flex"
                >
                  Instagram ↗
                </a>
              )}
            </header>
          </EditFrame>

          {/* Products */}
          <section className="@3xl:pt-20">
            <div className="mt-10 mb-4 flex items-center gap-3 @3xl:mt-0">
              <h2 className="tight text-[20px] font-semibold @3xl:text-[24px]">{sectionTitle}</h2>
              <span className="h-px flex-1 bg-sf-line" />
              <span className="hidden text-sm text-sf-muted @3xl:inline">
                {s.products.length} {s.products.length === 1 ? "offer" : "offers"}
              </span>
            </div>

            <div className="grid gap-5 @5xl:grid-cols-2">
              {s.products.map((p, i) => (
                <EditFrame
                  key={p.id}
                  editing={editing}
                  onClick={() => onEditProduct?.(i)}
                  busy={busy?.product === i || busy?.all}
                  label={`Edit product ${p.title}`}
                  className="h-full"
                >
                  <article className="rise flex h-full flex-col overflow-hidden rounded-[20px] border border-sf-line bg-sf-surface shadow-[0_2px_12px_rgba(22,16,30,0.05)] transition @3xl:hover:-translate-y-0.5 @3xl:hover:shadow-[0_12px_30px_rgba(22,16,30,0.10)]">
                    <div className="flex items-center justify-between gap-2 bg-sf-soft px-5 py-2.5">
                      <span className="text-[12.5px] font-semibold">
                        <span aria-hidden>{FORMAT_ICON[p.format]} </span>
                        {FORMAT_LABEL[p.format]}
                      </span>
                      {p.tier === "premium" && <span className="text-[12px] font-semibold">⚡ Limited spots</span>}
                      {p.tier === "entry" && <span className="text-[12px] font-semibold">Best place to start</span>}
                    </div>
                    <div className="flex flex-1 flex-col p-5">
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
                      {/* Spacer keeps price rows aligned when cards sit side by side */}
                      <div className="min-h-5 flex-1" aria-hidden />
                      <div className="flex items-center justify-between gap-3 border-t border-sf-line pt-4">
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
                          className="min-h-12 rounded-full bg-sf-accent px-6 text-[15px] font-semibold text-sf-accent-ink shadow-sm transition hover:brightness-110 active:scale-[0.98]"
                        >
                          {p.cta} →
                        </button>
                      </div>
                    </div>
                  </article>
                </EditFrame>
              ))}
            </div>

            {afterProducts}

            {!editing && (
              <footer className="mt-12 text-center text-[13px] text-sf-muted @3xl:text-left">
                Made with{" "}
                <Link href="/" className="font-semibold text-sf-ink underline-offset-2 hover:underline">
                  Storefront AI
                </Link>{" "}
                · Build your own store in a minute
              </footer>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
