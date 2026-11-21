import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/Brand";
import StorefrontView from "@/components/StorefrontView";
import { DEMO_STOREFRONT } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Minute Store · Turn your Instagram into a store",
  description:
    "For Indian creators, coaches and educators: get products, INR pricing and a bio that fits Instagram, in about a minute. Free, no sign-up.",
};

function GetStarted({ className = "", label = "Get started, it's free" }: { className?: string; label?: string }) {
  return (
    <Link
      href="/create"
      className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-app-accent px-7 text-[17px] font-semibold text-white shadow-[0_10px_30px_rgba(0,89,255,0.4)] transition hover:brightness-110 active:scale-[0.99] ${className}`}
    >
      {label} <span aria-hidden>→</span>
    </Link>
  );
}

/** The sample store inside a phone frame (illustration only). */
function PhoneMock({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto w-[300px] lg:w-[340px] ${className}`} aria-hidden>
      <div className="absolute -inset-10 rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, #0099ff 0%, transparent 70%)" }} />
      <div className="relative overflow-hidden rounded-[44px] border-[10px] border-[#1d1726] bg-[#1d1726] shadow-[0_40px_100px_rgba(0,0,0,0.55)]">
        <div className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-[#1d1726]" />
        <div className="pointer-events-none h-[560px] overflow-hidden rounded-[34px] bg-sf-bg lg:h-[620px]">
          {/* Shrunk to fit more of the store, and slowly scrolled so the products and prices show. */}
          <div className="phone-scroll w-[133.33%]">
            <StorefrontView storefront={DEMO_STOREFRONT} mode="public" />
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-white/50">Sample store</p>
    </div>
  );
}

const PROBLEMS = [
  {
    bg: "bg-app-blush",
    q: "“What do I sell?”",
    a: "We turn your skills and audience into 2–4 products: e-books, live workshops, courses, 1:1 calls or a community.",
  },
  {
    bg: "bg-app-mint",
    q: "“How much do I charge?”",
    a: "INR prices that fit your niche and audience size, from a low-risk first product up, each with a one-line reason.",
  },
  {
    bg: "bg-app-sky",
    q: "“What do I write?”",
    a: "A bio that fits Instagram's 150 characters, a tagline, and product pages that build trust, in your words.",
  },
];

const STEPS = [
  { t: "Add your handle and a one-liner", d: "Type your Instagram username. We suggest one-liners from it, or write your own." },
  { t: "Tell us about you", d: "Who you are, why people follow you, your story. Write it, or let AI draft it from your one-liner." },
  { t: "Answer two quick questions", d: "New page or existing? Anything you already sell? Type it, or upload your e-book or rate card." },
  { t: "Edit, publish, share", d: "Tap anything to edit or rewrite it with AI. Publish, share on WhatsApp, and see visits and clicks." },
];

const FEATURES = [
  { i: "💰", t: "Smart INR pricing", d: "Prices snapped to familiar points like ₹149, ₹499 and ₹999, kept within a sensible range, with the reason shown." },
  { i: "💡", t: "Your ideas come first", d: "Tell us what you already sell. We build around it and keep your prices exactly as you set them." },
  { i: "📎", t: "Upload what you have", d: "Drop in an e-book, course outline, rate card or screenshot. Your real products, read in seconds." },
  { i: "✍️", t: "A bio that fits Instagram", d: "Always under 150 characters, using your story and real credentials, so you can paste it straight into your profile." },
  { i: "🗣️", t: "English, Hinglish, हिंदी", d: "Your page in the language your followers actually speak." },
  { i: "✨", t: "Tap to edit, AI to rewrite", d: "Change any word, or ask for “cheaper”, “shorter” or a different idea. Undo is one tap away." },
  { i: "🌱", t: "Help for new pages", d: "Starting out? See top creators in your niche (found on the web, with sources), hashtags to study and 6 post ideas." },
  { i: "📈", t: "Share and track", d: "One link for your bio, a WhatsApp share button, and simple visit and click counts." },
];

const HONEST = [
  "Never invents achievements, student counts or testimonials. Social proof comes only from you.",
  "Your prices stay yours. Our guardrails only adjust prices the AI suggests.",
  "We don't read your Instagram profile. Your handle is just your store's name and link.",
  "Uploaded files are read once to build your store, then thrown away.",
];

const FAQ = [
  { q: "Is it free?", a: "Yes. There's no sign-up and no payment. Build, edit and publish your store for free." },
  {
    q: "Do you read my Instagram account?",
    a: "No. We don't log in to or scrape your profile. Your store is built from what you tell us. Your handle is only used as your store's name and link.",
  },
  { q: "Which languages are supported?", a: "English, Hinglish and Hindi. You can switch language later and we'll rewrite your page." },
  {
    q: "How are prices decided?",
    a: "From your niche, the format and your audience size, then kept within a sensible range for Indian buyers and snapped to familiar price points. If you give your own price, we keep it.",
  },
  { q: "Can I change everything?", a: "Yes. Every title, price, description and your bio are editable, and any section can be rewritten with AI." },
  {
    q: "Can my followers pay on the store?",
    a: "Not yet. This version records interest and lets buyers message you on Instagram. Checkout would be the next step.",
  },
  { q: "Will my link keep working?", a: "Yes. Your store gets a permanent link you can put in your Instagram bio and share on WhatsApp." },
];

export default function Landing() {
  return (
    <main className="min-h-dvh overflow-x-clip bg-app-tint text-app-ink">
      {/* ---------- Hero ---------- */}
      <section className="relative bg-app-night text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full opacity-30 blur-3xl lg:h-[620px] lg:w-[620px]"
          style={{ background: "radial-gradient(circle, #0099ff 0%, transparent 70%)" }}
        />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-5 pt-5 lg:px-8 lg:pt-7">
          <Link href="/" aria-label="Minute Store home">
            <BrandLogo size={32} className="text-[18px] lg:text-[21px]" />
          </Link>
          <div className="flex items-center gap-7">
            <div className="hidden items-center gap-7 text-[15px] text-white/70 lg:flex">
              <a href="#how" className="hover:text-white">
                How it works
              </a>
              <a href="#features" className="hover:text-white">
                Features
              </a>
              <a href="#faq" className="hover:text-white">
                FAQ
              </a>
            </div>
            <Link href="/create" className="inline-flex min-h-10 items-center rounded-full bg-white px-4 text-[14px] font-semibold text-app-ink transition hover:bg-[#e8f1ff]">
              Get started
            </Link>
          </div>
        </nav>

        <div className="relative mx-auto max-w-6xl px-5 pt-10 pb-16 lg:grid lg:grid-cols-[1.3fr_1fr] lg:items-center lg:gap-10 lg:px-8 lg:pt-16 lg:pb-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-medium text-white/85">
              <span className="rounded-full bg-app-accent px-2 py-0.5 text-[11px] font-semibold text-white">New</span>
              For Indian creators, coaches & educators
            </p>
            <h1 className="tight mt-5 text-[42px] leading-[1.02] font-medium lg:text-[56px] lg:leading-[1] xl:text-[62px]">
              Turn your Instagram
              <br />
              into a store, <span className="font-serif-i text-[48px] whitespace-nowrap text-[#cfe6ff] lg:text-[64px] xl:text-[70px]">in a minute.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-white/70 lg:text-[19px]">
              Tell us what you do. Minute Store suggests what to sell, prices it for Indian buyers and writes your page, in English,
              Hinglish or हिंदी. Edit anything, then share one link.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <GetStarted />
              <Link
                href="/demo"
                className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/20 px-6 text-[16px] font-semibold text-white transition hover:bg-white/10"
              >
                See a sample store
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[14.5px] text-white/75">
              {["Free", "No sign-up", "Ready in about a minute"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[#00b67a] text-[11px] font-bold text-white">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <PhoneMock className="mt-14 lg:mt-0" />
        </div>
      </section>

      {/* ---------- Problem ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-16 lg:px-8 lg:py-24">
        <p className="text-[12.5px] font-semibold tracking-[0.16em] text-app-accent uppercase">Why Minute Store</p>
        <h2 className="tight mt-2 max-w-3xl text-[32px] leading-[1.08] font-medium lg:text-[52px]">
          Great creators stall on an <span className="font-serif-i text-[36px] lg:text-[58px]">empty store.</span>
        </h2>
        <p className="mt-4 max-w-2xl text-[16.5px] leading-relaxed text-app-muted lg:text-[18px]">
          You have the audience and the expertise. What&apos;s missing is the first draft: what to sell, what to charge and what to say.
          We do that part with you.
        </p>
        <div className="mt-10 grid gap-4 lg:grid-cols-3 lg:gap-6">
          {PROBLEMS.map((p) => (
            <div key={p.q} className={`${p.bg} rounded-[26px] p-6 lg:min-h-[230px] lg:p-8`}>
              <p className="font-serif-i text-[28px] leading-tight lg:text-[32px]">{p.q}</p>
              <p className="mt-4 text-[15.5px] leading-relaxed text-app-ink/80">{p.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="scroll-mt-6 bg-app-surface py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <p className="text-[12.5px] font-semibold tracking-[0.16em] text-app-accent uppercase">How it works</p>
          <h2 className="tight mt-2 text-[32px] leading-[1.08] font-medium lg:text-[52px]">
            From handle to shop, <span className="font-serif-i text-[36px] lg:text-[58px]">in four steps.</span>
          </h2>
          <ol className="mt-10 grid gap-4 lg:grid-cols-4 lg:gap-6">
            {STEPS.map((s, i) => (
              <li key={s.t} className="relative rounded-[24px] border border-app-line bg-app-tint p-6">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-app-ink text-[15px] font-bold text-white">{i + 1}</span>
                <p className="mt-4 text-[18px] leading-snug font-semibold tracking-tight">{s.t}</p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-app-muted">{s.d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex justify-center">
            <GetStarted label="Build my store" />
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-6 px-5 py-16 lg:px-8 lg:py-24">
        <p className="text-[12.5px] font-semibold tracking-[0.16em] text-app-accent uppercase">Features</p>
        <h2 className="tight mt-2 max-w-3xl text-[32px] leading-[1.08] font-medium lg:text-[52px]">
          Everything your first store needs, <span className="font-serif-i text-[36px] lg:text-[58px]">nothing it doesn&apos;t.</span>
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {FEATURES.map((f) => (
            <div key={f.t} className="rounded-[22px] bg-app-surface p-6 shadow-[0_6px_24px_rgba(22,16,30,0.06)]">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-app-tint text-2xl" aria-hidden>
                {f.i}
              </span>
              <p className="mt-4 text-[17px] font-semibold tracking-tight">{f.t}</p>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-app-muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Honesty ---------- */}
      <section className="bg-app-night py-16 text-white lg:py-24">
        <div className="mx-auto max-w-6xl px-5 lg:grid lg:grid-cols-[1fr_1.2fr] lg:gap-16 lg:px-8">
          <div>
            <p className="text-[12.5px] font-semibold tracking-[0.16em] text-[#7cc4ff] uppercase">Trust</p>
            <h2 className="tight mt-2 text-[32px] leading-[1.08] font-medium lg:text-[52px]">
              Built to be <span className="font-serif-i text-[36px] text-[#cfe6ff] lg:text-[58px]">honest.</span>
            </h2>
            <p className="mt-4 text-[16.5px] leading-relaxed text-white/70">
              Your followers trust you. Your store should never say something that isn&apos;t true.
            </p>
          </div>
          <ul className="mt-8 grid gap-3 lg:mt-0">
            {HONEST.map((h) => (
              <li key={h} className="flex gap-3 rounded-[20px] bg-white/[0.06] p-5 text-[15.5px] leading-relaxed text-white/85">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#00b67a] text-[12px] font-bold text-white">✓</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-6 px-5 py-16 lg:py-24">
        <p className="text-center text-[12.5px] font-semibold tracking-[0.16em] text-app-accent uppercase">FAQ</p>
        <h2 className="tight mt-2 text-center text-[32px] leading-[1.08] font-medium lg:text-[48px]">
          Questions? <span className="font-serif-i text-[36px] lg:text-[54px]">Answers.</span>
        </h2>
        <div className="mt-10 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-[20px] bg-app-surface p-5 shadow-[0_4px_18px_rgba(22,16,30,0.05)] open:shadow-[0_8px_28px_rgba(22,16,30,0.08)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16.5px] font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-app-tint text-lg transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-app-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="px-5 pb-16 lg:px-8 lg:pb-24">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0059ff] to-[#0099ff] px-6 py-14 text-center text-white lg:py-20">
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
          <h2 className="tight relative text-[32px] leading-[1.05] font-medium lg:text-[56px]">
            Your store is <span className="font-serif-i text-[36px] lg:text-[62px]">a minute away.</span>
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-[16.5px] text-white/85">Free, no sign-up. Start with your Instagram handle and one line about what you do.</p>
          <Link
            href="/create"
            className="relative mt-8 inline-flex min-h-14 items-center gap-2 rounded-full bg-white px-8 text-[17px] font-semibold text-app-ink transition hover:bg-[#e8f1ff]"
          >
            Get started <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-app-line bg-app-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-[14px] text-app-muted sm:flex-row lg:px-8">
          <BrandLogo size={26} className="text-[16px] text-app-ink" />
          <p>Made for India&apos;s creators, coaches and educators.</p>
          <div className="flex gap-5">
            <Link href="/create" className="hover:text-app-ink">
              Create a store
            </Link>
            <Link href="/demo" className="hover:text-app-ink">
              Sample store
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
