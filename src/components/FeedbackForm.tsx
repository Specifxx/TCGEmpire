"use client";

import { useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/use-me";
import { TIER_NAMES } from "@/lib/site";
import { RatingReviewForm } from "./RatingReviewForm";

// The /feedback page's form: the same rating-and-review form as every other
// rating surface (RatingReviewForm, DECISIONS.md "One feedback form, shown by
// default"), plus the page's own sign-in reward note. It never gates on
// sign-in: the reward is an incentive shown beside a working form.
export function FeedbackForm({ days }: { days: number }) {
  const { user, premium, tier } = useMe();
  const rewardName = TIER_NAMES[tier ?? "premium"];
  const dayLabel = `${days} day${days === 1 ? "" : "s"}`;
  const [granted, setGranted] = useState<boolean | null>(null);

  return (
    <div className="card-surface p-6">
      <RatingReviewForm
        source="page"
        page="/feedback"
        onDone={(r) => setGranted(r.granted)}
        footer={
          <>
            {days > 0 && !user && (
              <p className="text-center text-xs text-slate-500">
                No account needed. If you{" "}
                <Link href="/login?next=/feedback&src=feedback" className="text-brand-400 hover:underline">
                  sign in first
                </Link>
                , your first feedback also unlocks <strong className="text-gold">{dayLabel} of Pro</strong>.
              </p>
            )}
            {days > 0 && user && !premium && (
              <p className="text-center text-xs text-slate-500">
                Your first feedback unlocks <strong className="text-gold">{dayLabel} of Pro</strong>, one per account.
              </p>
            )}
          </>
        }
      />
      {granted && <p className="mt-3 text-center text-sm font-semibold text-gold">Your {dayLabel} of {rewardName} is now active.</p>}
    </div>
  );
}
