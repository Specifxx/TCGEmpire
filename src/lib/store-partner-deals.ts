// STORE PARTNER DEALS (2026-10-26, owner: "execute on all the recommended items").
// DECISIONS.md, "Store partner codes: the store links start earning".
//
// Until today every independent-store link earned nothing: eBay, TCGplayer and
// Amazon pay us, the 60+ Shopify stores we actually compare do not. A store joins
// by giving us two things, either or both:
//
//   1. An EXCLUSIVE discount code, issued by the store for RiftCompare visitors
//      only. It is shown as a chip on that store's rows ("5% off · code RIFT5").
//      Because the store issued it to us, it works; because it is ours alone, the
//      store's own discount report counts the orders we sent, on phones and app
//      handoffs too, where a tracking parameter gets lost.
//   2. A COMMISSION link: the query parameter its affiliate app reads (Shopify
//      Collabs, UpPromote, GoAffPro, Refersion…). affiliateUrl() adds it through
//      DIRECT_PROGRAMS, which reads this list, so the row becomes a "Paid link".
//
// THE HARD RULE, same as the Stores plan: a deal never changes a store's place in
// any comparison. Rows stay sorted by item price; the code is a label beside the
// price, never a discount applied to it (a code can have exclusions and minimums
// we cannot see). Nothing in lib/market-rows.ts or any sort reads this file
// (tests/store-partner-deals.test.ts).
//
// A code is shown only while someone has checked it at the store's checkout in
// the last CODE_RECHECK_DAYS days (`checked`), and never on or after `until`. A
// code nobody re-checked quietly disappears rather than becoming one of the dead
// codes coupon sites are known for. The ops monitor warns a week before that.
//
// Pure data, no imports: client components (the price tables) read it.

export interface StorePartnerDeal {
  /** Bare hostname of the store, no www (matched against every outbound link). */
  host: string;
  /** Display name, for the store page and the ops check. */
  name: string;
  /** ISO date the partnership started. */
  since: string;
  /** The exclusive code, exactly as typed at checkout. */
  code?: string;
  /** What it gives, in the store's words, short: "5% off singles". */
  offer?: string;
  /** ISO date someone last confirmed the code at the store's checkout. */
  checked?: string;
  /** ISO date the code ends (exclusive), if the store set one. */
  until?: string;
  /** The commission parameter the store's affiliate app reads. */
  ref?: { param: string; value: string };
}

// Empty until the first store signs. Add an entry per store; see
// docs/store-partners.md for the outreach and the steps.
export const STORE_PARTNER_DEALS: StorePartnerDeal[] = [];

export const CODE_RECHECK_DAYS = 30;
const DAY = 86_400_000;

function hostOf(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export function dealForHost(host: string | null | undefined, deals: readonly StorePartnerDeal[] = STORE_PARTNER_DEALS): StorePartnerDeal | null {
  if (!host) return null;
  const h = host.replace(/^www\./i, "").toLowerCase();
  return deals.find((d) => d.host === h) ?? null;
}

export interface ActiveStoreCode {
  code: string;
  offer: string;
  checked: string;
  name: string;
}

/** The code to show beside a link to this store, or null. */
export function activeStoreCode(
  href: string | null | undefined,
  now: Date = new Date(),
  deals: readonly StorePartnerDeal[] = STORE_PARTNER_DEALS,
): ActiveStoreCode | null {
  const d = dealForHost(hostOf(href), deals);
  if (!d?.code || !d.checked) return null;
  const checked = Date.parse(d.checked);
  if (!Number.isFinite(checked) || now.getTime() - checked > CODE_RECHECK_DAYS * DAY) return null;
  if (d.until && now.getTime() >= Date.parse(d.until)) return null;
  return { code: d.code, offer: d.offer ?? "Discount", checked: d.checked, name: d.name };
}

/** The store's commission rewrite of an outbound URL, or null when it has none. */
export function partnerRefUrl(u: URL, deals: readonly StorePartnerDeal[] = STORE_PARTNER_DEALS): string | null {
  const d = dealForHost(u.hostname, deals);
  if (!d?.ref) return null;
  const out = new URL(u.toString());
  out.searchParams.set(d.ref.param, d.ref.value);
  return out.toString();
}

/** Codes that stop showing within `days` (for the ops monitor). */
export function codesNeedingRecheck(
  now: Date = new Date(),
  days = 7,
  deals: readonly StorePartnerDeal[] = STORE_PARTNER_DEALS,
): { name: string; host: string; hidesOn: string }[] {
  const out: { name: string; host: string; hidesOn: string }[] = [];
  for (const d of deals) {
    if (!d.code || !d.checked) continue;
    const hides = Math.min(
      Date.parse(d.checked) + CODE_RECHECK_DAYS * DAY,
      d.until ? Date.parse(d.until) : Infinity,
    );
    if (Number.isFinite(hides) && hides - now.getTime() <= days * DAY) {
      out.push({ name: d.name, host: d.host, hidesOn: new Date(hides).toISOString().slice(0, 10) });
    }
  }
  return out;
}
