// THE PREMIUM "START" STEP — one contract, shared by the page, both CTAs and the
// checkout route.
//
// WHY THIS FILE EXISTS: sign-in used to be a GATE IN FRONT OF checkout. A
// signed-out visitor clicking "Get Premium" went to /login?next=/premium, signed
// in, landed back on /premium and had to FIND THE BUTTON AGAIN — five clicks to
// reach Stripe, six from a tool blur-wall (which also lost the tool they were on,
// since the dialog's link hardcoded next=/premium). Now the provider buttons are
// rendered ON the start step itself: the OAuth round trip returns to
// /premium/start with the same tier/plan selection, and a launcher takes it
// straight to Stripe. Three clicks, and `back` carries them home afterwards.
//
// NO SERVER IMPORTS ON PURPOSE. PremiumCta and PremiumDialog are client
// components, so everything here must be bundle-safe: `parseCheckoutSelection`
// takes `plusEnabled` as an ARGUMENT rather than calling premiumPlusEnabled()
// (which lives in lib/premium.ts alongside prisma). The one parsing rule still
// lives here, and both the start page and the checkout route feed it the same
// flag — see api/premium/checkout/route.ts.
import { sanitizeNextPath } from "./next-param";
import type { PremiumTierKey } from "./site";

export const PREMIUM_START_PATH = "/premium/start";
export const PREMIUM_WELCOME_PATH = "/premium/welcome";

/** Which surface sent the visitor into the start step (analytics only). */
export type StartSrc = "premium-page" | "dialog";

export function parseStartSrc(v: unknown): StartSrc {
  return v === "dialog" ? "dialog" : "premium-page";
}

/**
 * What is being bought — the SAME rules the checkout route applies, so the page
 * that renders the price and the route that charges for it can never disagree.
 * Plus is only sellable when its Stripe price is configured; annual falls back
 * to monthly inside priceIdFor() when the annual price is unset.
 */
export function parseCheckoutSelection(
  tierRaw: unknown,
  planRaw: unknown,
  plusEnabled: boolean
): { tier: PremiumTierKey; plan: "monthly" | "annual" } {
  return {
    tier: tierRaw === "plus" && plusEnabled ? "plus" : "premium",
    plan: planRaw === "annual" ? "annual" : "monthly",
  };
}

/**
 * Where to send someone after checkout (or after they cancel at Stripe).
 *
 * `sanitizeNextPath` already enforces "same-origin absolute path, never
 * protocol-relative, never /api" — this adds the LOOP GUARDS that only matter
 * here: a `back` pointing at the start step, the welcome page or /login would
 * bounce a paying customer around the funnel instead of returning them to the
 * deck/card page they were reading.
 */
export function sanitizeBackPath(v: string | null | undefined): string | null {
  const p = sanitizeNextPath(v);
  if (!p) return null;
  if (p === PREMIUM_START_PATH || p.startsWith(`${PREMIUM_START_PATH}?`)) return null;
  if (p === PREMIUM_WELCOME_PATH || p.startsWith(`${PREMIUM_WELCOME_PATH}?`)) return null;
  if (p === "/login" || p.startsWith("/login?")) return null;
  return p;
}

/** The start-step URL for a chosen tier/plan. `back` is sanitized by the page. */
export function premiumStartHref(o: {
  tier: PremiumTierKey;
  plan: "monthly" | "annual";
  back?: string | null;
  src: StartSrc;
}): string {
  const q = new URLSearchParams({ tier: o.tier, plan: o.plan, src: o.src });
  const back = sanitizeBackPath(o.back);
  if (back) q.set("back", back);
  return `${PREMIUM_START_PATH}?${q.toString()}`;
}
