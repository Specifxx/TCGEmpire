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

export interface PromoGateInput {
  /** Page views in this session, including the current one. */
  views: number;
  /** Visible time on the current page, in ms. */
  engagedMs: number;
  /** The session's entry page was reached from another site. */
  externalEntry: boolean;
  /** Phone-width viewport. */
  mobile: boolean;
}

export function signupPromoEligible({ views, engagedMs, externalEntry, mobile }: PromoGateInput): boolean {
  if (views >= 2) return true;
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
