"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StorefrontView, { safeTheme } from "./StorefrontView";
import Sheet from "./Sheet";
import { formatInr, priceBand } from "@/lib/pricing";
import {
  FORMATS,
  FORMAT_LABEL,
  THEMES,
  type CreatorContext,
  type Format,
  type Language,
  type Product,
  type Storefront,
  type Theme,
} from "@/lib/schema";

/* ---------------- types & helpers ---------------- */

interface Draft {
  storefront: Storefront;
  ctx: CreatorContext;
  assumptions: string[];
  source: { usedInstagram: boolean; captions: number; igStatus: string };
  publish?: { slug: string; editToken: string; publishedAt: number };
  dirty?: boolean;
}

type Stage = "input" | "generating" | "edit" | "published";

const DRAFT_KEY = "sf:draft:v1";

const EXAMPLES = [
  "I teach UPSC prep in Hindi, 25K followers on Instagram",
  "Home workouts for new moms, no equipment",
  "Freelance UI designer, I post Figma tips",
  "Vedic astrology readings and daily horoscopes",
];

const LANG_LABEL: Record<Language, string> = { english: "English", hinglish: "Hinglish", hindi: "हिंदी" };

const THEME_SWATCH: Record<Theme, { bg: string; dot: string; name: string }> = {
  classic: { bg: "#f9f8ff", dot: "#0059ff", name: "Classic" },
  midnight: { bg: "#0f0a19", dot: "#0099ff", name: "Midnight" },
  blush: { bg: "#ffddf1", dot: "#16101e", name: "Blush" },
};

type ApiResult<T> = { ok: boolean; status: number; data: Partial<T> & { kind?: string; message?: string } };

async function api<T>(path: string, body: unknown, timeoutMs = 95_000): Promise<ApiResult<T>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => null)) ?? {};
    return { ok: res.ok, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: {
        kind: "network",
        message: ctrl.signal.aborted
          ? "This is taking too long. Please check your connection and try again."
          : "You seem to be offline. Your work is saved; try again when you're connected.",
      } as ApiResult<T>["data"],
    };
  } finally {
    clearTimeout(t);
  }
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (d?.storefront) d.storefront.theme = safeTheme(d.storefront.theme);
    return d;
  } catch {
    return null;
  }
}
function saveDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable: app still works for this session */
  }
}

/* ---------------- main component ---------------- */

export default function Builder() {
  const [stage, setStage] = useState<Stage>("input");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [history, setHistory] = useState<Storefront[]>([]);
  const [toast, setToast] = useState<{ msg: string; tone: "error" | "info" } | null>(null);

  // input form
  const [handle, setHandle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<Language>("english");
  const [handleMsg, setHandleMsg] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // editing
  const [sheet, setSheet] = useState<{ kind: "bio" } | { kind: "product"; index: number } | null>(null);
  const [busy, setBusy] = useState<{ bio?: boolean; product?: number | null; all?: boolean }>({});
  const [publishing, setPublishing] = useState(false);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");

  useEffect(() => {
    const d = loadDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage once on mount
    if (d?.storefront) setSaved(d);
  }, []);

  useEffect(() => {
    if (draft) saveDraft(draft);
  }, [draft]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const showError = (msg?: string) => setToast({ msg: msg || "Something went wrong. Please try again.", tone: "error" });

  /** Apply a change to the storefront, remembering the previous version for Undo. */
  const updateStore = useCallback((fn: (s: Storefront) => Storefront, opts: { undoable?: boolean } = {}) => {
    setDraft((d) => {
      if (!d) return d;
      if (opts.undoable) setHistory((h) => [...h.slice(-9), d.storefront]);
      return { ...d, storefront: fn(d.storefront), dirty: true };
    });
  }, []);

  const undo = () => {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (prev) setDraft((d) => (d ? { ...d, storefront: prev, dirty: true } : d));
      return h.slice(0, -1);
    });
  };

  /* ---------- generate ---------- */

  async function generate() {
    setHandleMsg(null);
    setQuestion(null);
    if (!handle.trim() && !description.trim()) {
      setQuestion("Add your Instagram handle, or tell us in a line what you create.");
      return;
    }
    setStage("generating");
    const r = await api<{
      kind: string;
      storefront?: Storefront;
      ctx?: CreatorContext;
      assumptions?: string[];
      source?: Draft["source"];
      message?: string;
      question?: string;
    }>("/api/generate", { handle: handle.trim() || undefined, description: description.trim() || undefined, language });

    const d = r.data;
    if (r.ok && d?.kind === "ok" && d.storefront && d.ctx) {
      const next: Draft = {
        storefront: d.storefront,
        ctx: d.ctx,
        assumptions: d.assumptions ?? [],
        source: d.source ?? { usedInstagram: false, captions: 0, igStatus: "skipped" },
      };
      setDraft(next);
      setHistory([]);
      setStage("edit");
      window.scrollTo({ top: 0 });
      return;
    }
    setStage("input");
    if (d?.kind === "needs_description") {
      setHandleMsg(d.message ?? "We couldn't read that profile. Tell us about yourself below.");
      setTimeout(() => descRef.current?.focus(), 50);
    } else if (d?.kind === "need_more_info") {
      setQuestion(d.question ?? "Tell us a bit more about what you create.");
      setTimeout(() => descRef.current?.focus(), 50);
    } else {
      showError(d?.message);
    }
  }

  /* ---------- regenerate ---------- */

  async function regenerate(target: { kind: "bio" } | { kind: "product"; index: number } | { kind: "all" }, instruction?: string, override?: Partial<Storefront>) {
    if (!draft) return;
    const storefront = { ...draft.storefront, ...override };
    setBusy(target.kind === "bio" ? { bio: true } : target.kind === "product" ? { product: target.index } : { all: true });
    const r = await api<{ kind: string; bio?: string; tagline?: string; product?: Product; storefront?: Storefront; assumptions?: string[]; message?: string }>(
      "/api/regenerate",
      { ctx: draft.ctx, storefront, target, instruction },
    );
    setBusy({});
    const d = r.data;
    if (!r.ok || d?.kind !== "ok") {
      showError(d?.message);
      return false;
    }
    if (target.kind === "bio" && d.bio) updateStore((s) => ({ ...s, bio: d.bio!, tagline: d.tagline ?? s.tagline }), { undoable: true });
    if (target.kind === "product" && d.product)
      updateStore((s) => ({ ...s, products: s.products.map((p, i) => (i === target.index ? d.product! : p)) }), { undoable: true });
    if (target.kind === "all" && d.storefront) {
      setHistory((h) => [...h.slice(-9), draft.storefront]);
      setDraft((cur) => (cur ? { ...cur, storefront: d.storefront!, assumptions: d.assumptions ?? [], dirty: true } : cur));
    }
    setToast({ msg: "Rewritten. Not a fan? Tap Undo.", tone: "info" });
    return true;
  }

  async function changeLanguage(lang: Language) {
    if (!draft || lang === draft.storefront.language) return;
    const ok = await regenerate({ kind: "all" }, `Rewrite everything in ${lang}.`, { language: lang });
    if (ok) setDraft((d) => (d ? { ...d, storefront: { ...d.storefront, language: lang }, ctx: { ...d.ctx, language: lang } } : d));
  }

  /* ---------- publish ---------- */

  async function publish() {
    if (!draft) return;
    setPublishing(true);
    const r = await api<{ kind: string; slug: string; editToken: string; message?: string }>("/api/publish", {
      storefront: draft.storefront,
      slug: draft.publish?.slug,
      editToken: draft.publish?.editToken,
    });
    setPublishing(false);
    const { slug, editToken } = r.data;
    if (!r.ok || r.data.kind !== "ok" || !slug || !editToken) {
      showError(r.data.message);
      return;
    }
    try {
      localStorage.setItem(`sf:owner:${slug}`, "1");
    } catch {}
    setDraft((d) => (d ? { ...d, publish: { slug, editToken, publishedAt: Date.now() }, dirty: false } : d));
    setStage("published");
    window.scrollTo({ top: 0 });
  }

  function startOver() {
    setDraft(null);
    setSaved(null);
    saveDraft(null);
    setHistory([]);
    setStage("input");
  }

  /* ---------- render ---------- */

  return (
    <div className="min-h-dvh">
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4">
          <div
            role="status"
            className={`rise pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === "error" ? "bg-app-night text-white ring-1 ring-[#ff5c8a]/40" : "bg-app-night text-white"
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}

      {stage === "input" && (
        <InputScreen
          {...{ handle, setHandle, description, setDescription, language, setLanguage, handleMsg, question, descRef, saved }}
          onSubmit={generate}
          onResume={() => {
            if (!saved) return;
            setDraft(saved);
            setStage("edit");
          }}
          onDiscard={() => {
            saveDraft(null);
            setSaved(null);
          }}
        />
      )}

      {stage === "generating" && <GeneratingScreen handle={handle.trim()} />}

      {stage === "edit" && draft && (
        <div className="min-h-dvh lg:bg-[#f1f0f8]">
          {/* Top bar */}
          <div className="sticky top-0 z-30 bg-app-night text-white">
            <div className="mx-auto flex max-w-md items-center justify-between px-4 py-2.5 lg:max-w-7xl lg:px-8 lg:py-3">
              <div className="flex items-center gap-6">
                <p className="hidden text-[17px] font-semibold tracking-tight lg:block">
                  <span className="text-app-accent-2">✦</span> Storefront AI
                </p>
                <button onClick={startOver} className="min-h-10 text-sm font-medium text-white/70 hover:text-white">
                  ← Start over
                </button>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium text-white/80">
                {draft.dirty || !draft.publish ? (
                  <>
                    ● Draft<span className="hidden sm:inline"> · saved on this device</span>
                  </>
                ) : (
                  "● Live"
                )}
              </span>
              <div className="flex items-center gap-3">
                <button onClick={undo} disabled={!history.length} className="min-h-10 text-sm font-semibold text-white disabled:opacity-30">
                  ↶ Undo
                </button>
                <button
                  onClick={publish}
                  disabled={publishing || busy.all}
                  className="hidden min-h-10 rounded-full bg-app-accent px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60 lg:block"
                >
                  {publishing ? "Publishing…" : draft.publish ? "Update store →" : "Publish store →"}
                </button>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-md lg:grid lg:max-w-7xl lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-8 lg:py-8">
            {/* Controls: inline on mobile, sticky sidebar on desktop */}
            <aside className="px-4 pt-4 lg:sticky lg:top-[88px] lg:px-0 lg:pt-0">
              <div className="lg:rounded-[24px] lg:bg-app-surface lg:p-5 lg:shadow-[0_8px_30px_rgba(22,16,30,0.06)]">
                <h2 className="tight mb-4 hidden text-[28px] leading-none font-medium lg:block">
                  Your <span className="font-serif-i text-[32px]">store</span>
                </h2>
                <p className="rounded-2xl bg-app-sky px-4 py-3 text-[14px] leading-snug text-app-ink">
                  {draft.source.usedInstagram
                    ? `Built from your Instagram${draft.source.captions ? ` bio and ${draft.source.captions} recent posts` : " profile"}${draft.ctx.description ? " plus your description" : ""}.`
                    : "Built from your description."}{" "}
                  <span className="font-semibold">
                    <span className="lg:hidden">Tap</span>
                    <span className="hidden lg:inline">Click</span> any section to edit or rewrite it.
                  </span>
                </p>

                {draft.assumptions.length > 0 && (
                  <div className="mt-3 rounded-2xl bg-app-blush px-4 py-3 text-[14px] text-app-ink">
                    <p className="font-semibold">🤔 A few guesses we made. Fix any that are wrong:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {draft.assumptions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between gap-3 lg:flex-col lg:items-stretch lg:gap-4">
                  <div>
                    <p className="mb-2 hidden text-sm font-semibold lg:block">Page style</p>
                    <div className="flex items-center gap-2" role="radiogroup" aria-label="Page style">
                      {THEMES.map((t) => (
                        <button
                          key={t}
                          role="radio"
                          aria-checked={draft.storefront.theme === t}
                          aria-label={THEME_SWATCH[t].name}
                          title={THEME_SWATCH[t].name}
                          onClick={() => updateStore((s) => ({ ...s, theme: t }))}
                          className={`flex items-center gap-2 rounded-full border-2 transition lg:flex-1 lg:px-2 lg:py-1.5 ${
                            draft.storefront.theme === t ? "border-app-accent ring-2 ring-app-accent/20" : "border-app-line hover:border-app-muted"
                          }`}
                        >
                          <span className="grid h-9 w-9 place-items-center rounded-full lg:h-6 lg:w-6" style={{ background: THEME_SWATCH[t].bg }}>
                            <span className="h-3.5 w-3.5 rounded-full lg:h-2.5 lg:w-2.5" style={{ background: THEME_SWATCH[t].dot }} />
                          </span>
                          <span className="hidden pr-1 text-[13px] font-medium lg:inline">{THEME_SWATCH[t].name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm lg:flex-col lg:items-stretch">
                    <span className="text-app-muted lg:font-semibold lg:text-app-ink">Language</span>
                    <select
                      value={draft.storefront.language}
                      disabled={busy.all}
                      onChange={(e) => changeLanguage(e.target.value as Language)}
                      className="min-h-10 rounded-full border border-app-line bg-app-surface px-3 font-medium"
                    >
                      {(Object.keys(LANG_LABEL) as Language[]).map((l) => (
                        <option key={l} value={l}>
                          {LANG_LABEL[l]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Desktop actions */}
                <div className="mt-6 hidden flex-col gap-2 border-t border-app-line pt-5 lg:flex">
                  <button
                    onClick={publish}
                    disabled={publishing || busy.all}
                    className="min-h-12 rounded-full bg-app-accent text-[15px] font-semibold text-white shadow-[0_6px_20px_rgba(0,89,255,0.35)] transition hover:brightness-110 disabled:opacity-60"
                  >
                    {publishing ? "Publishing…" : draft.publish ? "Update store →" : "Publish store →"}
                  </button>
                  <button
                    onClick={() => regenerate({ kind: "all" })}
                    disabled={busy.all}
                    className="min-h-12 rounded-full border border-app-line text-[15px] font-semibold transition hover:bg-app-tint disabled:opacity-50"
                  >
                    {busy.all ? "Rewriting…" : "↻ Regenerate all"}
                  </button>
                  {draft.publish && (
                    <button onClick={() => setStage("published")} className="min-h-10 text-sm font-medium text-app-accent">
                      View share link &amp; stats
                    </button>
                  )}
                </div>
              </div>
            </aside>

            {/* Preview */}
            <section className="mt-4 lg:mt-0">
              <div className="mb-4 hidden items-center justify-between lg:flex">
                <p className="text-sm text-app-muted">Live preview, exactly what visitors see</p>
                <div className="flex rounded-full bg-app-surface p-1 shadow-sm" role="radiogroup" aria-label="Preview size">
                  {(["desktop", "phone"] as const).map((d) => (
                    <button
                      key={d}
                      role="radio"
                      aria-checked={device === d}
                      onClick={() => setDevice(d)}
                      className={`min-h-9 rounded-full px-4 text-sm font-medium transition ${device === d ? "bg-app-ink text-white" : "text-app-muted hover:text-app-ink"}`}
                    >
                      {d === "desktop" ? "🖥 Desktop" : "📱 Phone"}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`mx-auto overflow-hidden rounded-t-[28px] border border-b-0 border-app-line shadow-[0_-4px_30px_rgba(22,16,30,0.06)] transition-[max-width] duration-300 lg:border-b lg:shadow-[0_20px_60px_rgba(22,16,30,0.12)] ${
                  device === "phone" ? "lg:max-w-[400px] lg:rounded-[44px] lg:border-[10px] lg:border-app-night" : "lg:max-w-none lg:rounded-[20px]"
                }`}
              >
                {device === "desktop" && (
                  <div className="hidden items-center gap-3 border-b border-app-line bg-app-surface px-4 py-2.5 lg:flex">
                    <span className="flex gap-1.5" aria-hidden>
                      <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                      <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                      <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                    </span>
                    <span className="flex-1 truncate rounded-full bg-app-tint px-4 py-1 text-center text-[13px] text-app-muted">
                      🔒 your-store-link/s/{draft.publish?.slug ?? (draft.storefront.handle || "your-name")}
                    </span>
                  </div>
                )}
                <StorefrontView
                  storefront={draft.storefront}
                  mode="edit"
                  busy={busy}
                  onEditBio={() => setSheet({ kind: "bio" })}
                  onEditProduct={(index) => setSheet({ kind: "product", index })}
                  afterProducts={
                    draft.storefront.products.length < 4 && (
                      <button
                        onClick={() => addProduct()}
                        disabled={busy.product != null || busy.all}
                        className="mt-5 w-full rounded-[20px] border-2 border-dashed border-sf-line py-4 text-sm font-semibold text-sf-muted transition hover:border-sf-muted"
                      >
                        {busy.product === draft.storefront.products.length ? "✨ Thinking of another idea…" : "+ Suggest another product"}
                      </button>
                    )
                  }
                />
                <div className={`theme-${safeTheme(draft.storefront.theme)} h-24 bg-sf-bg lg:h-0`} aria-hidden />
              </div>
            </section>
          </div>

          {/* Mobile action bar */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-app-line bg-app-surface/95 backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-md gap-2 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              <button
                onClick={() => regenerate({ kind: "all" })}
                disabled={busy.all}
                className="min-h-12 flex-1 rounded-full border border-app-line bg-app-surface px-3 text-[15px] font-semibold disabled:opacity-50"
              >
                {busy.all ? "Rewriting…" : "↻ Regenerate all"}
              </button>
              <button
                onClick={publish}
                disabled={publishing || busy.all}
                className="min-h-12 flex-[1.4] rounded-full bg-app-accent px-3 text-[15px] font-semibold text-white shadow-[0_6px_20px_rgba(0,89,255,0.35)] disabled:opacity-60"
              >
                {publishing ? "Publishing…" : draft.publish ? "Update store →" : "Publish store →"}
              </button>
            </div>
          </div>

          {sheet?.kind === "bio" && (
            <BioSheet
              storefront={draft.storefront}
              busy={!!busy.bio}
              onChange={(patch) => updateStore((s) => ({ ...s, ...patch }))}
              onRewrite={(instr) => regenerate({ kind: "bio" }, instr)}
              onClose={() => setSheet(null)}
            />
          )}
          {sheet?.kind === "product" && draft.storefront.products[sheet.index] && (
            <ProductSheet
              product={draft.storefront.products[sheet.index]}
              followers={draft.storefront.followers}
              canDelete={draft.storefront.products.length > 1}
              busy={busy.product === sheet.index}
              onChange={(patch) =>
                updateStore((s) => ({ ...s, products: s.products.map((p, i) => (i === sheet.index ? { ...p, ...patch } : p)) }))
              }
              onRewrite={(instr) => regenerate({ kind: "product", index: sheet.index }, instr)}
              onDelete={() => {
                updateStore((s) => ({ ...s, products: s.products.filter((_, i) => i !== sheet.index) }), { undoable: true });
                setSheet(null);
              }}
              onClose={() => setSheet(null)}
            />
          )}
        </div>
      )}

      {stage === "published" && draft?.publish && (
        <PublishedScreen draft={draft} onEdit={() => setStage("edit")} onNew={startOver} />
      )}
    </div>
  );

  async function addProduct() {
    if (!draft) return;
    const s = draft.storefront;
    const index = s.products.length;
    // Seed a placeholder that the model replaces; it never reaches the page if generation fails.
    const used = new Set(s.products.map((p) => p.format));
    const format = (FORMATS.find((f) => !used.has(f)) ?? "ebook") as Format;
    const seed: Product = {
      id: "new",
      title: "New product idea",
      format,
      tier: "core",
      priceInr: priceBand(format, s.followers)[0],
      priceRationale: "placeholder",
      description: "placeholder",
      highlights: [],
      cta: "Get it",
    };
    setBusy({ product: index });
    const r = await api<{ kind: string; product?: Product; message?: string }>("/api/regenerate", {
      ctx: draft.ctx,
      storefront: { ...s, products: [...s.products, seed] },
      target: { kind: "product", index },
      instruction: "Suggest a new product that complements the existing ones. Pick the best tier and format for it.",
    });
    setBusy({});
    if (!r.ok || r.data?.kind !== "ok" || !r.data.product) return showError(r.data?.message);
    updateStore((cur) => ({ ...cur, products: [...cur.products, r.data!.product!].slice(0, 4) }), { undoable: true });
  }
}

/* ---------------- Input screen ---------------- */

const STEPS = [
  { bg: "bg-app-blush", n: "01", t: "What to sell", d: "2 to 4 product ideas your audience already trusts you for." },
  { bg: "bg-app-mint", n: "02", t: "How to price it", d: "INR prices that fit your niche and audience size, with the reason." },
  { bg: "bg-app-sky", n: "03", t: "What to write", d: "Bio and product pages in English, Hinglish or Hindi. Edit anything." },
];

function InputScreen(props: {
  handle: string;
  setHandle: (s: string) => void;
  description: string;
  setDescription: (s: string) => void;
  language: Language;
  setLanguage: (l: Language) => void;
  handleMsg: string | null;
  question: string | null;
  descRef: React.RefObject<HTMLTextAreaElement | null>;
  saved: Draft | null;
  onSubmit: () => void;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const { handle, setHandle, description, setDescription, language, setLanguage, handleMsg, question, descRef, saved } = props;
  const canSubmit = handle.trim() || description.trim();
  return (
    <main className="min-h-dvh overflow-x-clip bg-app-tint">
      {/* Dark hero band. On mobile the form card hangs over its bottom edge; on desktop it sits beside the headline. */}
      <div className="relative bg-app-night text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-40 blur-3xl lg:h-[520px] lg:w-[520px] lg:opacity-30"
          style={{ background: "radial-gradient(circle, #0099ff 0%, transparent 70%)" }}
        />
        <nav className="relative mx-auto flex max-w-md items-center justify-between px-5 pt-5 lg:max-w-6xl lg:px-8 lg:pt-7">
          <p className="text-[17px] font-semibold tracking-tight lg:text-[20px]">
            <span className="text-app-accent-2">✦</span> Storefront AI
          </p>
          <div className="flex items-center gap-6">
            <span className="hidden text-sm text-white/60 lg:inline">For creators, coaches &amp; educators</span>
            <span className="rounded-full border border-white/15 px-3 py-1 text-[12px] text-white/70 lg:text-[13px]">Free · no sign-up</span>
          </div>
        </nav>

        <div className="relative mx-auto max-w-md lg:grid lg:max-w-6xl lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:px-8 lg:pt-12 lg:pb-24">
          {/* Headline */}
          <section className="px-5 pt-8 pb-8 lg:px-0 lg:pt-0 lg:pb-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-medium text-white/85">
              <span className="rounded-full bg-app-accent px-2 py-0.5 text-[11px] font-semibold text-white">New</span>
              AI sets up your store for you
            </p>
            <h1 className="tight mt-4 text-[40px] leading-[1.02] font-medium lg:mt-6 lg:text-[68px] lg:leading-[0.98]">
              Your store,
              <br />
              <span className="font-serif-i text-[46px] text-[#cfe6ff] lg:text-[78px]">ready in a minute.</span>
            </h1>
            <p className="mt-4 text-[16px] leading-relaxed text-white/70 lg:mt-6 lg:max-w-lg lg:text-[19px]">
              Tell us who you are. We&apos;ll suggest what to sell, price it for Indian buyers and write your page. You can change
              everything.
            </p>
            <ul className="mt-8 hidden flex-wrap gap-x-6 gap-y-2 text-[15px] text-white/75 lg:flex">
              {["Products that fit your niche", "₹ pricing with the reason", "English, Hinglish, हिंदी"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[#00b67a] text-[11px] font-bold text-white">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </section>

          {/* Form column */}
          <section className="relative px-4 pb-6 lg:px-0 lg:pb-0">
            {/* Light panel behind the lower part of the card (mobile/tablet only) */}
            <div aria-hidden className="absolute top-12 bottom-0 left-1/2 w-screen -translate-x-1/2 bg-app-tint lg:hidden" />

            <div className="relative text-app-ink">
              {saved && (
                <div className="rise mb-3 flex items-center justify-between gap-3 rounded-[20px] bg-app-surface p-4 shadow-[0_8px_30px_rgba(22,16,30,0.10)]">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Continue your store?</p>
                    <p className="truncate text-sm text-app-muted">{saved.storefront.displayName}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={props.onDiscard} className="min-h-10 rounded-full px-3 text-sm text-app-muted hover:text-app-ink">
                      Discard
                    </button>
                    <button onClick={props.onResume} className="min-h-10 rounded-full bg-app-ink px-4 text-sm font-semibold text-white">
                      Continue
                    </button>
                  </div>
                </div>
              )}

              <form
                className="flex flex-col gap-5 rounded-[24px] bg-app-surface p-5 shadow-[0_12px_40px_rgba(22,16,30,0.12)] lg:p-7 lg:shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
                onSubmit={(e) => {
                  e.preventDefault();
                  props.onSubmit();
                }}
              >
                <div>
                  <label htmlFor="handle" className="text-[15px] font-semibold">
                    Instagram handle <span className="font-normal text-app-muted">(optional)</span>
                  </label>
                  <div
                    className={`mt-1.5 flex items-center rounded-2xl border bg-app-tint px-4 focus-within:border-app-accent focus-within:bg-app-surface ${
                      handleMsg ? "border-[#f0b400]" : "border-app-line"
                    }`}
                  >
                    <span className="text-lg text-app-muted">@</span>
                    <input
                      id="handle"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value.replace(/^@+/, ""))}
                      placeholder="yourhandle"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="url"
                      maxLength={100}
                      className="min-h-13 w-full bg-transparent px-1 text-[17px] outline-none"
                    />
                  </div>
                  {handleMsg && <p className="rise mt-2 rounded-xl bg-app-warn-bg px-3 py-2 text-sm text-app-warn-ink">{handleMsg}</p>}
                </div>

                <div className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.18em] text-app-muted uppercase">
                  <span className="h-px flex-1 bg-app-line" /> and / or <span className="h-px flex-1 bg-app-line" />
                </div>

                <div>
                  <label htmlFor="desc" className="text-[15px] font-semibold">
                    What do you create, and for whom?
                  </label>
                  {question && (
                    <p className="rise mt-2 rounded-2xl rounded-bl-sm bg-app-accent px-4 py-2.5 text-sm text-white">💬 {question}</p>
                  )}
                  <textarea
                    id="desc"
                    ref={descRef}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="e.g. I'm a dietitian in Pune. I share easy veg recipes for weight loss."
                    className="mt-1.5 w-full resize-none rounded-2xl border border-app-line bg-app-tint px-4 py-3 text-[16px] leading-relaxed outline-none focus:border-app-accent focus:bg-app-surface"
                  />
                  <div className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
                    {EXAMPLES.map((ex) => (
                      <button
                        type="button"
                        key={ex}
                        onClick={() => setDescription(ex)}
                        className="shrink-0 rounded-full border border-app-line bg-app-surface px-3.5 py-1.5 text-[13px] text-app-ink transition hover:border-app-accent hover:text-app-accent active:bg-app-tint"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[15px] font-semibold">Write my page in</p>
                  <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-full bg-app-tint p-1" role="radiogroup">
                    {(Object.keys(LANG_LABEL) as Language[]).map((l) => (
                      <button
                        type="button"
                        key={l}
                        role="radio"
                        aria-checked={language === l}
                        onClick={() => setLanguage(l)}
                        className={`min-h-10 rounded-full text-[15px] font-medium transition ${
                          language === l ? "bg-app-ink text-white shadow" : "text-app-muted hover:text-app-ink"
                        }`}
                      >
                        {LANG_LABEL[l]}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="min-h-14 rounded-full bg-app-accent text-[17px] font-semibold text-white shadow-[0_8px_24px_rgba(0,89,255,0.35)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40 disabled:shadow-none"
                >
                  Build my store ✨
                </button>
                <p className="-mt-2 text-center text-xs text-app-muted">Takes about 15 seconds</p>
              </form>
            </div>
          </section>
        </div>
      </div>

      {/* How it works: pastel cards */}
      <section className="mx-auto max-w-md px-4 pt-4 pb-12 lg:max-w-6xl lg:px-8 lg:pt-20 lg:pb-24">
        <h2 className="tight text-[24px] font-medium lg:text-center lg:text-[44px]">
          From blank page <span className="font-serif-i text-[28px] lg:text-[50px]">to first sale</span>
        </h2>
        <p className="mt-2 hidden text-center text-[17px] text-app-muted lg:block">
          The three things new creators get stuck on, done for you in one go.
        </p>
        <div className="mt-4 grid gap-3 lg:mt-12 lg:grid-cols-3 lg:gap-6">
          {STEPS.map((c) => (
            <div key={c.n} className={`${c.bg} rounded-[20px] p-5 lg:min-h-[220px] lg:rounded-[28px] lg:p-8`}>
              <p className="text-[12px] font-semibold text-app-muted lg:text-[14px]">{c.n}</p>
              <p className="mt-1 text-[19px] font-semibold tracking-tight lg:mt-10 lg:text-[26px]">{c.t}</p>
              <p className="mt-1 text-[14.5px] leading-snug text-app-ink/75 lg:mt-2 lg:text-[16px]">{c.d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

/* ---------------- Generating screen ---------------- */

function GeneratingScreen({ handle }: { handle: string }) {
  const steps = [
    ...(handle ? [`Reading @${handle.replace(/^@/, "")}'s profile`] : []),
    "Spotting what your audience trusts you for",
    "Picking products and pricing them for India",
    "Writing your bio and product pages",
  ];
  const [i, setI] = useState(0);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const a = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 3500);
    const b = setTimeout(() => setSlow(true), 25_000);
    return () => {
      clearInterval(a);
      clearTimeout(b);
    };
  }, [steps.length]);

  return (
    <main className="min-h-dvh bg-app-night text-white" aria-live="polite">
      <div className="mx-auto max-w-md px-5 pt-12 pb-10 lg:grid lg:min-h-dvh lg:max-w-6xl lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16 lg:px-8 lg:py-16">
        <section>
          <h1 className="tight text-[34px] leading-[1.05] font-medium lg:text-[56px]">
            Building <span className="font-serif-i text-[38px] text-[#cfe6ff] lg:text-[64px]">your store…</span>
          </h1>
          <ol className="mt-6 space-y-3.5 lg:mt-10 lg:space-y-5">
            {steps.map((s, j) => (
              <li key={s} className={`flex items-center gap-3 text-[15.5px] transition lg:text-[18px] ${j > i ? "text-white/35" : "text-white"}`}>
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs lg:h-7 lg:w-7 ${
                    j < i ? "bg-[#00b67a] text-white" : j === i ? "border-2 border-app-accent-2" : "border border-white/20"
                  }`}
                >
                  {j < i ? "✓" : j === i ? <span className="h-2 w-2 animate-ping rounded-full bg-app-accent-2" /> : ""}
                </span>
                {s}
              </li>
            ))}
          </ol>
          {slow && (
            <p className="rise mt-6 rounded-2xl bg-white/10 px-4 py-2.5 text-sm text-white/85 lg:max-w-md">
              Taking a little longer than usual. Still working on it…
            </p>
          )}
        </section>

        <section className="mt-10 space-y-4 opacity-90 lg:mt-0" aria-hidden>
          <div className="overflow-hidden rounded-[24px] bg-app-surface shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="h-20 bg-gradient-to-br from-[#0059ff] to-[#8fd3ff] opacity-60" />
            <div className="p-5">
              <div className="-mt-14 mx-auto h-20 w-20 rounded-full skeleton ring-4 ring-white" />
              <div className="mx-auto mt-4 h-6 w-48 skeleton" />
              <div className="mx-auto mt-3 h-4 w-64 skeleton" />
              <div className="mt-6 grid gap-3 lg:grid-cols-2">
                <div className="h-36 rounded-[18px] skeleton" />
                <div className="h-36 rounded-[18px] skeleton" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ---------------- Edit sheets ---------------- */

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-app-muted">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-app-line bg-app-tint px-3 py-2.5 text-[16px] outline-none focus:border-app-accent focus:bg-app-surface";

function RewriteBar({ busy, chips, onRewrite, label }: { busy: boolean; chips: string[]; onRewrite: (i?: string) => void; label: string }) {
  const [custom, setCustom] = useState("");
  return (
    <div className="rounded-[20px] bg-app-tint p-3">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c}
            disabled={busy}
            onClick={() => onRewrite(c)}
            className="min-h-9 rounded-full border border-app-line bg-app-surface px-3.5 text-[13px] font-medium disabled:opacity-50"
          >
            {c}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          maxLength={200}
          placeholder="Or say what to change…"
          className="min-h-10 flex-1 rounded-full border border-app-line bg-app-surface px-4 text-[15px] outline-none focus:border-app-accent"
        />
        <button
          disabled={busy}
          onClick={() => onRewrite(custom.trim() || undefined)}
          className="min-h-10 shrink-0 rounded-full bg-app-accent px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "…" : label}
        </button>
      </div>
    </div>
  );
}

function BioSheet({
  storefront: s,
  busy,
  onChange,
  onRewrite,
  onClose,
}: {
  storefront: Storefront;
  busy: boolean;
  onChange: (p: Partial<Storefront>) => void;
  onRewrite: (instr?: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open
      onClose={onClose}
      title="Your intro"
      footer={
        <button onClick={onClose} className="min-h-12 w-full rounded-full bg-app-ink font-semibold text-white">
          Done
        </button>
      }
    >
      <div className="space-y-4">
        <RewriteBar busy={busy} label="✨ Rewrite" chips={["Shorter", "More personal", "More confident", "Add Hinglish"]} onRewrite={onRewrite} />
        <Field label="Name">
          <input className={inputCls} value={s.displayName} maxLength={80} onChange={(e) => onChange({ displayName: e.target.value })} />
        </Field>
        <Field label="Niche">
          <input className={inputCls} value={s.niche} maxLength={80} onChange={(e) => onChange({ niche: e.target.value })} />
        </Field>
        <Field label="Tagline">
          <input className={inputCls} value={s.tagline} maxLength={140} onChange={(e) => onChange({ tagline: e.target.value })} />
        </Field>
        <Field label="Bio" hint={`${s.bio.length}/800`}>
          <textarea className={`${inputCls} resize-none`} rows={5} value={s.bio} maxLength={800} onChange={(e) => onChange({ bio: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}

function ProductSheet({
  product: p,
  followers,
  canDelete,
  busy,
  onChange,
  onRewrite,
  onDelete,
  onClose,
}: {
  product: Product;
  followers?: number;
  canDelete: boolean;
  busy: boolean;
  onChange: (p: Partial<Product>) => void;
  onRewrite: (instr?: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [min, max] = priceBand(p.format, followers);
  const outside = p.priceInr < min || p.priceInr > max;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit product"
      footer={
        <div className="flex gap-2">
          {canDelete && (
            <button onClick={onDelete} className="min-h-12 rounded-full border border-app-line px-5 text-sm font-semibold text-[#d0234f]">
              Remove
            </button>
          )}
          <button onClick={onClose} className="min-h-12 flex-1 rounded-full bg-app-ink font-semibold text-white">
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <RewriteBar busy={busy} label="✨ New idea" chips={["Different idea", "Cheaper", "More premium", "Shorter copy"]} onRewrite={onRewrite} />

        <Field label="Title">
          <input className={inputCls} value={p.title} maxLength={120} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Format">
            <select className={inputCls} value={p.format} onChange={(e) => onChange({ format: e.target.value as Format })}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={p.format === "community" ? "Price / month" : "Price"}>
            <div className="flex items-center rounded-xl border border-app-line bg-app-tint px-3 focus-within:border-app-accent">
              <span className="text-app-muted">₹</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={500000}
                value={Number.isFinite(p.priceInr) ? p.priceInr : 0}
                onChange={(e) => onChange({ priceInr: Math.max(0, Math.min(500000, Math.round(Number(e.target.value) || 0))), priceAdjusted: false })}
                className="min-h-11 w-full bg-transparent px-1 text-[16px] outline-none"
              />
            </div>
          </Field>
        </div>

        <div className="rounded-[20px] bg-app-mint p-4">
          <p className="text-sm font-semibold">💡 Why {formatInr(p.priceInr)}?</p>
          <p className="mt-1 text-sm leading-relaxed text-app-muted">{p.priceRationale}</p>
          <p className={`mt-2 text-xs ${outside ? "font-semibold text-app-warn-ink" : "text-app-muted"}`}>
            {outside ? "⚠ Outside the usual range. " : ""}Typical for {FORMAT_LABEL[p.format].toLowerCase()} at your audience size:{" "}
            {formatInr(min)}–{formatInr(max)}
          </p>
          {p.priceAdjusted && <p className="mt-1 text-xs text-app-muted">We nudged the AI&apos;s price to a familiar price point.</p>}
        </div>

        <Field label="Description">
          <textarea className={`${inputCls} resize-none`} rows={5} maxLength={1200} value={p.description} onChange={(e) => onChange({ description: e.target.value })} />
        </Field>
        <Field label="What's included" hint="One per line">
          <textarea
            className={`${inputCls} resize-none`}
            rows={4}
            value={p.highlights.join("\n")}
            onChange={(e) => onChange({ highlights: e.target.value.split("\n").slice(0, 6).map((l) => l.slice(0, 160)) })}
            onBlur={(e) => onChange({ highlights: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 6) })}
          />
        </Field>
        <Field label="Button text">
          <input className={inputCls} value={p.cta} maxLength={40} onChange={(e) => onChange({ cta: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}

/* ---------------- Published screen ---------------- */

function PublishedScreen({ draft, onEdit, onNew }: { draft: Draft; onEdit: () => void; onNew: () => void }) {
  const { slug, editToken } = draft.publish!;
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [st, setSt] = useState<{ views: number; clicks: Record<string, number> } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- origin only exists in the browser
    setOrigin(window.location.origin);
    api<{ kind: string; views: number; clicks: Record<string, number> }>("/api/stats", { slug, editToken }, 10_000).then(
      (r) => r.ok && r.data.kind === "ok" && setSt({ views: r.data.views ?? 0, clicks: r.data.clicks ?? {} }),
    );
  }, [slug, editToken]);

  const url = `${origin}/s/${slug}`;
  const share = `Check out my store: ${url}`;
  const clicks = st ? Object.values(st.clicks).reduce((a, b) => a + b, 0) : null;

  return (
    <main className="min-h-dvh bg-app-tint">
      <section className="bg-app-night px-5 pt-12 pb-20 text-white lg:pt-20 lg:pb-32">
        <div className="rise mx-auto max-w-md lg:max-w-5xl lg:px-3">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-[#00b67a] text-2xl lg:h-16 lg:w-16">✓</div>
          <h1 className="tight mt-5 text-[38px] leading-[1.02] font-medium lg:text-[64px]">
            Your store is <span className="font-serif-i text-[44px] text-[#cfe6ff] lg:text-[74px]">live.</span>
          </h1>
          <p className="mt-3 text-white/70 lg:text-[18px]">Put this link in your Instagram bio and share it with your followers.</p>
        </div>
      </section>

      <section className="mx-auto -mt-12 max-w-md px-4 pb-10 lg:-mt-20 lg:grid lg:max-w-5xl lg:grid-cols-[1.2fr_1fr] lg:items-start lg:gap-6 lg:px-8">
        <div className="rounded-[24px] bg-app-surface p-4 shadow-[0_12px_40px_rgba(22,16,30,0.12)] lg:p-6">
          <p className="mb-3 hidden text-sm font-semibold lg:block">Your store link</p>
          <div className="flex items-center gap-2 rounded-full bg-app-tint p-1.5 pl-4">
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{url.replace(/^https?:\/\//, "")}</span>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {}
              }}
              className="min-h-10 rounded-full bg-app-ink px-5 text-sm font-semibold text-white"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(share)}`}
              target="_blank"
              rel="noreferrer"
              className="grid min-h-12 place-items-center rounded-full bg-[#25D366] font-semibold text-white transition hover:brightness-105"
            >
              Share on WhatsApp
            </a>
            <a
              href={`/s/${slug}`}
              target="_blank"
              className="grid min-h-12 place-items-center rounded-full bg-app-accent font-semibold text-white transition hover:brightness-110"
            >
              View store ↗
            </a>
          </div>
          <div className="mt-6 hidden gap-2 border-t border-app-line pt-5 lg:flex">
            <button onClick={onEdit} className="min-h-12 flex-1 rounded-full border border-app-line font-semibold transition hover:bg-app-tint">
              Keep editing
            </button>
            <button onClick={onNew} className="min-h-12 flex-1 rounded-full text-sm font-medium text-app-muted hover:text-app-ink">
              Build another store
            </button>
          </div>
        </div>

        <div className="lg:rounded-[24px] lg:bg-app-surface lg:p-6 lg:shadow-[0_12px_40px_rgba(22,16,30,0.12)]">
          <h2 className="tight mt-8 text-[22px] font-medium lg:mt-0">
            How it&apos;s <span className="font-serif-i text-[26px]">doing</span>
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-[20px] bg-app-sky p-4">
              <p className="tight text-[30px] font-bold">{st?.views ?? "–"}</p>
              <p className="text-sm text-app-ink/70">visits</p>
            </div>
            <div className="rounded-[20px] bg-app-mint p-4">
              <p className="tight text-[30px] font-bold">{clicks ?? "–"}</p>
              <p className="text-sm text-app-ink/70">product clicks</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-app-muted">Your own visits from this device aren&apos;t counted.</p>
        </div>

        <div className="mt-8 flex gap-2 lg:hidden">
          <button onClick={onEdit} className="min-h-12 flex-1 rounded-full border border-app-line bg-app-surface font-semibold">
            Keep editing
          </button>
          <button onClick={onNew} className="min-h-12 flex-1 rounded-full text-sm font-medium text-app-muted">
            Build another store
          </button>
        </div>
      </section>
    </main>
  );
}
