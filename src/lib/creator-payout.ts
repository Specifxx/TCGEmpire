// CREATORS EARN A SHARE OF AFFILIATE PROFIT FROM THE TRAFFIC THEY SEND (owner,
// 2026-10-22: "if they're bringing 20,000 visitors … and we have 40,000 in total …
// we give them like 25% of that"). DECISIONS.md, same title.
//
//   payout = affiliate profit × (their visitors ÷ all visitors) × share %
//
// Their visitors are counted by us (/go/<slug>, CreatorDailyStat). All visitors and
// the month's affiliate profit come from Vercel Analytics and the affiliate
// dashboards, which the owner enters once a month at /admin/creators. Paid by hand,
// like creator-code commission. Pure, so tests and both pages share it.
export const CREATOR_COOKIE = "rc_creator";
export const CREATOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const DEFAULT_SHARE_PCT = 25;

export interface MonthTotals {
  totalVisitors: number;
  affiliateRevenueCents: number;
  sharePct: number;
}

/** Cents owed to a creator for a month. Their share of traffic is capped at 100%. */
export function creatorPayoutCents(visits: number, m: MonthTotals): number {
  if (m.totalVisitors <= 0 || visits <= 0 || m.affiliateRevenueCents <= 0) return 0;
  const share = Math.min(1, visits / m.totalVisitors);
  return Math.floor(m.affiliateRevenueCents * share * (m.sharePct / 100));
}

export const monthOf = (day: string) => day.slice(0, 7);
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(cents / 100);
}

/** Monthly visits and buy clicks per creator, newest month first. */
export function rollUpByMonth(rows: { slug: string; day: string; visits: number; buyClicks: number }[]) {
  const out = new Map<string, Map<string, { visits: number; buyClicks: number }>>();
  for (const r of rows) {
    const m = monthOf(r.day);
    const bySlug = out.get(m) ?? new Map();
    const cur = bySlug.get(r.slug) ?? { visits: 0, buyClicks: 0 };
    bySlug.set(r.slug, { visits: cur.visits + r.visits, buyClicks: cur.buyClicks + r.buyClicks });
    out.set(m, bySlug);
  }
  return [...out.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

/** The creator slug in a cookie string, or null. Slugs are lowercase-hyphen only. */
export function creatorFromCookie(cookie: string | undefined | null): string | null {
  const m = (cookie ?? "").match(new RegExp(`(?:^|;\\s*)${CREATOR_COOKIE}=([a-z0-9-]{1,60})`));
  return m ? m[1] : null;
}

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|discord|telegram|headless|lighthouse/i;
export const looksLikeBot = (ua: string | null) => !ua || BOT.test(ua);
