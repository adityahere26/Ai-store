import Image from "next/image";

/** Minute Store logo: app icon + wordmark ("Store" in italic serif, as in the brand logo). */
export function BrandMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/mark.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-[22%] ${className}`}
      priority
    />
  );
}

export function BrandLogo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="Minute Store">
      <BrandMark size={size} />
      <span className="font-semibold tracking-tight" aria-hidden>
        Minute <span className="font-serif-i text-[1.12em] font-normal">Store</span>
      </span>
    </span>
  );
}
