// Delivery-window ESTIMATES without a carrier API — pure and prisma-free, safe
// for "use client" bundles and emails alike.
//
// There is deliberately no live tracking integration yet (cost); windows are
// computed from the seller's stated handling time + flat per-country transit
// ranges, and every surface that shows one must label it an estimate ("arriving
// ~Aug 5–9 (estimate)"). estimateDeliveryWindow() is the single seam where a
// Phase-2 carrier-tracking API plugs in later: real scan data (deliveredAt /
// carrier ETA) would simply take precedence over the computed window here,
// and no calling surface has to change.

// Domestic parcel transit in BUSINESS days (min–max), keyed by the order's
// shipCountry. Same-region-only delivery means origin and destination share a
// country, so one range per market is enough. Deliberately wide — a pleasant
// surprise beats a missed promise.
const TRANSIT_BUSINESS_DAYS: Record<string, { min: number; max: number }> = {
  AU: { min: 2, max: 6 },
  UK: { min: 2, max: 4 },
  US: { min: 3, max: 7 },
  NZ: { min: 3, max: 8 },
  SG: { min: 2, max: 5 },
};
const DEFAULT_TRANSIT = { min: 3, max: 10 };

// Add n business days (skipping Sat/Sun) — carriers quote transit this way.
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from);
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d;
}

export interface DeliveryWindow {
  from: Date;
  to: Date;
}

// The estimated delivery window for an order. Anchored on shippedAt when the
// parcel is actually in the post (transit time only); before that, on paidAt
// plus the seller's stated handling days. Null when the order hasn't been paid
// yet (nothing meaningful to estimate).
export function estimateDeliveryWindow(input: {
  paidAt: Date | string | null;
  shippedAt: Date | string | null;
  handlingDays: number;
  country: string | null;
}): DeliveryWindow | null {
  const transit = TRANSIT_BUSINESS_DAYS[input.country ?? ""] ?? DEFAULT_TRANSIT;
  const shippedAt = input.shippedAt ? new Date(input.shippedAt) : null;
  const paidAt = input.paidAt ? new Date(input.paidAt) : null;
  const anchor = shippedAt ?? (paidAt ? addBusinessDays(paidAt, Math.max(0, input.handlingDays)) : null);
  if (!anchor) return null;
  return { from: addBusinessDays(anchor, transit.min), to: addBusinessDays(anchor, transit.max) };
}

// "Aug 5–9" (same month collapsed) or "Aug 30 – Sep 3".
export function formatDateRange(from: Date | string, to: Date | string): string {
  const f = new Date(from);
  const t = new Date(to);
  const md = new Intl.DateTimeFormat("en-AU", { month: "short", day: "numeric" });
  if (f.getMonth() === t.getMonth() && f.getFullYear() === t.getFullYear()) {
    return `${md.format(f)}–${t.getDate()}`;
  }
  return `${md.format(f)} – ${md.format(t)}`;
}

// "Aug 19" — for single concrete dates ("Ship by Aug 19", "Auto-completes on Aug 19").
export function formatDay(d: Date | string): string {
  return new Intl.DateTimeFormat("en-AU", { month: "short", day: "numeric" }).format(new Date(d));
}
