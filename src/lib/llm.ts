import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

/**
 * Defensive LLM wrapper built for free-tier reality.
 *
 * What we observed on Gemini's free tier: each model has its own small
 * per-minute quota (429), models get overloaded at random (503), and latency
 * swings from 10s to 45s+. So:
 *
 *   1. ONE request at a time (no hedging), to protect the free quota.
 *   2. An ordered chain of models. Each has a separate quota, so when one is
 *      out of quota or overloaded we move on in ~1s.
 *   3. A circuit breaker: a model that just returned 429/503/timeout is
 *      skipped for a cooldown, so the next creator doesn't wait on it.
 *   4. Optional second provider (Groq, also free) if GROQ_API_KEY is set.
 *   5. Gemini enforces the JSON shape; Zod enforces limits; a product-level
 *      quality check (price ladder, clichés, duplicates) gets one repair round.
 *
 * Callers get valid data or a typed error they can turn into a friendly message.
 */

export class LlmError extends Error {
  constructor(
    public kind: "config" | "timeout" | "invalid" | "provider" | "rate_limited",
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

/** A file the model should read alongside the prompt (PDF, image, plain text). */
export interface FilePart {
  mimeType: string;
  data: string; // base64
}

interface Candidate {
  id: string;
  /** Whether this provider can read attached files natively. */
  files: boolean;
  call(system: string, user: string, jsonSchema: unknown, timeoutMs: number, temperature: number, files?: FilePart[]): Promise<string>;
}

/* ---------------- Gemini ---------------- */

const GEMINI_MODELS = (
  process.env.GEMINI_MODELS ||
  "gemini-3.5-flash,gemini-3.6-flash,gemini-3.1-flash-lite,gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.7-flash"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

let gemini: GoogleGenAI | null = null;

function classify(model: string, e: unknown, aborted: boolean, timeoutMs: number): LlmError {
  if (aborted) return new LlmError("timeout", `${model} timed out after ${timeoutMs}ms`);
  if (e instanceof LlmError) return e;
  const msg = String((e as Error)?.message ?? e);
  const retry = msg.match(/retryDelay"?:\s*"?(\d+(?:\.\d+)?)s/)?.[1];
  if (/\b429\b|RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg))
    return new LlmError("rate_limited", `${model}: rate limited`, retry ? Number(retry) * 1000 : 60_000);
  return new LlmError("provider", `${model}: ${msg.slice(0, 200)}`);
}

function geminiCandidate(model: string): Candidate {
  return {
    id: model,
    files: true,
    async call(system, user, jsonSchema, timeoutMs, temperature, files) {
      if (!process.env.GEMINI_API_KEY) throw new LlmError("config", "GEMINI_API_KEY is not set");
      gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await gemini.models.generateContent({
          model,
          contents: [
            { role: "user", parts: [{ text: user }, ...(files ?? []).map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.data } }))] },
          ],
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchema,
            temperature,
            abortSignal: ctrl.signal,
          },
        });
        if (!res.text) throw new LlmError("provider", `${model}: empty response`);
        return res.text;
      } catch (e) {
        throw classify(model, e, ctrl.signal.aborted, timeoutMs);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/* ---------------- Groq (optional, free tier, OpenAI-compatible) ---------------- */

function groqCandidate(model: string): Candidate {
  return {
    id: `groq:${model}`,
    files: false,
    async call(system, user, jsonSchema, timeoutMs, temperature) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            temperature,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: `${system}\n\nRespond with a single JSON object that matches this JSON Schema exactly:\n${JSON.stringify(jsonSchema)}` },
              { role: "user", content: user },
            ],
          }),
        });
        const body = await res.text();
        if (!res.ok) {
          const retry = Number(res.headers.get("retry-after"));
          if (res.status === 429) throw new LlmError("rate_limited", `groq:${model}: rate limited`, retry ? retry * 1000 : 60_000);
          throw new LlmError("provider", `groq:${model}: ${res.status} ${body.slice(0, 200)}`);
        }
        const text = JSON.parse(body)?.choices?.[0]?.message?.content;
        if (!text) throw new LlmError("provider", `groq:${model}: empty response`);
        return text;
      } catch (e) {
        throw classify(`groq:${model}`, e, ctrl.signal.aborted, timeoutMs);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function candidates(): Candidate[] {
  const list = GEMINI_MODELS.map(geminiCandidate);
  if (process.env.GROQ_API_KEY) {
    // Fast free fallback, slotted after the two best Gemini models.
    list.splice(2, 0, groqCandidate(process.env.GROQ_MODEL || "llama-3.3-70b-versatile"));
  }
  return list;
}

/* ---------------- Circuit breaker ---------------- */

// Per server instance. Good enough: it only decides what to try first.
const coolUntil = new Map<string, number>();
const COOLDOWN = { rate_limited: 60_000, provider: 20_000, timeout: 30_000 } as const;

function cool(id: string, err: LlmError) {
  const ms = err.kind === "rate_limited" ? Math.min(err.retryAfterMs ?? COOLDOWN.rate_limited, 120_000) : err.kind === "provider" ? COOLDOWN.provider : err.kind === "timeout" ? COOLDOWN.timeout : 0;
  if (ms) coolUntil.set(id, Date.now() + ms);
}

/** Healthy candidates first (in preferred order), then cooling ones as a last resort. */
function ordered(): Candidate[] {
  const now = Date.now();
  const all = candidates();
  const healthy = all.filter((c) => (coolUntil.get(c.id) ?? 0) <= now);
  const cooling = all.filter((c) => (coolUntil.get(c.id) ?? 0) > now).sort((a, b) => coolUntil.get(a.id)! - coolUntil.get(b.id)!);
  return [...healthy, ...cooling];
}

/* ---------------- Validation ---------------- */

function toJsonSchema(schema: z.ZodType): unknown {
  const js = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

function parse<T>(schema: z.ZodType<T>, text: string): { ok: true; data: T } | { ok: false; errors: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { ok: false, errors: "Response was not valid JSON." };
  }
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    errors: r.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n"),
  };
}

/* ---------------- Main entry ---------------- */

export interface GenerateOpts<T> {
  schema: z.ZodType<T>;
  system: string;
  user: string;
  /** Return a list of problems; empty means good enough. */
  qualityCheck?: (data: T) => string[];
  temperature?: number;
  /** Total wall-clock budget for all attempts. */
  budgetMs?: number;
  /** Files for the model to read (only providers that support files are tried). */
  files?: FilePart[];
}

export interface GenerateResult<T> {
  data: T;
  model: string;
  attempts: number;
  repaired: boolean;
}

export async function generateJson<T>(opts: GenerateOpts<T>): Promise<GenerateResult<T>> {
  const { schema, system, user, qualityCheck, temperature = 0.8, budgetMs = 75_000, files } = opts;
  const jsonSchema = toJsonSchema(schema);
  const deadline = Date.now() + budgetMs;
  const left = () => deadline - Date.now();

  let attempts = 0;
  let prompt = user;
  let repaired = false;
  let lastErr: LlmError | null = null;
  let best: { data: T; model: string; issues: number } | null = null;

  const queue = ordered().filter((c) => !files?.length || c.files);
  const retriedInvalid = new Set<string>();
  for (let qi = 0; qi < queue.length; qi++) {
    if (left() < 6_000) break;
    const c = queue[qi];
    attempts++;
    const t0 = Date.now();
    let text: string;
    try {
      // Reading files takes longer, so allow a bit more per attempt.
      text = await c.call(system, prompt, jsonSchema, Math.min(files?.length ? 40_000 : 30_000, left() - 1_000), temperature, files);
      coolUntil.delete(c.id);
    } catch (e) {
      lastErr = e as LlmError;
      console.warn(`[llm] ${c.id} ${lastErr.kind} after ${Date.now() - t0}ms`);
      if (lastErr.kind === "config") throw lastErr;
      cool(c.id, lastErr);
      continue; // next model
    }

    const parsed = parse(schema, text);
    if (!parsed.ok) {
      console.warn(`[llm] ${c.id} invalid output: ${parsed.errors.slice(0, 160)}`);
      lastErr = new LlmError("invalid", parsed.errors);
      prompt = `${user}\n\nA previous answer failed validation:\n${parsed.errors}\nReturn corrected JSON only.`;
      repaired = true;
      if (!retriedInvalid.has(c.id)) {
        retriedInvalid.add(c.id);
        qi--; // retry the same model once with the errors fed back
      }
      continue;
    }

    const issues = qualityCheck?.(parsed.data) ?? [];
    console.info(`[llm] ${c.id} ok in ${Date.now() - t0}ms${issues.length ? ` with issues: ${issues.join(" | ")}` : ""}`);
    if (!best || issues.length < best.issues) best = { data: parsed.data, model: c.id, issues: issues.length };
    if (issues.length === 0) return { data: parsed.data, model: c.id, attempts, repaired };

    // Quality problems: one repair round on the same model if there's time, else ship the best valid answer.
    if (repaired || left() < 20_000) break;
    repaired = true;
    prompt = `${user}\n\nYour previous answer had these problems:\n- ${issues.join("\n- ")}\nFix them and return the full JSON again.\n\nPrevious answer:\n${text}`;
    qi--;
  }

  if (best) return { data: best.data, model: best.model, attempts, repaired };
  throw lastErr ?? new LlmError("timeout", "Generation ran out of time");
}
