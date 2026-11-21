"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Watch the film" button + full-screen player.
 * Nothing is downloaded until someone presses play, so the landing page stays fast.
 * Phones held upright get the vertical (9:16) cut; everything else gets 16:9.
 */
export default function FilmButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [vertical, setVertical] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    video.current?.play().catch(() => {}); // user just clicked, so sound is allowed
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setVertical(window.innerHeight > window.innerWidth && window.innerWidth < 768);
          setOpen(true);
        }}
        className={`group inline-flex min-h-14 items-center justify-center gap-3 rounded-full border border-white/20 pr-6 pl-2 text-[16px] font-semibold text-white transition hover:bg-white/10 ${className}`}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-app-ink transition group-hover:scale-105" aria-hidden>
          <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4 fill-current">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
          </svg>
        </span>
        Watch the film <span className="font-normal text-white/60">· 43s</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Minute Store launch film">
          <button aria-label="Close film" className="absolute inset-0 cursor-default" onClick={() => setOpen(false)} />
          <div className={`relative w-full ${vertical ? "max-w-[min(420px,calc((100dvh-90px)*9/16))]" : "max-w-[min(1200px,calc((100dvh-110px)*16/9))]"}`}>
            <video
              ref={video}
              className={`w-full rounded-2xl bg-black shadow-2xl ${vertical ? "aspect-[9/16]" : "aspect-video"}`}
              src={vertical ? "/media/minute-store-film-vertical.mp4" : "/media/minute-store-film.mp4"}
              poster={vertical ? undefined : "/media/minute-store-film-poster.jpg"}
              controls
              playsInline
              preload="none"
              crossOrigin="anonymous"
            >
              <track kind="captions" srcLang="en" label="English" src="/media/minute-store-film.en.vtt" default />
            </video>
            <button
              onClick={() => setOpen(false)}
              className="absolute -top-12 right-0 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20"
              aria-label="Close film"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}
