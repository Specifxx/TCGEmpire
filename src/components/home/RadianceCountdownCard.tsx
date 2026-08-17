import Link from "next/link";
import type { SetInfo } from "@/lib/constants";

// New-set hype line. Named for Radiance (the set this ships for), but sourced
// generically via lib/constants.ts's nextUpcomingSet() rather than hard-coded —
// the same "point at the next one without naming it" pattern newestReleasedSet()
// already uses for the Explore section's gallery link. So this rolls from
// Radiance to Legacy on its own once Radiance ships, with no edit here.
//
// Rebuilt per the homepage-redesign brief from a full-width card (its own
// heading, its own countdown digit, its own newsletter capture) into ONE line
// that folds into the "Explore by set" section instead of standing as its own
// homepage block — Radiance already gets a disabled "Coming soon" tile in that
// same section's grid, so this is the one extra fact (how soon) that tile
// can't say on its own. The newsletter capture is gone entirely: the brief
// wants exactly one capture, footer-only — /radiance-countdown's own page
// still carries the full release-hype treatment (and its own capture) for
// anyone who clicks through wanting more.
//
// Still server-computed (no client timer): the homepage is ISR-cached, so the
// day count in the crawled HTML and the day count a visitor sees before any JS
// runs must be the same number — exactly the reasoning /radiance-countdown's
// own page documents for its countdown.
export function RadianceCountdownCard({ set }: { set: SetInfo | undefined }) {
  if (!set) return null; // nothing upcoming and announced — nothing to promote

  const releaseMs = set.releasedOn ? Date.parse(`${set.releasedOn}T00:00:00Z`) : NaN;
  const hasDate = !Number.isNaN(releaseMs);
  const days = hasDate ? Math.max(0, Math.ceil((releaseMs - Date.now()) / 86_400_000)) : null;
  if (days === 0) return null; // released — Explore's "New" tile covers it now

  return (
    <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-slate-400">
      <span className="chip bg-brand-500/15 text-[11px] font-bold uppercase tracking-wider text-brand-300">
        {set.name} is coming
      </span>
      <span>
        {hasDate ? (
          <>
            <span className="num font-bold text-white">{days}</span> {days === 1 ? "day" : "days"} to go —{" "}
          </>
        ) : (
          "Release window not yet announced. "
        )}
        <Link href="/radiance-countdown" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
          Full release details →
        </Link>
      </span>
    </p>
  );
}
