import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import PublicStore from "./PublicStore";

// The page *is* the creator's data (one Redis read), so a streamed placeholder adds
// nothing, and link-preview crawlers (WhatsApp, Instagram) need full HTML + meta tags
// in one response. So this route intentionally blocks instead of streaming a shell.
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const s = await getStore(slug).catch(() => null);
  if (!s) return { title: "Store not found" };
  const title = `${s.displayName}${s.niche ? ` · ${s.niche}` : ""}`;
  return { title, description: s.tagline || s.bio.slice(0, 150), openGraph: { title, description: s.tagline || s.bio.slice(0, 150) } };
}

export default async function StorePage({ params }: PageProps<"/s/[slug]">) {
  const { slug } = await params;
  const s = await getStore(slug).catch(() => null);
  if (!s) notFound();
  return <PublicStore storefront={s} slug={slug} />;
}
