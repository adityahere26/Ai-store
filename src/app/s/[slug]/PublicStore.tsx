"use client";

import { useEffect, useState } from "react";
import StorefrontView, { safeTheme } from "@/components/StorefrontView";
import { formatInr } from "@/lib/pricing";
import type { Product, Storefront } from "@/lib/schema";

function beacon(body: object) {
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.("/api/track", data)) return;
  } catch {}
  fetch("/api/track", { method: "POST", body: data, keepalive: true }).catch(
    () => {},
  );
}

function isOwner(slug: string) {
  try {
    return localStorage.getItem(`sf:owner:${slug}`) === "1";
  } catch {
    return false;
  }
}

function initials(name: string) {
  return (
    name
      .replace(/^@/, "")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "★"
  );
}

export default function PublicStore({
  storefront,
  slug,
}: {
  storefront: Storefront;
  slug: string;
}) {
  const [picked, setPicked] = useState<Product | null>(null);
  // "contact" = the visitor tapped Message: Instagram isn't connected in this prototype,
  // so we explain that and give them a handle they can copy, instead of a link that may fail.
  const [step, setStep] = useState<"offer" | "contact">("offer");
  const [copied, setCopied] = useState(false);
  const open = (p: Product | null) => {
    setPicked(p);
    setStep("offer");
    setCopied(false);
  };
  const copyHandle = async () => {
    const text = `@${storefront.handle}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement("textarea");
      t.value = text;
      document.body.appendChild(t);
      t.select();
      try {
        document.execCommand("copy");
      } catch {}
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const theme = safeTheme(storefront.theme);

  // Close on Escape and stop the page behind from scrolling while the sheet is open.
  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicked(null);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [picked]);

  // Count views in the browser, not on the server: link-preview bots (WhatsApp,
  // Instagram) fetch the HTML but don't run JS, and the creator's own visits are skipped.
  useEffect(() => {
    if (!isOwner(slug)) beacon({ slug, kind: "view" });
  }, [slug]);

  return (
    <div className={`theme-${theme} min-h-dvh bg-sf-bg`}>
      <StorefrontView
        storefront={storefront}
        mode="public"
        onProductClick={(p) => {
          if (!isOwner(slug)) beacon({ slug, kind: "click", productId: p.id });
          open(p);
        }}
      />
      {picked && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={picked.title}
        >
          <button
            aria-label="Close"
            className="absolute inset-0 bg-black/45"
            onClick={() => open(null)}
          />
          <div
            className={`theme-${theme} rise relative w-full max-w-md overflow-hidden rounded-t-[28px] bg-sf-surface px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] text-sf-ink shadow-2xl sm:rounded-[28px] sm:p-6`}
          >
            <div
              className="mx-auto mb-4 h-1 w-10 rounded-full bg-sf-line sm:hidden"
              aria-hidden
            />
            {step === "offer" || !storefront.handle ? (
              <>
                <p className="text-[11px] font-semibold tracking-[0.16em] text-sf-muted uppercase">
                  Almost there
                </p>
                <h2 className="tight mt-1.5 text-[21px] leading-snug font-semibold break-words">
                  {picked.title}
                </h2>
                <p className="mt-1 text-[15px] font-semibold">
                  {picked.priceInr === 0 ? "Free" : formatInr(picked.priceInr)}
                  {picked.format === "community" && picked.priceInr > 0 ? (
                    <span className="font-normal text-sf-muted">/month</span>
                  ) : null}
                </p>
                <p className="mt-3 text-[14.5px] leading-relaxed text-sf-muted">
                  Checkout isn&apos;t connected in this prototype, but your
                  interest has been counted
                  {storefront.handle ? (
                    <> and you can message the creator directly.</>
                  ) : (
                    "."
                  )}
                </p>

                {storefront.handle && (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl bg-sf-bg p-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sf-ink text-[14px] font-semibold text-sf-bg"
                      aria-hidden
                    >
                      {initials(storefront.displayName)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-semibold">
                        {storefront.displayName}
                      </span>
                      <span className="block truncate text-[13px] text-sf-muted">
                        @{storefront.handle}
                      </span>
                    </span>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
                  {storefront.handle && (
                    <button
                      onClick={() => setStep("contact")}
                      className="flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-sf-accent px-5 sm:flex-[1.8] text-[15px] font-semibold text-sf-accent-ink transition hover:brightness-110"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-[18px] w-[18px] shrink-0 fill-none stroke-current"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path
                          d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="truncate">Message on Instagram</span>
                    </button>
                  )}
                  <button
                    onClick={() => open(null)}
                    className="min-h-12 flex-1 rounded-full border border-sf-line px-5 text-[15px] font-semibold whitespace-nowrap transition hover:bg-sf-bg sm:flex-none"
                  >
                    {storefront.handle ? "Maybe later" : "Close"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setStep("offer")}
                  className="-ml-1 inline-flex items-center gap-1 rounded-full px-1 py-1 text-[13px] font-semibold text-sf-muted hover:text-sf-ink"
                >
                  <span aria-hidden>←</span> Back
                </button>
                <div className="mt-3 flex items-center gap-3">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sf-soft text-sf-ink"
                    aria-hidden
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 fill-none stroke-current"
                      strokeWidth="2"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle
                        cx="17.5"
                        cy="6.5"
                        r="1"
                        fill="currentColor"
                        stroke="none"
                      />
                    </svg>
                  </span>
                  <h2 className="tight text-[20px] leading-snug font-semibold">
                    Instagram isn&apos;t connected yet
                  </h2>
                </div>
                <p className="mt-3 text-[14.5px] leading-relaxed text-sf-muted">
                  This is a prototype, so we can&apos;t open a chat for you.
                  Copy the creator&apos;s handle, then search it in Instagram
                  and send a DM about{" "}
                  <span className="font-semibold text-sf-ink">
                    {picked.title}
                  </span>
                  .
                </p>
                {storefront.handle && (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl bg-sf-bg p-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sf-ink text-[14px] font-semibold text-sf-bg"
                      aria-hidden
                    >
                      {initials(storefront.displayName)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px] font-semibold">
                        {storefront.displayName}
                      </span>
                      <span className="block truncate text-[13px] text-sf-muted">
                        @{storefront.handle}
                      </span>
                    </span>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    onClick={copyHandle}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-sf-accent px-5 text-[15px] font-semibold text-sf-accent-ink transition hover:brightness-110"
                  >
                    {copied ? (
                      <>
                        <span aria-hidden>✓</span> Copied @
                        {storefront.handle.length > 22
                          ? storefront.handle.slice(0, 21) + "…"
                          : storefront.handle}
                      </>
                    ) : (
                      <>Copy handle</>
                    )}
                  </button>
                  <a
                    href={`https://www.instagram.com/${storefront.handle}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-12 items-center justify-center rounded-full border border-sf-line px-5 text-[15px] font-semibold transition hover:bg-sf-bg"
                  >
                    Try opening Instagram ↗
                  </a>
                </div>
                <p
                  className="mt-3 text-center text-[12.5px] text-sf-muted"
                  aria-live="polite"
                >
                  {copied
                    ? "Paste it in Instagram's search to find them."
                    : "Your interest in this product has been counted."}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
