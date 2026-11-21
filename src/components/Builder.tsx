"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import StorefrontView, { compactCount, safeTheme } from "./StorefrontView";
import Sheet from "./Sheet";
import { formatInr, priceBand } from "@/lib/pricing";
import {
  ATTACHMENT_TYPES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  FORMATS,
  FORMAT_LABEL,
  THEMES,
  type CreatorContext,
  type Inspiration,
  type InspirationCreator,
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
  source: { usedInstagram: boolean; captions: number; igStatus: string; usedIdeas?: boolean; files?: number };
  publish?: { slug: string; editToken: string; publishedAt: number };
  /** Loaded on demand, kept with the draft so reopening is instant and free. */
  inspiration?: Inspiration;
  /** Creator said their Instagram page is new: show inspiration up front. */
  newPage?: boolean;
  dirty?: boolean;
}

type Stage = "input" | "clarify" | "generating" | "edit" | "published";

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

/** "Built from your Instagram profile, your ideas and 1 file." */
function sourceLine(d: Draft): string {
  const parts: string[] = [];
  if (d.source.usedInstagram) parts.push(d.source.captions ? `your Instagram bio and ${d.source.captions} recent posts` : "your Instagram profile");
  if (d.ctx.description) parts.push("your description");
  if (d.source.usedIdeas) parts.push("your product ideas");
  if (d.source.files) parts.push(d.source.files === 1 ? "your file" : `your ${d.source.files} files`);
  if (!parts.length) return "Built from your details.";
  const last = parts.pop();
  return `Built from ${parts.length ? `${parts.join(", ")} and ${last}` : last}.`;
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

  // "Anything in mind?" step
  const [choice, setChoice] = useState<Choice>("ai");
  const [ideas, setIdeas] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);

  // "Is this a new Instagram page?" (null until we can guess or they answer)
  const [newPage, setNewPage] = useState<boolean | null>(null);
  // Live Instagram preview, lifted here so the question can be pre-filled from real follower counts.
  const ig = useInstagramPreview(handle);

  // Inspiration panel
  const [inspOpen, setInspOpen] = useState(false);
  const [inspBusy, setInspBusy] = useState(false);
  const [inspError, setInspError] = useState<string | null>(null);

  async function loadInspiration(force = false, base: Draft | null = draft) {
    if (!base || inspBusy) return;
    setInspOpen(true);
    if (base.inspiration && !force) return;
    setInspBusy(true);
    setInspError(null);
    const r = await api<{ kind: string; inspiration: Inspiration; message?: string }>("/api/inspiration", {
      ctx: base.ctx,
      storefront: base.storefront,
    });
    setInspBusy(false);
    if (!r.ok || r.data.kind !== "ok" || !r.data.inspiration) {
      setInspError(r.data.message ?? "Couldn't load inspiration right now. Try again in a moment.");
      return;
    }
    setDraft((d) => (d ? { ...d, inspiration: r.data.inspiration } : d));
  }

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

  /** Build pressed on the input screen: ask the one question first. */
  function askFirst() {
    setHandleMsg(null);
    setQuestion(null);
    if (!handle.trim() && !description.trim()) {
      setQuestion("Add your Instagram handle, or tell us in a line what you create.");
      return;
    }
    // Pre-fill from what we know; the creator can change it.
    if (newPage === null) {
      if (ig.status === "found") setNewPage((ig.profile.followers ?? 0) < 1000);
      else if (!handle.trim() || ig.status === "not_found") setNewPage(true);
    }
    setStage("clarify");
    window.scrollTo({ top: 0 });
  }

  async function generate(useChoice: Choice = choice) {
    setStage("generating");
    window.scrollTo({ top: 0 });
    let attachments: { name: string; mimeType: string; data: string }[] = [];
    if (useChoice === "upload" && files.length) {
      try {
        attachments = await Promise.all(files.map(async (f) => ({ name: f.name, mimeType: f.mimeType, data: await readAsBase64(f.file) })));
      } catch {
        setStage("clarify");
        showError("Couldn't read that file. Please try choosing it again.");
        return;
      }
    }
    const extra = useChoice === "ai" ? {} : { ideas: ideas.trim() || undefined, files: attachments.length ? attachments : undefined };
    const r = await api<{
      kind: string;
      storefront?: Storefront;
      ctx?: CreatorContext;
      assumptions?: string[];
      source?: Draft["source"];
      message?: string;
      question?: string;
    }>("/api/generate", { handle: handle.trim() || undefined, description: description.trim() || undefined, language, newPage: newPage ?? undefined, ...extra });

    const d = r.data;
    if (r.ok && d?.kind === "ok" && d.storefront && d.ctx) {
      const next: Draft = {
        storefront: d.storefront,
        ctx: d.ctx,
        assumptions: d.assumptions ?? [],
        source: d.source ?? { usedInstagram: false, captions: 0, igStatus: "skipped" },
        newPage: newPage ?? undefined,
      };
      setDraft(next);
      setHistory([]);
      setStage("edit");
      window.scrollTo({ top: 0 });
      // New pages get inspiration straight away: creators to learn from + what to post.
      if (newPage) loadInspiration(false, next);
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
      // New products mean old post ideas would point at products that no longer exist.
      setDraft((cur) => (cur ? { ...cur, storefront: d.storefront!, assumptions: d.assumptions ?? [], inspiration: undefined, dirty: true } : cur));
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
          {...{ handle, description, setDescription, language, setLanguage, handleMsg, question, descRef, saved, ig }}
          setHandle={(v) => {
            setHandle(v);
            setHandleMsg(null);
          }}
          onSubmit={askFirst}
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

      {stage === "clarify" && (
        <ClarifyScreen
          who={handle.trim() ? `@${handle.trim().replace(/^@+/, "")}` : `“${description.trim().slice(0, 60)}${description.trim().length > 60 ? "…" : ""}”`}
          {...{ choice, setChoice, ideas, setIdeas, files, setFiles, newPage, setNewPage }}
          handle={handle.trim().replace(/^@+/, "")}
          followers={ig.status === "found" ? ig.profile.followers : undefined}
          ig={ig}
          rawHandle={handle}
          setHandle={(v) => {
            setHandle(v);
            setHandleMsg(null);
          }}
          description={description}
          onBack={() => setStage("input")}
          onBuild={generate}
        />
      )}

      {stage === "generating" && (
        <GeneratingScreen handle={handle.trim()} files={choice === "upload" ? files.length : 0} ideas={choice !== "ai" && !!ideas.trim()} />
      )}

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
                  {sourceLine(draft)}{" "}
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

                <InspirationEntry draft={draft} onOpen={() => loadInspiration()} />

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

      {inspOpen && draft && (stage === "edit" || stage === "published") && (
        <InspirationSheet draft={draft} busy={inspBusy} error={inspError} onRetry={() => loadInspiration(true)} onClose={() => setInspOpen(false)} />
      )}

      {stage === "published" && draft?.publish && (
        <PublishedScreen draft={draft} onEdit={() => setStage("edit")} onNew={startOver} onInspire={() => loadInspiration()} />
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

/* ---------------- Instagram profile preview ---------------- */

interface IgProfile {
  handle: string;
  fullName?: string;
  bio?: string;
  followers?: number;
  following?: number;
  posts?: number;
  avatarUrl?: string;
  isPrivate: boolean;
}
type IgPreview =
  | { status: "idle" }
  | { status: "loading"; handle: string }
  | { status: "found"; profile: IgProfile }
  | { status: "not_found" | "invalid" | "unavailable"; handle: string };

const HANDLE_OK = /^(?!.*\.\.)(?!\.)[a-z0-9._]{1,30}(?<!\.)$/;

/** Debounced lookup while the creator types their handle ("Is this you?"). */
function useInstagramPreview(rawHandle: string): IgPreview {
  const [state, setState] = useState<IgPreview>({ status: "idle" });
  useEffect(() => {
    const h = rawHandle.trim().toLowerCase().replace(/^@+/, "");
    if (!h) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the field is cleared
      setState({ status: "idle" });
      return;
    }
    if (!HANDLE_OK.test(h)) {
      setState({ status: "invalid", handle: h });
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setState({ status: "loading", handle: h });
      try {
        const res = await fetch(`/api/instagram?handle=${encodeURIComponent(h)}`, { signal: ctrl.signal });
        const d = await res.json();
        setState(d.status === "found" ? { status: "found", profile: d.profile } : { status: d.status ?? "unavailable", handle: h });
      } catch {
        if (!ctrl.signal.aborted) setState({ status: "unavailable", handle: h });
      }
    }, 600);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [rawHandle]);
  return state;
}

function IgAvatar({ p }: { p: IgProfile }) {
  const [broken, setBroken] = useState(false);
  if (p.avatarUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.avatarUrl} alt="" onError={() => setBroken(true)} className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-white" />;
  }
  return (
    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-app-ink text-lg font-semibold text-white">
      {(p.fullName || p.handle)[0]?.toUpperCase()}
    </div>
  );
}

function InstagramPreview({ preview }: { preview: IgPreview }) {
  if (preview.status === "idle") return null;
  if (preview.status === "loading")
    return (
      <div className="mt-2 flex items-center gap-3 rounded-2xl border border-app-line p-3" aria-live="polite">
        <div className="h-14 w-14 shrink-0 rounded-full skeleton" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 skeleton" />
          <div className="h-3 w-48 skeleton" />
        </div>
        <span className="sr-only">Looking up @{preview.handle}</span>
      </div>
    );
  if (preview.status === "found") {
    const p = preview.profile;
    const stats = [
      p.followers !== undefined && `${compactCount(p.followers)} followers`,
      p.posts !== undefined && `${compactCount(p.posts)} posts`,
      p.following !== undefined && `${compactCount(p.following)} following`,
    ].filter(Boolean);
    return (
      <div className="rise mt-2 overflow-hidden rounded-2xl border border-app-line" aria-live="polite">
        <div className="flex gap-3 p-3">
          <IgAvatar p={p} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] leading-tight font-semibold">{p.fullName || `@${p.handle}`}</p>
            <p className="truncate text-[13px] text-app-muted">@{p.handle}</p>
            {stats.length > 0 && <p className="mt-1 text-[13px] font-medium">{stats.join(" · ")}</p>}
          </div>
        </div>
        {p.bio && <p className="line-clamp-2 px-3 pb-3 text-[13.5px] leading-snug whitespace-pre-line text-app-ink/80">{p.bio}</p>}
        <p
          className={`px-3 py-2 text-[13px] font-medium ${
            p.isPrivate ? "bg-app-warn-bg text-app-warn-ink" : "bg-app-mint text-[#00714c]"
          }`}
        >
          {p.isPrivate
            ? "🔒 Private account: we can see your name and followers only. Add a line about what you create below."
            : "✓ Found you! We'll use this profile to build your store."}
        </p>
      </div>
    );
  }
  const msg = {
    invalid: "Handles use only letters, numbers, dots and underscores.",
    not_found: `No Instagram account called @${preview.handle}. Check the spelling, or just describe yourself below.`,
    unavailable: "Couldn't reach Instagram right now. Add a line about yourself below and we'll still build your store.",
  }[preview.status];
  return <p className="rise mt-2 rounded-xl bg-app-warn-bg px-3 py-2 text-sm text-app-warn-ink">{msg}</p>;
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
  ig: IgPreview;
  onSubmit: () => void;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const { handle, setHandle, description, setDescription, language, setLanguage, handleMsg, question, descRef, saved } = props;
  const canSubmit = handle.trim() || description.trim();
  const ig = props.ig;
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
                  {handleMsg ? (
                    <p className="rise mt-2 rounded-xl bg-app-warn-bg px-3 py-2 text-sm text-app-warn-ink">{handleMsg}</p>
                  ) : (
                    <InstagramPreview preview={ig} />
                  )}
                </div>

                <div>
                  <label htmlFor="desc" className="text-[15px] font-semibold">
                    What do you create, and for whom?
                    {ig.status === "found" && !ig.profile.isPrivate && (
                      <span className="font-normal text-app-muted"> (optional)</span>
                    )}
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

/* ---------------- Username picker for new pages ---------------- */

interface HandleIdea {
  handle: string;
}

/** New creators: pick an Instagram username and see live whether it looks free. */
function UsernamePicker({
  handle,
  setHandle,
  ig,
  description,
}: {
  handle: string;
  setHandle: (v: string) => void;
  ig: IgPreview;
  description: string;
}) {
  const [ideas, setIdeas] = useState<HandleIdea[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function suggest() {
    setBusy(true);
    setNote(null);
    const r = await api<{ kind: string; suggestions: HandleIdea[]; unchecked: string[]; takenCount: number; message?: string }>(
      "/api/handles",
      { description: description.trim() || undefined, current: ig.status === "found" ? handle : undefined },
      60_000,
    );
    setBusy(false);
    if (!r.ok || r.data.kind !== "ok") {
      setNote(r.data.message ?? "Couldn't suggest names right now. Try typing one instead.");
      return;
    }
    const list = r.data.suggestions ?? [];
    if (list.length) setIdeas(list);
    else if (r.data.unchecked?.length) {
      setIdeas(r.data.unchecked.map((h) => ({ handle: h })));
      setNote("Couldn't reach Instagram to check these. Check them yourself before signing up.");
    } else setNote("Every idea was already taken. Tap again for fresh ones.");
  }

  const h = handle.trim().replace(/^@+/, "").toLowerCase();
  return (
    <div className="rise mt-4 rounded-2xl border border-app-line p-4">
      <p className="text-[15px] font-semibold">Pick your Instagram username</p>
      <p className="text-[12.5px] text-app-muted">We check it on Instagram as you type.</p>
      <div
        className={`mt-2 flex items-center rounded-2xl border bg-app-tint px-4 focus-within:bg-app-surface ${
          ig.status === "not_found" ? "border-[#00b67a]" : ig.status === "found" ? "border-[#f0b400]" : "border-app-line focus-within:border-app-accent"
        }`}
      >
        <span className="text-lg text-app-muted">@</span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value.replace(/^@+/, "").replace(/\s+/g, ""))}
          placeholder="yournewhandle"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={30}
          aria-label="Instagram username for your new page"
          className="min-h-12 w-full bg-transparent px-1 text-[16px] outline-none"
        />
        {ig.status === "loading" && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-app-line border-t-app-accent" aria-hidden />}
        {ig.status === "not_found" && <span className="shrink-0 text-[#00b67a]" aria-hidden>✓</span>}
      </div>

      <div aria-live="polite">
        {ig.status === "loading" && <p className="mt-2 text-[13px] text-app-muted">Checking @{h} on Instagram…</p>}
        {ig.status === "not_found" && (
          <div className="mt-2 rounded-xl bg-app-mint px-3 py-2.5 text-[13.5px] text-[#00714c]">
            <p className="font-semibold">✓ @{h} looks available. Grab it before someone else does!</p>
            <p className="mt-0.5 text-[12px] text-[#00714c]/80">
              We can only see public profiles, so Instagram has the final say when you sign up.{" "}
              <a href="https://www.instagram.com/accounts/emailsignup/" target="_blank" rel="noreferrer" className="font-semibold underline">
                Create it on Instagram ↗
              </a>
            </p>
          </div>
        )}
        {ig.status === "found" && (
          <div className="mt-2 rounded-xl bg-app-warn-bg px-3 py-2.5 text-[13.5px] text-app-warn-ink">
            <p className="font-semibold">
              ✗ @{h} is taken{ig.profile.fullName ? ` by ${ig.profile.fullName}` : ""}
              {ig.profile.followers !== undefined ? ` · ${compactCount(ig.profile.followers)} followers` : ""}.
            </p>
            <p className="mt-0.5 text-[12.5px]">If it isn&apos;t yours, pick another name, otherwise we&apos;d build your store from someone else&apos;s profile.</p>
          </div>
        )}
        {ig.status === "invalid" && (
          <p className="mt-2 rounded-xl bg-app-warn-bg px-3 py-2 text-[13px] text-app-warn-ink">
            Usernames can use letters, numbers, dots and underscores (max 30), and can&apos;t start or end with a dot.
          </p>
        )}
        {ig.status === "unavailable" && <p className="mt-2 text-[13px] text-app-muted">Couldn&apos;t reach Instagram to check right now.</p>}
      </div>

      <button
        onClick={suggest}
        disabled={busy}
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-app-line px-4 text-[14px] font-semibold hover:bg-app-tint disabled:opacity-60"
      >
        {busy ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-app-line border-t-app-accent" aria-hidden /> Finding free names…
          </>
        ) : (
          <>✨ {ideas ? "More username ideas" : "Suggest usernames"}</>
        )}
      </button>
      {note && <p className="mt-2 text-[12.5px] text-app-muted">{note}</p>}
      {ideas && ideas.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold text-app-muted">Checked on Instagram, look free. Tap to use:</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {ideas.map((i) => (
              <button
                key={i.handle}
                onClick={() => setHandle(i.handle)}
                className={`min-h-9 rounded-full border px-3 text-[13.5px] font-medium transition ${
                  h === i.handle ? "border-app-accent bg-app-accent text-white" : "border-app-line bg-app-surface hover:border-app-accent"
                }`}
              >
                @{i.handle}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Clarify screen: "Anything in mind?" ---------------- */

type Choice = "ai" | "ideas" | "upload";

interface PickedFile {
  file: File;
  name: string;
  size: number;
  mimeType: (typeof ATTACHMENT_TYPES)[number];
}

const CHOICES: { id: Choice; icon: string; title: string; desc: string; tint: string }[] = [
  { id: "ai", icon: "✨", title: "Let AI suggest", desc: "Not sure yet? We'll pick products and prices for you.", tint: "bg-app-sky" },
  { id: "ideas", icon: "💡", title: "I have ideas", desc: "Tell us what you sell or want to sell. We'll build around it.", tint: "bg-app-blush" },
  { id: "upload", icon: "📎", title: "Upload what I have", desc: "E-book, course outline, rate card or a screenshot from your phone.", tint: "bg-app-mint" },
];

function fileMime(f: File): PickedFile["mimeType"] | null {
  const t = f.type.toLowerCase();
  if ((ATTACHMENT_TYPES as readonly string[]).includes(t)) return t as PickedFile["mimeType"];
  if (t === "image/jpg") return "image/jpeg";
  if (t === "text/markdown" || /\.(txt|md)$/i.test(f.name)) return "text/plain";
  if (!t && /\.pdf$/i.test(f.name)) return "application/pdf";
  return null;
}

function prettySize(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function readAsBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

function ClarifyScreen(props: {
  who: string;
  handle: string;
  followers?: number;
  newPage: boolean | null;
  setNewPage: (v: boolean) => void;
  ig: IgPreview;
  rawHandle: string;
  setHandle: (v: string) => void;
  description: string;
  choice: Choice;
  setChoice: (c: Choice) => void;
  ideas: string;
  setIdeas: (s: string) => void;
  files: PickedFile[];
  setFiles: (f: PickedFile[]) => void;
  onBack: () => void;
  onBuild: (choice?: Choice) => void;
}) {
  const { choice, setChoice, ideas, setIdeas, files, setFiles } = props;
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setFileError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      const mimeType = fileMime(f);
      if (!mimeType) {
        setFileError(`"${f.name}" isn't supported. Use PDF, JPG, PNG, WEBP or TXT.`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setFileError(`You can add up to ${MAX_FILES} files.`);
        break;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (next.reduce((n, x) => n + x.size, 0) + f.size > MAX_TOTAL_BYTES) {
        setFileError("That's over 3 MB in total. Try a smaller file or a screenshot of the key page.");
        continue;
      }
      next.push({ file: f, name: f.name, size: f.size, mimeType });
    }
    setFiles(next);
  };

  const ready =
    props.newPage !== null && (choice === "ai" || (choice === "ideas" && ideas.trim().length > 0) || (choice === "upload" && files.length > 0));

  return (
    <main className="min-h-dvh bg-app-tint">
      <section className="bg-app-night px-5 pt-5 pb-16 text-white lg:pb-24">
        <div className="mx-auto max-w-md lg:max-w-5xl lg:px-8">
          <button onClick={props.onBack} className="block min-h-10 text-sm font-medium text-white/70 hover:text-white">
            ← Back
          </button>
          <p className="mt-5 flex w-fit max-w-full items-center gap-2 truncate rounded-full bg-white/10 px-3 py-1 text-[12.5px] text-white/80">
            Building for <span className="truncate font-semibold text-white">{props.who}</span>
          </p>
          <h1 className="tight mt-4 text-[34px] leading-[1.05] font-medium lg:text-[56px]">
            Before we build, <span className="font-serif-i text-[38px] text-[#cfe6ff] lg:text-[64px]">two quick questions.</span>
          </h1>
          <p className="mt-3 text-[16px] text-white/70 lg:text-[19px]">Your answers shape your products, prices and tips.</p>
        </div>
      </section>

      <section className="mx-auto -mt-10 max-w-md px-4 pb-32 lg:-mt-14 lg:max-w-5xl lg:px-8 lg:pb-16">
        {/* Q1: new page? */}
        <div className="rounded-[22px] bg-app-surface p-5 shadow-[0_8px_30px_rgba(22,16,30,0.08)] lg:p-6">
          <p className="text-[12px] font-semibold tracking-[0.14em] text-app-muted uppercase">Question 1</p>
          <h2 className="mt-1 text-[18px] font-semibold tracking-tight lg:text-[21px]">
            {props.handle ? (
              <>
                Is <span className="text-app-accent">@{props.handle}</span> a new Instagram page?
              </>
            ) : (
              "Are you just starting on Instagram?"
            )}
          </h2>
          {props.followers !== undefined && (
            <p className="mt-0.5 text-[13px] text-app-muted">We can see {compactCount(props.followers)} followers on this account.</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Is this a new Instagram page?">
            {[
              { v: true, t: "🌱 Yes, just starting", d: "Show me top creators and what to post" },
              { v: false, t: "📈 No, I already post", d: "I have an audience already" },
            ].map((o) => {
              const on = props.newPage === o.v;
              return (
                <button
                  key={String(o.v)}
                  role="radio"
                  aria-checked={on}
                  onClick={() => props.setNewPage(o.v)}
                  className={`rounded-2xl p-3 text-left transition lg:p-4 ${on ? "bg-app-ink text-white" : "bg-app-tint text-app-ink hover:bg-[#ecebf7]"}`}
                >
                  <span className="block text-[15px] font-semibold">{o.t}</span>
                  <span className={`mt-0.5 block text-[12.5px] leading-snug ${on ? "text-white/70" : "text-app-muted"}`}>{o.d}</span>
                </button>
              );
            })}
          </div>
          {props.newPage === true && (
            <UsernamePicker handle={props.rawHandle} setHandle={props.setHandle} ig={props.ig} description={props.description} />
          )}
        </div>

        {/* Q2: anything in mind? */}
        <p className="mt-6 text-[12px] font-semibold tracking-[0.14em] text-app-muted uppercase">Question 2</p>
        <h2 className="mt-1 mb-3 text-[18px] font-semibold tracking-tight lg:text-[21px]">Do you already have something you sell, or want to sell?</h2>
        <div className="grid gap-3 lg:grid-cols-3 lg:gap-5" role="radiogroup" aria-label="What should we build from?">
          {CHOICES.map((c) => {
            const on = choice === c.id;
            return (
              <button
                key={c.id}
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setChoice(c.id);
                  if (c.id === "upload" && files.length === 0) setTimeout(() => inputRef.current?.click(), 50);
                }}
                className={`relative flex items-start gap-4 rounded-[22px] bg-app-surface p-4 text-left shadow-[0_8px_30px_rgba(22,16,30,0.08)] transition lg:flex-col lg:gap-3 lg:p-6 ${
                  on ? "ring-2 ring-app-accent" : "ring-1 ring-app-line hover:ring-app-muted"
                }`}
              >
                <span className={`${c.tint} grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl lg:h-14 lg:w-14`}>{c.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[17px] font-semibold tracking-tight lg:text-[19px]">{c.title}</span>
                  <span className="mt-0.5 block text-[14px] leading-snug text-app-muted">{c.desc}</span>
                </span>
                <span
                  aria-hidden
                  className={`absolute top-4 right-4 grid h-6 w-6 place-items-center rounded-full border-2 text-[12px] font-bold ${
                    on ? "border-app-accent bg-app-accent text-white" : "border-app-line"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>

        {/* Detail panel for the chosen option */}
        <div className="mt-4 rounded-[22px] bg-app-surface p-5 shadow-[0_8px_30px_rgba(22,16,30,0.06)] lg:mt-6 lg:p-7">
          {choice === "ai" && (
            <p className="text-[15px] text-app-ink/80">
              We&apos;ll suggest 2–4 products with India-friendly prices, based on your profile. You can edit or rewrite anything afterwards.
            </p>
          )}

          {choice === "ideas" && (
            <label className="block">
              <span className="text-[15px] font-semibold">What do you sell, or want to sell?</span>
              <textarea
                autoFocus
                value={ideas}
                onChange={(e) => setIdeas(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder={"e.g. A 30-recipe e-book for ₹299, and 1:1 diet plan calls.\nMaybe a monthly WhatsApp group later."}
                className="mt-2 w-full resize-none rounded-2xl border border-app-line bg-app-tint px-4 py-3 text-[16px] leading-relaxed outline-none focus:border-app-accent focus:bg-app-surface"
              />
              <span className="mt-1 block text-xs text-app-muted">Add prices if you know them. We&apos;ll keep your prices as they are.</span>
            </label>
          )}

          {choice === "upload" && (
            <div>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${
                  dragging ? "border-app-accent bg-app-sky" : "border-app-line bg-app-tint hover:border-app-accent"
                }`}
              >
                <span className="text-3xl" aria-hidden>
                  📎
                </span>
                <span className="mt-2 text-[15px] font-semibold">
                  <span className="lg:hidden">Choose from your phone</span>
                  <span className="hidden lg:inline">Drop files here or click to choose</span>
                </span>
                <span className="mt-1 text-[13px] text-app-muted">PDF, JPG, PNG, WEBP or TXT · up to {MAX_FILES} files · 3 MB total</span>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.md,application/pdf,image/jpeg,image/png,image/webp,text/plain"
                  className="sr-only"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {fileError && <p className="rise mt-2 rounded-xl bg-app-warn-bg px-3 py-2 text-sm text-app-warn-ink">{fileError}</p>}
              {files.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {files.map((f, i) => (
                    <li key={f.name + f.size} className="flex items-center gap-3 rounded-xl border border-app-line px-3 py-2">
                      <span aria-hidden>{f.mimeType === "application/pdf" ? "📄" : f.mimeType === "text/plain" ? "📝" : "🖼️"}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
                      <span className="text-xs text-app-muted">{prettySize(f.size)}</span>
                      <button
                        onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        className="grid h-8 w-8 place-items-center rounded-full text-app-muted hover:bg-app-tint"
                        aria-label={`Remove ${f.name}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="mt-4 block">
                <span className="text-sm font-semibold">
                  Anything to add? <span className="font-normal text-app-muted">(optional)</span>
                </span>
                <input
                  value={ideas}
                  onChange={(e) => setIdeas(e.target.value)}
                  maxLength={1000}
                  placeholder="e.g. Price the e-book at ₹199"
                  className="mt-1.5 min-h-11 w-full rounded-full border border-app-line bg-app-tint px-4 text-[15px] outline-none focus:border-app-accent focus:bg-app-surface"
                />
              </label>
              <p className="mt-3 text-xs text-app-muted">🔒 Files are only read to build your store. We don&apos;t save them.</p>
            </div>
          )}
        </div>

        {/* Actions: pinned on mobile, inline on desktop */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-app-line bg-app-surface/95 backdrop-blur lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:backdrop-blur-none">
          <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:max-w-none lg:justify-end lg:p-0">
            {choice !== "ai" && (
              <button
                onClick={() => {
                  setChoice("ai");
                  props.onBuild("ai");
                }}
                className="min-h-12 shrink-0 rounded-full px-4 text-sm font-medium text-app-muted hover:text-app-ink"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => props.onBuild()}
              disabled={!ready}
              className="min-h-12 flex-1 rounded-full bg-app-accent px-6 text-[16px] font-semibold text-white shadow-[0_8px_24px_rgba(0,89,255,0.35)] transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none lg:min-h-14 lg:flex-none lg:px-10"
            >
              Build my store ✨
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

/* ---------------- Generating screen ---------------- */

function GeneratingScreen({ handle, files = 0, ideas = false }: { handle: string; files?: number; ideas?: boolean }) {
  const steps = [
    ...(handle ? [`Reading @${handle.replace(/^@/, "")}'s profile`] : []),
    ...(files ? [`Reading your ${files === 1 ? "file" : `${files} files`}`] : []),
    ...(ideas ? ["Shaping your product ideas"] : []),
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

/* ---------------- Inspiration: creators, patterns, post ideas ---------------- */

const POST_FORMAT_LABEL: Record<string, string> = { reel: "🎬 Reel", carousel: "🖼 Carousel", story: "⏱ Story", live: "🔴 Live" };

/** New creators (under 10K or no Instagram) get a prominent card; others a quiet link. */
function InspirationEntry({ draft, onOpen }: { draft: Draft; onOpen: () => void }) {
  const isNew = draft.newPage ?? (!draft.storefront.followers || draft.storefront.followers < 10_000);
  if (!isNew)
    return (
      <button onClick={onOpen} className="mt-3 flex min-h-11 w-full items-center justify-between rounded-2xl border border-app-line px-4 text-left text-[14px] font-semibold hover:bg-app-tint">
        📈 Content ideas that sell your store <span aria-hidden>→</span>
      </button>
    );
  return (
    <button
      onClick={onOpen}
      className="mt-3 block w-full rounded-2xl bg-gradient-to-br from-[#e5fff1] to-[#dce8ff] px-4 py-3.5 text-left transition hover:brightness-[0.98]"
    >
      <span className="block text-[15px] font-semibold">🌱 Starting out on Instagram?</span>
      <span className="mt-0.5 block text-[13.5px] leading-snug text-app-ink/75">
        See top creators in {draft.storefront.niche || "your niche"}, what&apos;s working, and 6 post ideas that sell your store.
      </span>
      <span className="mt-2 inline-flex min-h-9 items-center rounded-full bg-app-ink px-4 text-[13px] font-semibold text-white">
        {draft.inspiration ? "Open your inspiration →" : "Get inspiration →"}
      </span>
    </button>
  );
}

function CreatorAvatar({ c }: { c: InspirationCreator }) {
  const [broken, setBroken] = useState(false);
  if (c.avatarUrl && !broken)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={c.avatarUrl} alt="" onError={() => setBroken(true)} className="h-12 w-12 shrink-0 rounded-full object-cover" />;
  return <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-ink font-semibold text-white">{(c.name || c.handle)[0]?.toUpperCase()}</div>;
}

function IdeaCard({ idea }: { idea: Inspiration["ideas"][number] }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className="rounded-[18px] border border-app-line p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-app-tint px-2.5 py-0.5 text-[12px] font-semibold">{POST_FORMAT_LABEL[idea.format] ?? idea.format}</span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`${idea.hook}\n\n${idea.outline.map((o, i) => `${i + 1}. ${o}`).join("\n")}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {}
          }}
          className="min-h-8 rounded-full px-3 text-[12.5px] font-semibold text-app-accent hover:bg-app-sky"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-[16px] leading-snug font-semibold">“{idea.hook}”</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px] leading-snug text-app-ink/80">
        {idea.outline.map((o, i) => (
          <li key={i}>{o}</li>
        ))}
      </ol>
      {idea.productTitle && (
        <p className="mt-3 inline-flex max-w-full items-center gap-1 rounded-full bg-app-mint px-3 py-1 text-[12.5px] font-medium text-[#00714c]">
          <span aria-hidden>🛍</span> <span className="truncate">Leads to: {idea.productTitle}</span>
        </p>
      )}
    </li>
  );
}

function InspirationSheet({
  draft,
  busy,
  error,
  onRetry,
  onClose,
}: {
  draft: Draft;
  busy: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const insp = draft.inspiration;
  const niche = draft.storefront.niche || "your niche";
  return (
    <Sheet
      open
      onClose={onClose}
      title="Inspiration"
      footer={
        <div className="flex gap-2">
          {insp && (
            <button onClick={onRetry} disabled={busy} className="min-h-12 rounded-full border border-app-line px-5 text-sm font-semibold disabled:opacity-50">
              {busy ? "Refreshing…" : "↻ New ideas"}
            </button>
          )}
          <button onClick={onClose} className="min-h-12 flex-1 rounded-full bg-app-ink font-semibold text-white">
            Done
          </button>
        </div>
      }
    >
      {busy && !insp && (
        <div aria-live="polite">
          <p className="text-[15px] font-semibold">Finding creators in {niche}…</p>
          <p className="mt-1 text-sm text-app-muted">We check every suggested profile on Instagram, so this can take up to a minute.</p>
          <div className="mt-5 space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full skeleton" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 skeleton" />
                  <div className="h-3 w-56 skeleton" />
                </div>
              </div>
            ))}
            <div className="h-28 rounded-[18px] skeleton" />
            <div className="h-28 rounded-[18px] skeleton" />
          </div>
        </div>
      )}

      {error && !busy && (
        <div className="rounded-2xl bg-app-warn-bg p-4 text-sm text-app-warn-ink">
          <p>{error}</p>
          <button onClick={onRetry} className="mt-2 min-h-9 rounded-full bg-app-ink px-4 font-semibold text-white">
            Try again
          </button>
        </div>
      )}

      {insp && (
        <div className="space-y-7">
          <section>
            <h3 className="tight text-[20px] font-semibold">Creators to learn from</h3>
            <p className="mt-0.5 text-[12.5px] text-app-muted">✓ Profiles checked on Instagram. Tap to see their most popular Reels.</p>
            {insp.creators.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-app-tint p-3 text-sm text-app-muted">
                We couldn&apos;t confirm creator suggestions for this niche right now. Try “New ideas” in a bit.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {insp.creators.map((c) => (
                  <li key={c.handle} className="flex gap-3 rounded-[18px] border border-app-line p-3">
                    <CreatorAvatar c={c} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[15px] leading-tight font-semibold">
                        <span className="truncate">{c.name || `@${c.handle}`}</span>
                        {c.check === "verified" && (
                          <span title="Profile checked on Instagram" className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#0099ff] text-[9px] text-white">
                            ✓
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[12.5px] text-app-muted">
                        @{c.handle}
                        {c.followers ? ` · ${compactCount(c.followers)} followers` : ""}
                        {c.check === "unchecked" ? " · couldn't verify right now" : ""}
                      </p>
                      <p className="mt-1 text-[13.5px] leading-snug text-app-ink/80">{c.why}</p>
                      <a
                        href={`https://www.instagram.com/${c.handle}/reels/`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex min-h-8 items-center rounded-full bg-app-ink px-3 text-[12.5px] font-semibold text-white"
                      >
                        See top Reels ↗
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="tight text-[20px] font-semibold">What&apos;s working in {niche}</h3>
            <p className="mt-0.5 text-[12.5px] text-app-muted">AI analysis of common formats, not stats from specific posts.</p>
            <div className="mt-3 grid gap-2.5">
              {insp.patterns.map((p, i) => (
                <div key={i} className={`${["bg-app-blush", "bg-app-sky", "bg-app-mint", "bg-app-tint"][i % 4]} rounded-[18px] p-4`}>
                  <p className="text-[12px] font-semibold text-app-ink/60">{POST_FORMAT_LABEL[p.format] ?? p.format}</p>
                  <p className="mt-0.5 text-[15.5px] font-semibold">{p.title}</p>
                  <p className="mt-1 text-[13.5px] leading-snug text-app-ink/80">{p.example}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="tight text-[20px] font-semibold">
              {insp.ideas.length} post ideas <span className="font-serif-i text-[22px]">that sell your store</span>
            </h3>
            <p className="mt-0.5 text-[12.5px] text-app-muted">Each one points people to a product in your store. Copy, film, post.</p>
            <ul className="mt-3 space-y-2.5">
              {insp.ideas.map((idea, i) => (
                <IdeaCard key={i} idea={idea} />
              ))}
            </ul>
          </section>
        </div>
      )}
    </Sheet>
  );
}

/* ---------------- Published screen ---------------- */

function PublishedScreen({ draft, onEdit, onNew, onInspire }: { draft: Draft; onEdit: () => void; onNew: () => void; onInspire: () => void }) {
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
          <button
            onClick={onInspire}
            className="mt-4 block w-full rounded-2xl bg-gradient-to-br from-[#e5fff1] to-[#dce8ff] px-4 py-3.5 text-left transition hover:brightness-[0.98]"
          >
            <span className="block text-[15px] font-semibold">🌱 What to post to get your first sale</span>
            <span className="mt-0.5 block text-[13.5px] text-app-ink/75">Creators to learn from + post ideas that link to your products →</span>
          </button>
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
