import Link from "next/link";
import { BrandMark } from "@/components/Brand";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-app-night px-6 text-center text-white">
      <div className="mx-auto max-w-md">
        <BrandMark size={72} className="mx-auto" />
        <h1 className="tight mt-5 text-[34px] leading-[1.05] font-medium">
          This store <span className="font-serif-i text-[38px] text-[#cfe6ff]">doesn&apos;t exist yet.</span>
        </h1>
        <p className="mt-3 text-white/70">The link may be mistyped, or the creator hasn&apos;t published it.</p>
        <Link href="/create" className="mt-8 grid min-h-14 place-items-center rounded-full bg-app-accent font-semibold text-white">
          Build your own store in a minute ✨
        </Link>
      </div>
    </main>
  );
}
