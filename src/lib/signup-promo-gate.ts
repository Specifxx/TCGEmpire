// When the signed-out "Create a free account" slide-in may appear at all.
// DECISIONS.md, "First visit from Reddit/Discord: no sign-up prompt on the
// first page", 2026-09-24.
//
// It used to show NUDGE_DELAY_MS (5 s) into ANY page view, the first one
// included — so a visitor arriving from a Reddit or Discord link met an
// account prompt before they had seen what the site is. The rule now:
//   - after the 2nd page view in the session, OR after 60 s of engagement
//     (visible time on the page), and
//   - never on the first page view of a visit that came from another site,
//   - never on a phone's first page view (Google's intrusive-interstitial
//     guidance is about exactly that screen).
// NUDGE_DELAY_MS still applies on top, as the settle-in delay once eligible.
// Pure, so tests pin every branch.

export const ENGAGED_MS = 60_000;

// TOP LANDING PAGES (2026-09-27, owner request). Blog posts and /movers are
// where search traffic lands, and most of those visits are one page from
// another site, so the rules above meant the prompt essentially never showed
// there. On these pages 20 s of visible reading is enough, even on a first
// external or phone view: the visitor has already read the page, which is
// what the first-visit rule was protecting.
export const LANDING_ENGAGED_MS = 20_000;
const LANDING_PREFIXES = ["/blog/", "/movers"];

export function isLandingPage(pathname: string | null | undefined): boolean {
  return !!pathname && LANDING_PREFIXES.some((p) => pathname.startsWith(p));
}

export interface PromoGateInput {
  /** Page views in this session, including the current one. */
  views: number;
  /** Visible time on the current page, in ms. */
  engagedMs: number;
  /** The session's entry page was reached from another site. */
  externalEntry: boolean;
  /** Phone-width viewport. */
  mobile: boolean;
  /** One of the top landing pages (isLandingPage). */
  landing?: boolean;
}

export function signupPromoEligible({ views, engagedMs, externalEntry, mobile, landing }: PromoGateInput): boolean {
  if (views >= 2) return true;
  if (landing) return engagedMs >= LANDING_ENGAGED_MS;
  // First page view of the session.
  if (externalEntry || mobile) return false;
  return engagedMs >= ENGAGED_MS;
}

/** Was the referrer another site? An empty referrer (typed URL, app link) is not. */
export function isExternalReferrer(referrer: string, host: string): boolean {
  if (!referrer) return false;
  try {
    return new URL(referrer).host !== host;
  } catch {
    return false;
  }
}
