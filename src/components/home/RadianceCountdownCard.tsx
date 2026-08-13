import Link from "next/link";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { SITE_NAME } from "@/lib/site";
import type { SetInfo } from "@/lib/constants";

// New-set hype card. Named for Radiance (the set this ships for), but sourced
// generically via lib/constants.ts's nextUpcomingSet() rather than hard-coded —
// the same "point at the next one without naming it" pattern newestReleasedSet()
// already uses for the Explore section's gallery link. So this rolls from
// Radiance to Legacy on its own once Radiance ships, with no edit here.
//
// Server component, server-computed countdown (no client timer): the homepage
// is ISR-cached, so the day count in the crawled HTML and the day count a
// visitor sees before any JS runs must be the same number — exactly the
// reasoning /radiance-countdown's own page documents for its countdown.
export function RadianceCountdownCard({ set }: { set: SetInfo | undefined }) {
  if (!set) return null; // nothing upcoming and announced — nothing to promote

  const releaseMs = set.releasedOn ? Date.parse(`${set.releasedOn}T00:00:00Z`) : NaN;
  const hasDate = !Number.isNaN(releaseMs);
  const days = hasDate ? Math.max(0, Math.ceil((releaseMs - Date.now()) / 86_400_000)) : null;
  if (days === 0) return null; // released — Explore's "New" tile covers it now

  const releaseLabel = hasDate
    ? new Date(releaseMs).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;

  return (
    <section className="card-surface flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <span className="chip inline-flex bg-brand-500/15 text-[11px] font-bold uppercase tracking-wider text-brand-300">
          {set.name} is coming
        </span>
        <h2 className="mt-2 text-xl font-extrabold text-white">
          {hasDate ? `${set.name} releases ${releaseLabel}` : `${set.name} is on the way`}
        </h2>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-400">
          {set.totalCards ? `Around ${set.totalCards} cards. ` : ""}
          RiftCompare will compare every card&apos;s price across every store we track from the day it lands.
        </p>

        {/* No fabricated date: a set that's announced but not yet dated shows a
            plain "release window" line instead of a countdown built on a guess. */}
        {hasDate ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="num text-4xl font-extrabold leading-none text-brand-300">{days}</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {days === 1 ? "day to go" : "days to go"}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Release window: not yet announced</p>
        )}

        <Link href="/radiance-countdown" className="mt-3 inline-block text-sm font-semibold text-brand-300 underline-offset-2 hover:underline">
          Full release details →
        </Link>
      </div>

      <div className="w-full shrink-0 sm:max-w-xs">
        <NewsletterSignup
          siteName={SITE_NAME}
          source="countdown"
          variant="card"
          heading={`🔔 Know the moment ${set.name} prices go live`}
          cta="Notify me"
          done="✓ You're set — we'll email you when it lands."
          trackEvent="radiance_notify_click"
        />
      </div>
    </section>
  );
}
