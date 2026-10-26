// The Stores plan (2026-10-23, DECISIONS.md "The Stores plan"): a self-serve
// US$79.99/month subscription for Riftbound retailers. What it buys is the
// private repricing report (/stores/report), the "what buyers are searching for"
// section in it, a "Verified store" mark with the store's own description and
// promo on its /stores/<slug> page, and Premium for the buyer's account.
//
// WHAT IT NEVER BUYS: a place in any comparison. Card pages, Best Basket, the
// store lists and every other ranking sort on price (and postage) only; nothing
// a store pays for is read by any of them. The sales page says so in as many
// words, and the Verified mark is shown on the store's own page only.
//
// PURE: no prisma, no stripe, no next imports, so tests/store-plan.test.ts runs
// every rule here directly. The database side is lib/store-plan-db.ts.

export const STORE_PLAN_PRICE_ID = process.env.STRIPE_STORE_PRICE_ID ?? "";

/** What the sales page shows. The checkout refuses a Stripe Price dearer than this. */
export const STORE_PLAN_AMOUNT = process.env.NEXT_PUBLIC_STORE_PLAN_AMOUNT || "$79.99";
export const STORE_PLAN_CURRENCY = "usd";
export const STORE_PLAN_INTERVAL = "month";

/** Days a lapsed plan keeps its report and Verified mark (a retried renewal, a late webhook). */
export const STORE_PLAN_GRACE_DAYS = 3;

/** Hours a paid, unlinked plan may wait before the ops monitor says so (ops check stores:unlinked). */
export const STORE_PLAN_LINK_SLA_HOURS = 48;

export function storePlanEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean((env.STRIPE_SECRET_KEY ?? "").trim() && (env.STRIPE_STORE_PRICE_ID ?? "").trim());
}

export const STORE_PLAN_FEATURES: { title: string; body: string }[] = [
  {
    title: "Live repricing report",
    body: "Every in-stock single you list against the cheapest rival in your market: where you're beaten and by how much, where you're cheapest by a wide margin, and your win rate. Updated with every price import.",
  },
  {
    title: "What buyers are searching for",
    body: "The cards shoppers searched for most this week, and for each one whether you have it in stock and how your price sits against the market's cheapest.",
  },
  {
    title: "Verified store mark",
    body: "A \"Verified store\" mark on your RiftCompare store page, with your own short description and a promo line in your words.",
  },
  {
    title: "Pro included",
    body: "RiftCompare Pro for the account that subscribes, for as long as the plan runs.",
  },
];

// ── Money ────────────────────────────────────────────────────────────────────

/** "$79.99" / "US$79.99" / "79.99" → 7999. Null when the label holds no price. */
export function amountCents(label: string): number | null {
  const m = label.replace(/,/g, "").match(/(\d+)(?:\.(\d{1,2}))?/);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

/**
 * NEVER CHARGE MORE THAN THE PAGE SAYS. The checkout reads the Stripe Price
 * before opening a session and refuses (503, logged) unless it is a recurring
 * monthly USD price whose unit amount is at most the displayed amount. A Price
 * edited in the Stripe dashboard, or STRIPE_STORE_PRICE_ID pointed at the wrong
 * Price, then fails closed instead of billing a store a number it never saw.
 * Returns the problem in words, or null when the Price is safe to sell.
 */
export function storePriceProblem(price: unknown, displayedCents: number | null): string | null {
  if (displayedCents == null) return `the displayed amount "${STORE_PLAN_AMOUNT}" is not a price`;
  const p = price && typeof price === "object" ? (price as Record<string, unknown>) : null;
  if (!p) return "no price";
  if (p.active === false) return "the price is archived";
  const recurring = p.recurring && typeof p.recurring === "object" ? (p.recurring as Record<string, unknown>) : null;
  if (!recurring) return "the price is not recurring";
  if (recurring.interval !== STORE_PLAN_INTERVAL || (recurring.interval_count ?? 1) !== 1) {
    return `the price bills every ${recurring.interval_count ?? 1} ${String(recurring.interval)}, not monthly`;
  }
  if (typeof p.currency !== "string" || p.currency.toLowerCase() !== STORE_PLAN_CURRENCY) {
    return `the price is in ${String(p.currency)}, not USD`;
  }
  const unit = typeof p.unit_amount === "number" ? p.unit_amount : null;
  if (unit == null) return "the price has no fixed unit amount";
  if (unit > displayedCents) return `the price is ${unit} cents but the page says ${displayedCents}`;
  return null;
}

// ── What a store types ──────────────────────────────────────────────────────

export type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

// Control characters (incl. newlines) collapse to spaces: everything here is one
// line of plain text, rendered escaped by React and never as HTML.
const clean = (v: unknown): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim() : "";

export function validateStoreName(v: unknown): Valid<string> {
  const s = clean(v);
  if (s.length < 2 || s.length > 80) return { ok: false, error: "Store name must be 2 to 80 characters." };
  return { ok: true, value: s };
}

export function validateStoreUrl(v: unknown): Valid<string> {
  const s = clean(v);
  if (!s || s.length > 200) return { ok: false, error: "Enter your store's web address (https://…)." };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: "Enter your store's web address (https://…)." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "Your store's address must start with https://." };
  if (u.username || u.password || !u.hostname.includes(".") || u.hostname.endsWith(".")) {
    return { ok: false, error: "Enter your store's web address (https://…)." };
  }
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
  return { ok: true, value: `https://${u.hostname.toLowerCase()}${u.port ? `:${u.port}` : ""}${path}` };
}

export const ABOUT_MAX = 280;
export const PROMO_MAX = 120;

/** Optional text: empty becomes null (clears it). */
function optionalText(v: unknown, max: number, label: string): Valid<string | null> {
  if (v != null && typeof v !== "string") return { ok: false, error: `${label} must be text.` };
  const s = clean(v);
  if (s.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` };
  return { ok: true, value: s || null };
}

export const validateAbout = (v: unknown) => optionalText(v, ABOUT_MAX, "Description");
export const validatePromo = (v: unknown) => optionalText(v, PROMO_MAX, "Promo");

// ── Is the plan running? ─────────────────────────────────────────────────────

/**
 * Does a StorePartner's plan still unlock the report and the Verified mark?
 *   plan === null           → a PILOT partner (made by hand, no subscription):
 *                             always active, exactly as before the plan existed.
 *   plan.activeUntil null   → a subscription is linked but no payment was ever
 *                             confirmed: not active.
 *   otherwise               → active until activeUntil + STORE_PLAN_GRACE_DAYS.
 */
export function planPartnerActive(plan: { activeUntil: Date | string | null } | null, now: Date): boolean {
  if (!plan) return true;
  if (!plan.activeUntil) return false;
  const until = new Date(plan.activeUntil).getTime();
  return Number.isFinite(until) && until + STORE_PLAN_GRACE_DAYS * 86_400_000 > now.getTime();
}

export type StorePlanStatus = "payment-pending" | "awaiting-link" | "active" | "ended";

/** What /stores/account tells the buyer about one subscription. */
export function storePlanStatus(sub: { activeUntil: Date | string | null; partnerId: string | null }, now: Date): StorePlanStatus {
  if (!sub.activeUntil) return "payment-pending";
  if (!planPartnerActive({ activeUntil: sub.activeUntil }, now)) return "ended";
  return sub.partnerId ? "active" : "awaiting-link";
}

/** A paid plan nobody has linked to a tracked store yet, older than the SLA. */
export function unlinkedTooLong(sub: { createdAt: Date; activeUntil: Date | null; partnerId: string | null }, now: Date): boolean {
  return !sub.partnerId && !!sub.activeUntil && sub.activeUntil > now && now.getTime() - sub.createdAt.getTime() > STORE_PLAN_LINK_SLA_HOURS * 3_600_000;
}

// ── Stripe objects (shape-tolerant, like lib/stripe-entitlement.ts) ──────────

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => (v && typeof v === "object" ? (v as Rec) : null);

export function subscriptionIdOf(sub: unknown): string | null {
  const id = rec(sub)?.id;
  return typeof id === "string" && id ? id : null;
}

/**
 * Is this Stripe subscription a Stores plan? Its live price is the Stores
 * price, or checkout stamped it kind "store" (which survives a later price
 * change in the dashboard). `priceId` is passed in so the test needs no env.
 */
export function isStorePlanSubscription(sub: unknown, storePriceId: string, livePriceId: string | null): boolean {
  if (storePriceId && livePriceId === storePriceId) return true;
  return rec(rec(sub)?.metadata)?.kind === "store";
}

/** The checkout metadata both the session and its subscription carry. Stripe caps values at 500 chars. */
export function storeCheckoutMetadata(userId: string, storeName: string, storeUrl: string): Record<string, string> {
  return { kind: "store", userId, storeName: storeName.slice(0, 80), storeUrl: storeUrl.slice(0, 200) };
}

/** The tracked store whose website the buyer named, if one matches: preselected on /admin/store-partners. */
export function guessRetailerKey(storeUrl: string, retailers: { key: string; base: string }[]): string | null {
  const host = (u: string) => {
    try {
      return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return null;
    }
  };
  const want = host(storeUrl);
  if (!want) return null;
  return retailers.find((r) => host(r.base) === want)?.key ?? null;
}
