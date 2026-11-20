"use client";

import { useEffect } from "react";

/** Bottom sheet on phones, centred dialog on tablets, right-hand drawer on desktop (keeps the preview visible). */
export default function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-black/40 lg:bg-[#0f0a19]/25" onClick={onClose} />
      <div className="sheet-in relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-app-surface shadow-2xl sm:rounded-3xl lg:h-dvh lg:max-h-none lg:max-w-[460px] lg:rounded-none lg:rounded-l-3xl">
        <div className="flex items-center justify-between border-b border-app-line px-5 py-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-app-line sm:hidden absolute left-1/2 top-1.5 -translate-x-1/2" />
          <h2 className="pt-1 text-base font-semibold lg:text-lg">{title}</h2>
          <button onClick={onClose} className="-mr-2 grid h-10 w-10 place-items-center rounded-full text-xl text-app-muted hover:bg-app-bg" aria-label="Close">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-app-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}
