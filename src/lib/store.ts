import { Redis } from "@upstash/redis";
import { createHash } from "crypto";
import { nanoid, customAlphabet } from "nanoid";
import type { Storefront } from "./schema";

/**
 * Persistence for published stores.
 * A store is one JSON document read by slug, so a key-value store is the
 * natural fit. Views/clicks use atomic counters. Locally, without Redis env
 * vars, an in-memory map keeps development friction-free.
 */

interface Record_ {
  storefront: Storefront;
  tokenHash: string;
  createdAt: number;
  updatedAt: number;
}

interface KV {
  get(key: string): Promise<Record_ | null>;
  set(key: string, val: Record_): Promise<void>;
  setnx(key: string, val: Record_): Promise<boolean>;
  incr(key: string): Promise<void>;
  mget(keys: string[]): Promise<(number | null)[]>;
}

function makeKv(): KV {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const r = new Redis({ url, token });
    return {
      get: (k) => r.get<Record_>(k),
      set: async (k, v) => void (await r.set(k, v)),
      setnx: async (k, v) => (await r.set(k, v, { nx: true })) === "OK",
      incr: async (k) => void (await r.incr(k)),
      mget: async (keys) => (keys.length ? (await r.mget<(number | null)[]>(...keys)).map((v) => (v == null ? null : Number(v))) : []),
    };
  }
  if (process.env.VERCEL) throw new Error("Redis env vars missing in production");
  const g = globalThis as unknown as { __mem?: Map<string, unknown> };
  const m = (g.__mem ??= new Map());
  return {
    get: async (k) => (m.get(k) as Record_) ?? null,
    set: async (k, v) => void m.set(k, v),
    setnx: async (k, v) => (m.has(k) ? false : (m.set(k, v), true)),
    incr: async (k) => void m.set(k, ((m.get(k) as number) ?? 0) + 1),
    mget: async (keys) => keys.map((k) => (m.get(k) as number) ?? null),
  };
}

let kv: KV | null = null;
const db = () => (kv ??= makeKv());

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const suffix = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 4);

export function slugify(s: string): string {
  const base = s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return base || "store";
}

export const SLUG_RE = /^[a-z0-9-]{1,40}$/;

export async function getStore(slug: string): Promise<Storefront | null> {
  if (!SLUG_RE.test(slug)) return null;
  const r = await db().get(`store:${slug}`);
  return r?.storefront ?? null;
}

/** Create a new store with a unique slug. Returns slug + a secret edit token. */
export async function createStore(s: Storefront): Promise<{ slug: string; editToken: string }> {
  const base = slugify(s.handle || s.displayName);
  const editToken = nanoid(24);
  const now = Date.now();
  const rec: Record_ = { storefront: s, tokenHash: hash(editToken), createdAt: now, updatedAt: now };
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? base : `${base}-${suffix()}`;
    if (await db().setnx(`store:${slug}`, rec)) return { slug, editToken };
  }
  throw new Error("Could not allocate a slug");
}

export async function updateStore(slug: string, editToken: string, s: Storefront): Promise<boolean> {
  const cur = await db().get(`store:${slug}`);
  if (!cur || cur.tokenHash !== hash(editToken)) return false;
  await db().set(`store:${slug}`, { ...cur, storefront: s, updatedAt: Date.now() });
  return true;
}

export async function canEdit(slug: string, editToken: string): Promise<boolean> {
  const cur = await db().get(`store:${slug}`);
  return !!cur && cur.tokenHash === hash(editToken);
}

export async function track(slug: string, kind: "view" | "click", productId?: string) {
  await db().incr(kind === "view" ? `views:${slug}` : `clicks:${slug}:${productId}`);
}

export async function stats(slug: string, productIds: string[]) {
  const [views, ...clicks] = await db().mget([`views:${slug}`, ...productIds.map((id) => `clicks:${slug}:${id}`)]);
  return {
    views: views ?? 0,
    clicks: Object.fromEntries(productIds.map((id, i) => [id, clicks[i] ?? 0])),
  };
}
