"use client";

import { useEffect, useState } from "react";
import StorefrontView, { safeTheme } from "@/components/StorefrontView";
import type { Product, Storefront } from "@/lib/schema";

function beacon(body: object) {
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.("/api/track", data)) return;
  } catch {}
  fetch("/api/track", { method: "POST", body: data, keepalive: true }).catch(() => {});
}

function isOwner(slug: string) {
  try {
    return localStorage.getItem(`sf:owner:${slug}`) === "1";
  } catch {
    return false;
  }
}

export default function PublicStore({ storefront, slug }: { storefront: Storefront; slug: string }) {
  const [picked, setPicked] = useState<Product | null>(null);
  const theme = safeTheme(storefront.theme);

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
          setPicked(p);
        }}
      />
      {picked && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={() => setPicked(null)} />
          <div className={`theme-${theme} sheet-in relative w-full max-w-md rounded-t-3xl bg-sf-surface p-6 pb-[max(24px,env(safe-area-inset-bottom))] text-sf-ink sm:rounded-3xl`}>
            <p className="text-xs font-semibold tracking-widest text-sf-muted uppercase">Almost there</p>
            <h2 className="tight mt-2 text-[22px] font-semibold">{picked.title}</h2>
            <p className="mt-2 text-[15px] text-sf-muted">
              Checkout isn&apos;t connected in this prototype, but your interest has been counted
              {storefront.handle ? <> and you can message the creator directly.</> : "."}
            </p>
            <div className="mt-5 flex gap-2">
              {storefront.handle && (
                <a
                  href={`https://ig.me/m/${storefront.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="grid min-h-12 flex-1 place-items-center rounded-full bg-sf-accent font-semibold text-sf-accent-ink"
                >
                  Message @{storefront.handle}
                </a>
              )}
              <button onClick={() => setPicked(null)} className="min-h-12 flex-1 rounded-full border border-sf-line font-semibold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
