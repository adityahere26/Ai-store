/**
 * Web search via Tavily (free tier: 1,000 searches/month, no card).
 * Used to find real, published lists of creators in a niche, so creator
 * suggestions come from actual web pages with sources, not model memory.
 * Returns [] on any problem; callers fall back gracefully.
 */

export interface WebSource {
  id: number;
  title: string;
  url: string;
  domain: string;
  content: string;
}

export async function webSearch(query: string, opts: { maxResults?: number; timeoutMs?: number; excludeDomains?: string[] } = {}): Promise<WebSource[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 7000);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query,
        search_depth: "basic", // 1 credit
        max_results: opts.maxResults ?? 8,
        include_answer: false,
        exclude_domains: opts.excludeDomains ?? [],
      }),
    });
    if (!res.ok) {
      console.warn(`[web] search failed: HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (data.results ?? [])
      .filter((r) => r.url && r.content)
      .map((r, i) => {
        let domain = "";
        try {
          domain = new URL(r.url!).hostname.replace(/^www\./, "");
        } catch {}
        return {
          id: i + 1,
          title: (r.title ?? domain).slice(0, 140),
          url: r.url!,
          domain,
          // Some list sites escape underscores in handles ("abc\_def"); undo that.
          content: (r.content ?? "").replace(/\\_/g, "_").replace(/\s+/g, " ").slice(0, 1500),
        };
      });
  } catch (e) {
    console.warn(`[web] search error: ${ctrl.signal.aborted ? "timeout" : (e as Error).message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
