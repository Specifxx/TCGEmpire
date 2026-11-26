// The Premium price ladder test (owner, 2026-11-26: "Yes, run all three tests" on the Premium pricing reset; DECISIONS.md
// "2026-11-26: A Week Pass and a Founder Lifetime, as a test on the sister sites' Premium pages").
//
// From 7 Dec to 21 Dec 2026 (00:00 UTC), signed-in members on a sister site's /premium page are split by account id. Arm
// "b" is offered, beside the usual subscription, two ONE-OFF purchases:
//   - Week Pass, US$2.99: every Premium feature for 7 days, then it stops. No renewal, nothing to cancel.
//   - Founder Lifetime, US$99: Premium for good, the first 100 members only, accounts at least 14 days old.
// Arm "a" sees today's page. Existing subscribers are never offered either and never re-priced.
//
// HARD CONSTANTS, NOT ENV: amounts and dates live here, so no leftover variable can keep selling after the window.
// Stripe charges these through inline price_data in a one-off ("payment") Checkout: no Price object to create, no
// owner step. Entitlement is premiumUntil, extend-only, written by the webhook (lib/premium-pass-server.ts).
//
// Pure: tests and routes import it; the database half is lib/premium-pass-server.ts.

export type PassKind = "week" | "founder";

export const PASS_TEST = {
  key: "pl1",
  start: Date.UTC(2026, 11, 7), // 7 Dec 2026 00:00 UTC
  end: Date.UTC(2026, 11, 21), // 21 Dec 2026 00:00 UTC
  readOn: Date.UTC(2027, 0, 4),
} as const;

export const PASSES: Record<PassKind, { cents: number; label: string; name: string; days: number | null }> = {
  week: { cents: 299, label: "US$2.99", name: "Premium Week Pass", days: 7 },
  // Lifetime is a date a century away, so every read that compares premiumUntil keeps working unchanged.
  founder: { cents: 9900, label: "US$99", name: "Premium Founder Lifetime", days: null },
};

export const FOUNDER_SEATS = 100;
export const FOUNDER_MIN_ACCOUNT_DAYS = 14;
export const LIFETIME_UNTIL = Date.UTC(2126, 0, 1);
export const FOUNDER_SOLD_KEY = "pass:founder:sold";

export function passTestOpen(now: number = Date.now()): boolean {
  return now >= PASS_TEST.start && now < PASS_TEST.end;
}

/** FNV-1a with the test's own salt, so this split is independent of the free-week split. */
export function passArm(userId: string): "a" | "b" {
  const s = `${PASS_TEST.key}:${userId}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 2 === 0 ? "a" : "b";
}

export function parsePassKind(v: unknown): PassKind | null {
  return v === "week" || v === "founder" ? v : null;
}

export interface PassOffer {
  kind: PassKind;
  label: string;
  /** Founder seats left, for the live count; null for the Week Pass. */
  left: number | null;
}

/**
 * What a member may be offered right now. `entitledByPayment` means a Stripe subscription or an earlier pass holds
 * their Premium (a free week does not count: those members may buy). Founder needs an account at least 14 days old
 * and a seat left.
 */
export function passOffersFor(o: {
  userId: string;
  createdAt: number;
  entitledByPayment: boolean;
  founderSold: number;
  now?: number;
}): PassOffer[] {
  const now = o.now ?? Date.now();
  if (!passTestOpen(now) || passArm(o.userId) !== "b" || o.entitledByPayment) return [];
  const out: PassOffer[] = [{ kind: "week", label: PASSES.week.label, left: null }];
  const left = Math.max(0, FOUNDER_SEATS - o.founderSold);
  if (left > 0 && now - o.createdAt >= FOUNDER_MIN_ACCOUNT_DAYS * 86_400_000) out.push({ kind: "founder", label: PASSES.founder.label, left });
  return out;
}

/** The premiumUntil a pass gives, extend-only: a Week Pass adds 7 days to whatever is later, now or the current date. */
export function passUntil(kind: PassKind, now: number, currentUntil: number | null): number {
  if (kind === "founder") return Math.max(LIFETIME_UNTIL, currentUntil ?? 0);
  const base = currentUntil !== null && currentUntil > now ? currentUntil : now;
  return base + (PASSES.week.days as number) * 86_400_000;
}
