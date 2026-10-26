// The trial's two knobs, in a module with NO database import so both the server
// libs (lib/premium.ts re-exports these and is what callers import) and pure
// content modules (lib/articles.ts) can read them.
//
// Trial length (days) for a first-time subscriber. DEFAULT 14 since 2026-10-12:
// a FREE 14-day trial (owner: "Yes just change the defaults in the code";
// DECISIONS.md, "A free 14-day trial replaces the $1 first month"). History: 14
// days from 2026-08-24, 3 days from 2026-09-24, none (0) from 2026-09-26 ("the
// price is not working"), 30 days for $1 from 2026-09-30, 14 days free from
// 2026-10-12. An explicit PREMIUM_TRIAL_DAYS in the environment
// still wins over this default, so a Vercel value left from an earlier era
// (3, 30 or 0) must be REMOVED for the 14-day default to take effect; setting
// it to 0 is the KILL SWITCH (no trial, no $1 line, checkout charges the plan
// price at once), and takes a redeploy because the value is read at build.
// Unset, blank or non-numeric means the default; only an explicit number counts.
// Card-gated: a card is required up front (payment_method_collection in the
// checkout route), so the trial auto-converts to paid unless cancelled.
export function parseTrialEnv(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}
// 30 days from 2026-10-23 (owner: "offer like one month free for premium
// instead of 14 days … that's more attractive"). Still free, still card-gated.
// 0 from 2026-10-26 (owner: "if Collector doesn't do a trial, then we don't do a
// trial"): Pro is bought straight, monthly or annual, like Collectr PRO.
export const PREMIUM_TRIAL_DAYS = parseTrialEnv(process.env.PREMIUM_TRIAL_DAYS, 0);
export function premiumTrialEnabled(): boolean {
  return PREMIUM_TRIAL_DAYS > 0;
}

// What the trial costs TODAY, in the smallest unit of the plan's currency (cents).
// DEFAULT 0 since 2026-10-12: a FREE trial. The $1 fee (the default from
// 2026-09-30) was refused by banks and Stripe Radar as a micro-charge: two of
// the seven trials started under it failed at payment (payment-failures-report).
// A value of 100 = $1: checkout adds a one-time $1.00 line beside the recurring plan
// and the trial makes the recurring line $0 on the first invoice, so the customer
// pays exactly this at checkout and the plan price starts after the trial.
// PREMIUM_TRIAL_FEE_CENTS=0 makes it a genuinely FREE trial (no one-time line, and
// every copy helper in lib/site.ts then says "free" instead of "$1"). Stripe
// refuses a charge under its minimum (US$0.50), so a value between 1 and 49
// falls back to the default rather than breaking every checkout. Also read at
// build; /api/me's `trialFeeCents` carries it to client components.
const TRIAL_FEE_MIN_CHARGE_CENTS = 50;
export function parseTrialFeeCents(raw: string | undefined): number {
  const n = parseTrialEnv(raw, 0);
  return n > 0 && n < TRIAL_FEE_MIN_CHARGE_CENTS ? 100 : n;
}
export const PREMIUM_TRIAL_FEE_CENTS = parseTrialFeeCents(process.env.PREMIUM_TRIAL_FEE_CENTS);
