import type { Metadata } from "next";
import Link from "next/link";
import StorefrontView from "@/components/StorefrontView";
import { DEMO_STOREFRONT } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Sample store · Minute Store",
  description: "An example of a store made with Minute Store.",
};

export default function DemoPage() {
  return (
    <div className="theme-classic min-h-dvh bg-sf-bg">
      <div className="sticky top-0 z-30 bg-app-night px-4 py-2.5 text-center text-[13.5px] text-white">
        <span className="text-white/75">This is a sample store made with Minute Store.</span>{" "}
        <Link href="/create" className="font-semibold text-[#cfe6ff] underline-offset-2 hover:underline">
          Build yours in a minute →
        </Link>
      </div>
      <StorefrontView storefront={DEMO_STOREFRONT} mode="public" />
    </div>
  );
}
