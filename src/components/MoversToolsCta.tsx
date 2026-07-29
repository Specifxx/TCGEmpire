"use client";

import Link from "next/link";
import { usePremium } from "@/components/PremiumProvider";
import { PremiumButton } from "@/components/PremiumButton";

// Client island for the (static, ISR) /movers page: turns its habitual price-checkers
// into the mouth of the Premium funnel. Non-members see a teaser + upgrade; members
// see quick links to the pro tools. Kept client-side so /movers stays fully cacheable.
export function MoversToolsCta() {
  const premium = usePremium();

  if (premium) {
    return (
      <section className="card-surface p-5">
        <h2 className="text-lg font-bold text-white">Your deal tools</h2>
        <p className="mt-1 text-sm text-slate-400">You&apos;re Premium — the full screeners are unlocked.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/tools/value-finder" className="btn-primary text-sm">Value Finder →</Link>
          <Link href="/tools/deal-finder" className="btn-ghost text-sm">Deal Finder →</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="card-surface relative overflow-hidden p-5">
      <span className="chip absolute right-4 top-4 bg-gold/20 text-gold">Premium</span>
      <h2 className="text-lg font-bold text-white">For keen buyers &amp; sellers</h2>
      <p className="mt-1 max-w-xl text-sm text-slate-400">
        Movers show what already moved. Premium shows what&apos;s <strong className="text-slate-200">about to</strong>:
        the <strong className="text-slate-200">Value Finder</strong> screens every card trading below its 30-day
        average, and the <strong className="text-slate-200">Deal Finder</strong> lists cards that are cheaper in
        one place than another (and worth more on eBay if you&apos;re selling) — the full lists, ranked.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PremiumButton />
        <Link href="/tools/value-finder" className="btn-ghost text-sm">Preview Value Finder →</Link>
        <Link href="/tools/deal-finder" className="btn-ghost text-sm">Preview Deal Finder →</Link>
      </div>
    </section>
  );
}
