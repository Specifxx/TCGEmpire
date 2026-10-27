"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { openFeedback } from "@/lib/feedback-open";
import { hasRated, rateAllowedOn } from "@/lib/rate-prompt";

// "RATE US" ON EVERY PAGE, IN THE PAGE (owner, 2026-10-27: "a clear button that
// you can click for feedback … somewhere along the page of every page … it
// should be able to give you a rating and you can write a review"). A quiet row
// at the end of the page's content, never a pop-up: tapping a star opens the
// rating panel (FeedbackWidget) with those stars picked. Gone for good in a
// browser that has rated (lib/rate-prompt.ts markRated), and never on the
// pages the corner card skips (sign-in, checkout, admin, embeds, the arcade).
// Client-only, so a crawler and a rater never see it. DECISIONS.md, "One
// feedback form, shown by default".
export function RateUsStrip() {
  const path = usePathname() ?? "/";
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(rateAllowedOn(path) && !hasRated());
    const onRated = () => setShow(rateAllowedOn(path) && !hasRated());
    window.addEventListener("rc:rated", onRated);
    return () => window.removeEventListener("rc:rated", onRated);
  }, [path]);

  if (!show) return null;
  return (
    <aside
      aria-label="Rate RiftCompare"
      data-rate-strip
      className="card-surface mt-10 flex flex-col items-center justify-between gap-3 px-5 py-4 text-center sm:flex-row sm:text-left"
    >
      <div>
        <p className="font-semibold text-white">How&apos;s RiftCompare working for you?</p>
        <p className="text-xs text-slate-400">Rate us and leave a review. No account needed.</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex" role="group" aria-label="Rate RiftCompare out of 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => openFeedback(n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              className="grid min-h-11 min-w-10 place-items-center text-3xl leading-none text-slate-600 transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold [&:has(~button:hover)]:text-gold"
            >
              ★
            </button>
          ))}
        </div>
        <button type="button" onClick={() => openFeedback()} className="btn-ghost whitespace-nowrap text-sm">
          Rate &amp; review
        </button>
      </div>
    </aside>
  );
}
