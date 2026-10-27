"use client";

import { openFeedback } from "@/lib/feedback-open";

// The footer's "Rate & review" link: the passive, always-there way in
// to the feedback panel now that it has no floating button (2026-10-27,
// DECISIONS.md "One rating ask, earned by engagement"). A button, not a link:
// it opens FeedbackWidget's panel in place.
export function FeedbackLink({ className, children = "Rate & review" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => openFeedback()} className={className}>
      {children}
    </button>
  );
}
