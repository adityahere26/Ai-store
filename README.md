<p align="center"><img src="public/brand/logo-on-white.png" alt="Minute Store" width="460"></p>

# Minute Store

Turn an Instagram handle or a one-line description into a ready-to-share creator store: an AI-written bio, 2–4 product ideas with India-appropriate INR pricing (and the reasoning behind each price), product descriptions, and a mobile-first public page.

Built as a take-home for SuperProfile's PM (AI-native, 0→1) role.

## Flow

1. **Input**: Instagram handle (used as the store name/link) and a short description, plus language (English, Hinglish, हिंदी). One-liner suggestions appear from keywords in the username.
2. **About you**: who you are, what you do, why follow you, social proof and a short story, written by the creator or AI-drafted from the one-liner (AI never invents social proof).
3. **Two quick questions**: is this a new Instagram page (with a username picker), and do you already have something to sell (AI suggests / your ideas / upload an e-book, outline or rate card).
4. **Generate**: one structured LLM call for the whole store; new pages also get inspiration (hashtags to explore, what works, 6 post ideas tied to products).
5. **Edit**: the editor *is* the storefront. Tap any section to edit it, or rewrite just that part with AI. Undo, themes and drafts are autosaved on the device.
6. **Publish**: public link at `/s/<slug>`, WhatsApp share, link-preview image, view/click stats.

## Stack

- Next.js 16 (App Router) + Tailwind CSS v4
- Google Gemini (free tier) via `@google/genai`, with structured JSON output
- Zod for validating every model response
- Upstash Redis for published stores and view/click counters

## Instagram: what we do and don't read

- **The creator's own handle is never looked up.** It's used only as their store name and @link; the store is built from their own words (description, About-you answers, ideas or uploads). The brief treats a self-description as a fully valid input.
- **Two optional helpers check public Instagram pages, best effort:** verifying AI-suggested creators to learn from, and checking whether a new username looks free. Instagram blocks these checks from cloud servers, so on the live site they degrade gracefully ("couldn't verify right now"), and hashtag pages (which always work) show real top posts instead.
- **Production path:** Instagram's official Graph API (creators connect their own account), which would replace both helpers and unlock real top-post data.

## How the AI part works

- **Structured output**: Gemini is given a JSON schema; Zod then validates limits and enums. Invalid output gets one repair attempt with the exact errors fed back.
- **Quality checks in code**: price ladder (entry < core < premium), distinct formats, no duplicate titles, banned clichés ("unlock", "journey"…). Failures trigger one repair round.
- **Pricing guardrails** (`src/lib/pricing.ts`): prices are clamped to a band per format and audience size, then snapped to familiar Indian price points (₹199, ₹499, ₹999…).
- **Honesty rules**: no invented student counts, testimonials or credentials; guesses are surfaced to the creator as "We assumed…".
- **Free-tier resilience** (`src/lib/llm.ts`): an ordered chain of Gemini models (each has its own quota), a cooldown circuit breaker for models returning 429/503/timeouts, and an optional free Groq fallback. The creator never sees a broken page, only a friendly retry with their input kept.

## Run locally

```bash
npm install
cp .env.example .env.local   # then add your GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

Get a free Gemini key at https://aistudio.google.com/apikey. Without Redis env vars, published stores are kept in memory (dev only).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | Google AI Studio key |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | in production | Added automatically by Vercel's Upstash integration (`UPSTASH_REDIS_REST_*` also works) |
| `GEMINI_MODELS` | no | Comma-separated model fallback chain |
| `GROQ_API_KEY`, `GROQ_MODEL` | no | Free backup provider |

## Deploy (Vercel)

1. Import this repo in Vercel.
2. Add `GEMINI_API_KEY` in Project → Settings → Environment Variables.
3. Storage → add **Upstash Redis** (free) and connect it to the project.
4. Redeploy.

## How AI coding tools were used

Built with Claude Code: scaffolding, implementation, and testing of edge cases (fake/private handles, gibberish, one-word niches, Hindi/Hinglish, model rate limits). Product decisions, scope and trade-offs are documented in the decision doc.
