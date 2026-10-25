import { convertCents } from "../fx";

// The admin earnings dashboard's pure half (2026-10-24, owner: "a centralized
// page within the admin dashboard where I can see my earnings from … Stripe
// subscription, TCG player, eBay partner network, and like my ads network,
// whether it's AdSense or Mediavine … the 1 day view, the 1 week view, the 30
// day view, and the 90 day view, the total earns view … the individual earnings,
// but also … the combined ones"). DECISIONS.md, "One earnings dashboard".
//
// Every source is reduced to the same shape — money per calendar day, in the
// currency the source reported it — and everything else (the ranges, the
// combined total, the conversion into one display currency) is computed here,
// so tests/earnings.test.ts can hold it without a network. The parsers for each
// source's API response live here too, for the same reason; the fetching is in
// lib/earnings/sources.ts.

export type EarningsSourceKey = "stripe" | "tcgplayer" | "ebay" | "adsense" | "mediavine";

export const SOURCE_LABELS: Record<EarningsSourceKey, string> = {
  stripe: "Stripe (Premium + Stores)",
  tcgplayer: "TCGplayer (Impact)",
  ebay: "eBay Partner Network",
  adsense: "Google AdSense",
  mediavine: "Mediavine",
};

/** Money one source earned on one calendar day, in one currency. */
export interface DayAmount {
  day: string; // YYYY-MM-DD
  currency: string; // ISO 4217, upper case
  cents: number; // earned (net of refunds and fees where the source reports them)
  pendingCents?: number; // the part not yet approved/locked (affiliate networks)
}

export type SourceStatus = "ok" | "not-configured" | "error";

export interface SourceResult {
  key: EarningsSourceKey;
  status: SourceStatus;
  /** What went wrong, or what to set up. Never a secret. */
  detail?: string;
  days: DayAmount[];
  /** When this source's data was fetched (ms). */
  fetchedAt: number;
}

// ── Days and ranges ───────────────────────────────────────────────────────────
// Days are calendar days in Sydney, the owner's clock, for the sources that give
// timestamps (Stripe, Impact). EPN and AdSense report whole days in their own
// account time zone and are taken as they come.
export const EARNINGS_TIME_ZONE = "Australia/Sydney";

export function dayIn(ts: Date | number, timeZone = EARNINGS_TIME_ZONE): string {
  const d = typeof ts === "number" ? new Date(ts) : ts;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(day: string, n: number): string {
  const t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export type RangeKey = "1d" | "7d" | "30d" | "90d" | "all";
export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "1d", label: "Today", days: 1 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

export function isRangeKey(v: unknown): v is RangeKey {
  return RANGES.some((r) => r.key === v);
}

/** First day (inclusive) of a range ending `today`, or null for all time. */
export function rangeStart(range: RangeKey, today: string): string | null {
  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  return days == null ? null : addDays(today, -(days - 1));
}

export function inRange(day: string, range: RangeKey, today: string): boolean {
  const start = rangeStart(range, today);
  return day <= today && (start == null || day >= start);
}

/** Cents of `from` in `to`, via the site's reference rates (lib/fx.ts). */
export function toDisplay(cents: number, from: string, to: string): number {
  return convertCents(cents, from.toUpperCase(), to.toUpperCase());
}

export interface RangeTotal {
  /** In the display currency. */
  cents: number;
  pendingCents: number;
  /** As reported, per currency, before conversion. */
  native: Record<string, number>;
}

export function totalFor(days: readonly DayAmount[], range: RangeKey, today: string, display: string): RangeTotal {
  const out: RangeTotal = { cents: 0, pendingCents: 0, native: {} };
  for (const d of days) {
    if (!inRange(d.day, range, today)) continue;
    out.cents += toDisplay(d.cents, d.currency, display);
    out.pendingCents += toDisplay(d.pendingCents ?? 0, d.currency, display);
    out.native[d.currency] = (out.native[d.currency] ?? 0) + d.cents;
  }
  return out;
}

/** Combined earnings per day (or per month for all time), in the display currency, oldest first. */
export function seriesFor(
  sources: readonly SourceResult[],
  range: RangeKey,
  today: string,
  display: string,
): { label: string; cents: number; bySource: Partial<Record<EarningsSourceKey, number>> }[] {
  const monthly = range === "all";
  const buckets = new Map<string, { cents: number; bySource: Partial<Record<EarningsSourceKey, number>> }>();
  const start = rangeStart(range, today);
  if (start) for (let d = start; d <= today; d = addDays(d, 1)) buckets.set(d, { cents: 0, bySource: {} });
  for (const s of sources) {
    for (const d of s.days) {
      if (!inRange(d.day, range, today)) continue;
      const k = monthly ? d.day.slice(0, 7) : d.day;
      const b = buckets.get(k) ?? { cents: 0, bySource: {} };
      const c = toDisplay(d.cents, d.currency, display);
      b.cents += c;
      b.bySource[s.key] = (b.bySource[s.key] ?? 0) + c;
      buckets.set(k, b);
    }
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, v]) => ({ label, ...v }));
}

/** Merge rows into one per (day, currency). */
export function mergeDays(rows: readonly DayAmount[]): DayAmount[] {
  const m = new Map<string, DayAmount>();
  for (const r of rows) {
    if (!r.cents && !r.pendingCents) continue;
    const k = `${r.day}|${r.currency}`;
    const p = m.get(k);
    if (p) {
      p.cents += r.cents;
      p.pendingCents = (p.pendingCents ?? 0) + (r.pendingCents ?? 0);
    } else m.set(k, { ...r, pendingCents: r.pendingCents ?? 0 });
  }
  return [...m.values()].sort((a, b) => a.day.localeCompare(b.day));
}

const toCents = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

// ── Stripe: balance transactions ─────────────────────────────────────────────
// What landed in (or left) the Stripe balance: charges and payments net of
// Stripe's fee, minus refunds, disputes and Stripe's own billing fees. Moving
// money out (payouts, transfers, top-ups) is not earning and is left out.
const STRIPE_NOT_EARNINGS = new Set([
  "payout",
  "payout_cancel",
  "payout_failure",
  "payout_minimum_balance_hold",
  "payout_minimum_balance_release",
  "transfer",
  "transfer_cancel",
  "transfer_failure",
  "transfer_refund",
  "topup",
  "topup_reversal",
  "reserve_transaction",
  "reserved_funds",
]);

export interface StripeTxn {
  type: string;
  net: number; // minor units
  currency: string;
  created: number; // unix seconds
}

export function stripeDays(txns: readonly StripeTxn[]): DayAmount[] {
  return mergeDays(
    txns
      .filter((t) => !STRIPE_NOT_EARNINGS.has(t.type))
      .map((t) => ({ day: dayIn(t.created * 1000), currency: t.currency.toUpperCase(), cents: t.net })),
  );
}

// ── TCGplayer via Impact: the partner Actions API ───────────────────────────
// One action per conversion: Payout (string, major units), Currency, EventDate
// (ISO), State PENDING | APPROVED | REVERSED. Reversed actions pay nothing.
export function impactDays(json: unknown): DayAmount[] {
  const actions = (json as { Actions?: unknown[] } | null)?.Actions ?? [];
  const rows: DayAmount[] = [];
  for (const a of actions as Record<string, unknown>[]) {
    const state = String(a.State ?? "").toUpperCase();
    if (state === "REVERSED") continue;
    const date = String(a.EventDate ?? a.ActionDate ?? "");
    const t = Date.parse(date);
    if (!Number.isFinite(t)) continue;
    const cents = toCents(a.Payout);
    rows.push({ day: dayIn(t), currency: String(a.Currency ?? "USD").toUpperCase(), cents, pendingCents: state === "APPROVED" ? 0 : cents });
  }
  return mergeDays(rows);
}

// ── eBay Partner Network: the Performance by Day report ─────────────────────
// GET …/Reports/ebay_partner_perf_by_day_v2.json (EPN_DAILY_REPORT) — one row per day and checkout
// site, with Earnings (and OtherEarnings) in that site's currency. The JSON is
// Impact-style ({ Records: [...] }); the parser also accepts a bare array and
// lower-case keys, so a format change shows as a zero, not a crash.
export const EPN_SITE_CURRENCY: Record<string, string> = {
  US: "USD",
  UK: "GBP",
  GB: "GBP",
  AU: "AUD",
  CA: "CAD",
  CH: "CHF",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  AT: "EUR",
  BE: "EUR",
  IE: "EUR",
};

function recordsOf(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  const o = (json ?? {}) as Record<string, unknown>;
  for (const k of ["Records", "records", "Data", "data", "Rows", "rows"]) if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
  return [];
}

// Column names compared without case, spaces or underscores ("Event Date",
// "event_date" and "EventDate" are one column), so a renamed v2 column still reads.
const colKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const pick = (r: Record<string, unknown>, ...names: string[]) => {
  for (const n of names) for (const k of Object.keys(r)) if (colKey(k) === colKey(n)) return r[k];
  return undefined;
};

export function epnDays(json: unknown): DayAmount[] {
  const rows: DayAmount[] = [];
  for (const r of recordsOf(json)) {
    const day = String(pick(r, "Date", "EventDate", "Day", "ReportDate") ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const site = String(pick(r, "CheckoutSite", "Site", "Program", "Marketplace") ?? "US").toUpperCase();
    const currency = String(pick(r, "Currency", "CurrencyCode", "EarningsCurrency") ?? EPN_SITE_CURRENCY[site] ?? "USD").toUpperCase();
    rows.push({ day, currency, cents: toCents(pick(r, "Earnings", "TotalEarnings", "Commission")) + toCents(pick(r, "OtherEarnings")) });
  }
  return mergeDays(rows);
}

// ── AdSense Management API v2: reports:generate ─────────────────────────────
// headers [{name:"DATE"}, {name:"ESTIMATED_EARNINGS", currencyCode}], rows of
// cells [{value:"2026-10-01"}, {value:"1.23"}]. Estimated, as AdSense says.
export function adsenseDays(json: unknown): DayAmount[] {
  const j = (json ?? {}) as { headers?: { name?: string; currencyCode?: string }[]; rows?: { cells?: { value?: string }[] }[] };
  const headers = j.headers ?? [];
  const di = headers.findIndex((h) => h.name === "DATE");
  const ei = headers.findIndex((h) => h.name === "ESTIMATED_EARNINGS");
  if (di < 0 || ei < 0) return [];
  const currency = (headers[ei].currencyCode ?? "USD").toUpperCase();
  return mergeDays(
    (j.rows ?? []).map((r) => ({ day: String(r.cells?.[di]?.value ?? ""), currency, cents: toCents(r.cells?.[ei]?.value) })).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day)),
  );
}

/** Split [from, to] into windows of at most `maxDays` days (inclusive ends). */
export function windows(from: string, to: string, maxDays: number): [string, string][] {
  const out: [string, string][] = [];
  for (let s = from; s <= to; s = addDays(s, maxDays)) {
    const e = addDays(s, maxDays - 1);
    out.push([s, e < to ? e : to]);
  }
  return out;
}

// ── Costs (2026-10-25, owner: "add costs … Vercel Pro plan … Anthropic plan …
// an ability to add costs manually … Reddit ads or Meta ads … one-off") ──────
// A cost is either automatic (Anthropic API usage, from the Admin API's Cost
// report) or an entry on the dashboard: once, or repeating monthly/yearly from a
// start date until an optional end date. Repeating entries are expanded into
// one charge per period up to today, so ranges and profit work the same way as
// earnings.
export type CostRecurrence = "once" | "monthly" | "yearly";
export const COST_CATEGORIES = ["Hosting", "AI", "Ads", "Software", "Other"] as const;

export interface CostEntry {
  id: string;
  label: string;
  category: string;
  amountCents: number;
  currency: string;
  startDay: string; // YYYY-MM-DD
  recurrence: CostRecurrence;
  endDay: string | null; // last day it still charges (inclusive), or null while running
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m 1-12

/** One charge per period from startDay to min(endDay, today), on the start's day of month (clamped). */
export function expandCost(c: CostEntry, today: string): DayAmount[] {
  const stop = c.endDay && c.endDay < today ? c.endDay : today;
  if (c.startDay > stop) return [];
  if (c.recurrence === "once") return [{ day: c.startDay, currency: c.currency, cents: c.amountCents }];
  const [y0, m0, d0] = c.startDay.split("-").map(Number);
  const step = c.recurrence === "yearly" ? 12 : 1;
  const out: DayAmount[] = [];
  for (let k = 0; k < 1200; k += step) {
    const y = y0 + Math.floor((m0 - 1 + k) / 12);
    const m = ((m0 - 1 + k) % 12) + 1;
    const day = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d0, daysInMonth(y, m))).padStart(2, "0")}`;
    if (day > stop) break;
    out.push({ day, currency: c.currency, cents: c.amountCents });
  }
  return out;
}

// ── Anthropic: Admin API cost report (API usage only) ───────────────────────
// GET /v1/organizations/cost_report → data[] of daily buckets
// { starting_at, ending_at, results: [{ amount: "123.45" (USD cents, decimal string), currency }] }.
// It covers API (Console) usage only: a claude.ai Pro/Max subscription is not in
// any API and is entered on the dashboard as a monthly cost instead.
export function anthropicCostDays(json: unknown): DayAmount[] {
  const data = ((json ?? {}) as { data?: { starting_at?: string; results?: { amount?: string | number; currency?: string }[] }[] }).data ?? [];
  const rows: DayAmount[] = [];
  for (const b of data) {
    const day = String(b.starting_at ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    for (const r of b.results ?? []) {
      const cents = Math.round(Number(r.amount ?? 0));
      if (Number.isFinite(cents) && cents) rows.push({ day, currency: String(r.currency ?? "USD").toUpperCase(), cents });
    }
  }
  return mergeDays(rows);
}
