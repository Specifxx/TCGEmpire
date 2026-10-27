"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { track } from "@vercel/analytics";
import { Dialog } from "./ui/Dialog";
import { RatingReviewForm } from "./RatingReviewForm";
import { FEEDBACK_OPEN_EVENT } from "@/lib/feedback-open";

// The site-wide "Rate RiftCompare" panel.
//
// NEVER AUTO-OPENS AND HAS NO FLOATING BUTTON (2026-10-27, DECISIONS.md "One
// rating ask, earned by engagement"): a visitor said there were "too many
// pop-ups asking for my opinion". It opens only when asked for, through
// FEEDBACK_OPEN_EVENT: the footer's "Rate & review" link
// (FeedbackLink), the "Rate us" strip above the footer (RateUsStrip, which
// passes the stars picked there) and the homepage's reviews section.
//
// ITS BODY IS THE SAME FORM EVERY RATING SURFACE USES (RatingReviewForm,
// DECISIONS.md "One feedback form, shown by default"). It works signed out:
// the visitor most worth hearing from is the one who has no account.

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [initialRating, setInitialRating] = useState(0);
  // A fresh form for every opening (remounted by key).
  const [openCount, setOpenCount] = useState(0);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    const onOpen = (e: Event) => {
      const r = Number((e as CustomEvent<{ rating?: number }>).detail?.rating);
      setInitialRating(Number.isInteger(r) && r >= 1 && r <= 5 ? r : 0);
      setOpenCount((n) => n + 1);
      setOpen(true);
      track("feedback_open", { path: pathRef.current ?? "/" });
    };
    window.addEventListener(FEEDBACK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FEEDBACK_OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onClose={close} placement="sheet" size="md" z="sheet" labelledBy="rc-feedback-title" className="p-5">
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="tap-icon absolute right-2 top-2 shrink-0 rounded-lg text-slate-400 transition-colors hover:bg-ink-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
      >
        ✕
      </button>
      <h2 id="rc-feedback-title" className="pr-12 text-center font-display text-lg font-extrabold text-white">
        How would you rate RiftCompare?
      </h2>
      <p className="mb-3 mt-1 text-center text-sm text-slate-400">No account needed. We read every one.</p>
      <RatingReviewForm key={openCount} source="widget" page={pathname ?? "/"} initialRating={initialRating} />
    </Dialog>
  );
}
