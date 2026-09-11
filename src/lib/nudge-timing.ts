/**
 * HOW LONG A CORNER NUDGE WAITS BEFORE IT SLIDES IN. One number, read by all
 * three of them, so they can never drift apart again:
 *
 *   SignupPromoPopup   the signed-out "make an account / Premium" pitch
 *   PremiumSlideIn     the signed-in free-account Premium nudge
 *   AnnualSwitchNudge  the monthly-subscriber "switch to annual" offer
 *
 * They had three different answers — instant, 12s and 8s — each arrived at by
 * its own separate decision, with nothing connecting them. A visitor never
 * experiences "the signup popup" or "the premium slide-in"; they experience
 * things appearing in the corner of the page, and those should feel like one
 * system behaving consistently.
 *
 * FIVE SECONDS, set 2026-09-11 at the owner's explicit instruction: every
 * slider shows five seconds after the page opens, rather than instantly.
 *
 * WHAT THE HISTORY SAYS, because this number has been fought over before and
 * the next person to touch it deserves the evidence rather than a bare value.
 * SignupPromoPopup ran a 5s delay once and it measurably cost the site: bounce
 * rose, pages/visitor fell, buy_click fell, and 78% of visitors dismissed it
 * outright. That is what drove the buy-click-aware timing that replaced it, and
 * then the instant show (2026-09-01) that replaced THAT. So this value is a
 * deliberate re-test of a thing that has failed once, not a fresh idea — the
 * metrics to read are signup_promo_shown/_dismissed, sign_up, buy_click and
 * pages/visitor, and the popup's PROMO_VARIANT was renamed alongside this so
 * GA4 can separate before from after instead of averaging them together.
 *
 * A delay is NOT the same as a frequency cap. Each nudge keeps its own
 * eligibility rules, pageview gates, dismissal counts and snoozes — this only
 * says how long after the page opens an already-eligible nudge appears. Nothing
 * here makes a nudge show to someone it would not otherwise have shown to.
 */
export const NUDGE_DELAY_MS = 5_000;
