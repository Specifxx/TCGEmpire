// Version-tolerant parsing of Stripe subscription entitlement, extracted from
// the webhook so it can be unit-tested without Stripe and reused by the daily
// reconcile cron.
//
// WHY THIS EXISTS — the Naron incident (Aug 2026). A user's free trial
// converted to a paid year on Stripe, but the site showed him lapsed: the
// renewal handler read `invoice.subscription`, which Stripe REMOVED from
// webhook payloads in API version 2025-03-31 ("basil" — it moved to
// invoice.parent.subscription_details.subscription), and the handler's four
// silent-return paths meant the drop was invisible. The SDK pins its own API
// version for OUTGOING calls, but webhook payload shape follows the endpoint's
// version configured in the Stripe Dashboard — the two can and did diverge.
// Everything here therefore reads BOTH generations of every field it needs,
// structurally, and the callers log loudly instead of returning silently.
//
// Pure on purpose: no prisma, no stripe import — tests/premium-entitlement.test.ts
// exercises every shape DB-free.

type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec | null => (v && typeof v === "object" ? (v as Rec) : null);

/** A Stripe id from a field that may be the id string or the expanded object. */
function idOf(v: unknown): string | null {
  if (typeof v === "string" && v) return v;
  const r = rec(v);
  return r && typeof r.id === "string" && r.id ? r.id : null;
}

/**
 * The subscription id an invoice belongs to, across payload generations:
 *  - ≤ acacia:  invoice.subscription (string | object)
 *  - ≥ basil:   invoice.parent.subscription_details.subscription
 *  - fallback:  the first line item that names a subscription, in either shape
 *               (line.subscription, or line.parent.subscription_item_details /
 *               line.parent.subscription_details).
 * Null only when the invoice genuinely isn't a subscription invoice.
 */
export function subscriptionIdFromInvoice(invoice: unknown): string | null {
  const inv = rec(invoice);
  if (!inv) return null;

  const direct = idOf(inv.subscription);
  if (direct) return direct;

  const parentDetails = rec(rec(inv.parent)?.subscription_details);
  const viaParent = idOf(parentDetails?.subscription);
  if (viaParent) return viaParent;

  const lines = rec(inv.lines);
  const data = Array.isArray(lines?.data) ? (lines!.data as unknown[]) : [];
  for (const line of data) {
    const l = rec(line);
    if (!l) continue;
    const viaLine = idOf(l.subscription);
    if (viaLine) return viaLine;
    const lineParent = rec(l.parent);
    const viaItemDetails = idOf(rec(lineParent?.subscription_item_details)?.subscription);
    if (viaItemDetails) return viaItemDetails;
    const viaLineDetails = idOf(rec(lineParent?.subscription_details)?.subscription);
    if (viaLineDetails) return viaLineDetails;
  }
  return null;
}

/** Epoch seconds → Date, refusing junk (0, NaN, negative). */
function fromEpoch(v: unknown): Date | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

/**
 * The paid-through date of a subscription, across payload generations:
 *  - ≤ acacia: subscription.current_period_end
 *  - ≥ basil:  moved to each item — take the LATEST items.data[].current_period_end
 */
export function periodEndFromSubscription(sub: unknown): Date | null {
  const s = rec(sub);
  if (!s) return null;
  const top = fromEpoch(s.current_period_end);
  if (top) return top;
  const items = rec(s.items);
  const data = Array.isArray(items?.data) ? (items!.data as unknown[]) : [];
  let latest: Date | null = null;
  for (const item of data) {
    const end = fromEpoch(rec(item)?.current_period_end);
    if (end && (!latest || end > latest)) latest = end;
  }
  return latest;
}

/** Statuses that entitle access through the current period end. `past_due`
 *  included on purpose: Stripe is still retrying the charge inside its dunning
 *  window and the period was genuinely started — cutting access mid-retry over
 *  a soft card decline creates exactly the support tickets this file exists to
 *  prevent. `canceled` earns nothing new but keeps already-paid time (the
 *  stamp is extend-only — see resolveEntitlement). */
const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

/** What a subscription entitles its user to right now, or null if nothing. */
export function entitledUntilFromSubscription(sub: unknown): Date | null {
  const s = rec(sub);
  if (!s) return null;
  const status = typeof s.status === "string" ? s.status : "";
  if (!ENTITLED_STATUSES.has(status)) return null;
  return periodEndFromSubscription(s);
}

/** The userId stamped into subscription metadata at checkout, if present. */
export function userIdFromSubscription(sub: unknown): string | null {
  const meta = rec(rec(sub)?.metadata);
  const v = meta?.userId;
  return typeof v === "string" && v ? v : null;
}

/** The customer id off a subscription or invoice, either shape. */
export function customerIdOf(obj: unknown): string | null {
  return idOf(rec(obj)?.customer);
}

/**
 * EXTEND-ONLY stamping decision: the new premiumUntil to write, or null for
 * "leave it alone". Entitlement from Stripe may only ever grow a user's
 * premiumUntil — never shrink it. This is what lets subscription renewals
 * coexist with stacked comp grants (grantPremiumMonths/Days): before this
 * rule, a monthly renewal's period end silently CLOBBERED any longer granted
 * period. A lapsed subscription simply stops extending, which is the site's
 * existing cancellation model.
 */
export function extendedPremiumUntil(current: Date | null | undefined, entitled: Date | null): Date | null {
  if (!entitled) return null;
  if (current && current >= entitled) return null;
  return entitled;
}
