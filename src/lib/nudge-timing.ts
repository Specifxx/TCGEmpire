/**
 * HOW LONG A CORNER NUDGE WAITS BEFORE IT SLIDES IN. One number, read by all
 * three of them, so they can never drift apart again:
 *
 *   SignupPromoPopup   the signed-out "make a free account" pitch
 *   PremiumSlideIn     the signed-in free-account Premium nudge (removed
 *                      2026-09-28, restored 2026-09-29)
 *   AnnualSwitchNudge  the monthly-subscriber "switch to annual" offer
 *
 * They had three different answers — instant, 12s and 8s — each arrived at by
 * its own separate decision, with nothing connecting them. A visitor never
 * experiences "the signup popup" or "the premium slide-in"; they experience
 * things appearing in the corner of the page, and those should feel like one
 * system behaving consistently.
 *
 * ZERO — INSTANT — since 2026-09-29, at the owner's explicit instruction:
 * "make the sign up and premium slider instant. I want to bring the instant
 * feature back." It was FIVE SECONDS from 2026-09-11 (also the owner's call:
 * "every slider shows five seconds after the page opens, rather than
 * instantly"). Instant means no wait once a nudge is ELIGIBLE; the eligibility
 * rules themselves are unchanged, by the owner's choice the same day: the
 * sign-up popup still skips a visit's first page from another site or on a
 * phone (lib/signup-promo-gate.ts), the Premium slider still waits for a second
 * page view, and on the top landing pages both still wait for 7 s of reading
 * (LANDING_ENGAGED_MS).
 *
 * WHAT THE HISTORY SAYS, because this number has been fought over before and
 * the next person to touch it deserves the evidence rather than a bare value.
 * SignupPromoPopup ran a 5s delay once and it measurably cost the site: bounce
 * rose, pages/visitor fell, buy_click fell, and 78% of visitors dismissed it
 * outright. That is what drove the buy-click-aware timing that replaced it, and
 * then the instant show (2026-09-01) that replaced THAT; 2026-09-11 went back
 * to five seconds, and 2026-09-29 back to instant. The metrics to read are
 * signup_promo_shown/_dismissed, premium_slidein_shown/_dismissed/_click,
 * sign_up, buy_click and pages/visitor, and the popup's PROMO_VARIANT is
 * renamed with every change here so GA4 can separate before from after
 * instead of averaging them together.
 *
 * A delay is NOT the same as a frequency cap. Each nudge keeps its own
 * eligibility rules, pageview gates, dismissal counts and snoozes — this only
 * says how long after the page opens an already-eligible nudge appears. Nothing
 * here makes a nudge show to someone it would not otherwise have shown to.
 */
export const NUDGE_DELAY_MS = 0;

/**
 * HOW OFTEN A CORNER NUDGE MAY COME BACK, and when it must stop asking.
 *
 * Added 2026-09-14. `PremiumSlideIn` had all three of these as local constants
 * and `SignupPromoPopup` had NONE of them — no lifetime cap at all, a fact its
 * own header admitted. It returned every few pages after every dismissal
 * forever, and because its counters were sessionStorage, a new tab wiped even
 * that and the visitor was asked again on their very first page. Someone could
 * decline it indefinitely and keep being asked, which is what makes a ✕
 * reflexive rather than considered.
 *
 * THE ASK THAT PRODUCED THIS WAS THE OPPOSITE ONE: make the dismiss button wait
 * five seconds before it works. That was declined on three specific grounds and
 * the owner chose this instead. Recording them, because the idea will come back:
 *
 *   1. A forced wait before dismissal is the pattern the Better Ads Standards
 *      name directly ("ads with countdown"). docs/adsense-remediation.md
 *      already cites the Better Ads Standards half of Google's Publisher
 *      Policies as a live constraint on this site, and AdSense is part of its
 *      revenue.
 *   2. Six tests already forbid countdown pressure on Premium surfaces. A close
 *      button that does not close is the same category of thing.
 *   3. The dismiss rate is already 78%. A locked ✕ does not convert a dismissal
 *      into a read; it converts it into a back-button exit. This popup has
 *      already cost one production incident by being hard to close on a short
 *      phone.
 *
 * Capping frequency attacks the same problem from the honest end: fewer
 * impressions, each landing on someone who has not already said no. The numbers
 * below are PremiumSlideIn's, which have been in production since 2026-08-27 —
 * this is the popup adopting its sibling's proven shape, not a new experiment.
 *
 * A CTA click snoozes WITHOUT burning a strike: engaging with an offer is not
 * refusing it, and someone who signed in and came back should not be two
 * dismissals from silence.
 */
export const MAX_NUDGE_DISMISSALS = 2;
export const SNOOZE_AFTER_DISMISS_MS = 7 * 864e5; // 7 days
export const SNOOZE_AFTER_CLICK_MS = 14 * 864e5; // 14 days
