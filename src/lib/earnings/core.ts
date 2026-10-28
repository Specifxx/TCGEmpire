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
  stripe: "Stripe (Pro + Stores)",
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
  /** Earnings split by the tracking tag each sale carried (eBay's customid), per day. */
  tags?: TagDay[];
  /** The pieces behind the total, in the network's own currency, so it can be
   *  matched line by line against the network's dashboard (e.g. Earnings vs Other
   *  earnings, approved vs pending). Informational: `days` is what is counted. */
  checks?: { label: string; counted: boolean; days: DayAmount[] }[];
  /** The newest day the source's report covers, in its own time zone, even a day
   *  it earned nothing. Set only for eBay, whose report lags Sydney's today; it
   *  marks the source as lagging (see latestDayFigure). */
  reportedThrough?: string;
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

// EBAY'S "TODAY" WAS ALWAYS 0 (2026-10-28, owner). Today is Sydney's day, but
// EPN reports whole days in its own (US) time zone, ~17 hours behind, and adds a
// day's sales up to 48 hours late: Sydney's date had not started in eBay's report
// for most of the day, and once it had, nothing was in it yet. Same-day data does
// not exist, so a lagging source (one that sets reportedThrough) shows, under
// Today, its newest day with earnings, labelled with that date, instead of a
// false 0. Totals and Combined still count only what is dated today.
/** For a lagging source with nothing dated today: its newest earning day before today and that day's total. */
export function latestDayFigure(s: Pick<SourceResult, "days" | "reportedThrough">, today: string, display: string): { day: string; total: RangeTotal } | null {
  if (s.reportedThrough === undefined || s.days.some((d) => d.day === today)) return null;
  let day = "";
  for (const d of s.days) if (d.day < today && d.day > day && (d.cents || d.pendingCents)) day = d.day;
  if (!day) return null;
  return { day, total: totalFor(s.days.filter((d) => d.day === day), "1d", day, display) };
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

// THE GROWTH LINE (2026-10-28, owner: the stacked columns stay, "a line graph
// would also be good … it shows the linear relationship of the growth"). Same
// buckets as the columns, drawn per day or as a running total, with a straight
// least-squares trend through the combined line.
type Bucket = ReturnType<typeof seriesFor>[number];
/** Each bucket's amounts added to every bucket before it. */
export function runningTotal(series: readonly Bucket[]): Bucket[] {
  const bySource: Partial<Record<EarningsSourceKey, number>> = {};
  let cents = 0;
  return series.map((b) => {
    cents += b.cents;
    for (const [k, v] of Object.entries(b.bySource) as [EarningsSourceKey, number][]) bySource[k] = (bySource[k] ?? 0) + v;
    return { label: b.label, cents, bySource: { ...bySource } };
  });
}

/** The least-squares straight line through `values` (x = 0, 1, 2…): its first and last y. Null under three points. */
export function linearTrend(values: readonly number[]): { start: number; end: number; slope: number } | null {
  const n = values.length;
  if (n < 3) return null;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  const slope = den ? num / den : 0;
  return { start: my - slope * mx, end: my + slope * (n - 1 - mx), slope };
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
// One action per conversion: Payout (string, major units, in the action's
// Currency), EventDate (ISO), State PENDING | APPROVED | REVERSED. Reversed
// actions pay nothing. The same action can arrive twice when the windows that
// fetch it overlap, so actions are folded by Id first (impactActions).
export interface ImpactAction {
  id: string | null;
  day: string;
  state: string;
  currency: string;
  cents: number;
  /** The click's sharedid (every site's TCGplayer links carry `<site>-<market>-<placement>`), "" when none. */
  tag?: string;
}

export function impactActions(json: unknown): ImpactAction[] {
  const actions = (json as { Actions?: unknown[] } | null)?.Actions ?? [];
  const out: ImpactAction[] = [];
  for (const a of actions as Record<string, unknown>[]) {
    const t = Date.parse(String(a.EventDate ?? a.ActionDate ?? ""));
    if (!Number.isFinite(t)) continue;
    out.push({
      id: a.Id != null && String(a.Id) ? String(a.Id) : null,
      day: dayIn(t),
      state: String(a.State ?? "").toUpperCase(),
      currency: String(a.Currency ?? "USD").toUpperCase(),
      cents: toCents(a.Payout),
      // First NON-EMPTY of the two: the API returns both keys on every action,
      // and the engine sites (Gundam, Lorcana, YGO) tagged only subId1 before
      // 2026-10-28, so SharedId alone read as "No tag" for their sales.
      tag: [pick(a, "SharedId"), pick(a, "SubId1")].map((v) => String(v ?? "").trim()).find(Boolean) ?? "",
    });
  }
  return out;
}

/** One entry per action Id (the last one seen wins); actions without an Id stand alone. */
export function uniqueActions(actions: readonly ImpactAction[]): ImpactAction[] {
  const byId = new Map<string, ImpactAction>();
  const loose: ImpactAction[] = [];
  for (const a of actions) (a.id ? byId.set(a.id, a) : loose.push(a));
  return [...byId.values(), ...loose];
}

export function impactActionDays(actions: readonly ImpactAction[], states: readonly string[] = ["APPROVED", "PENDING"]): DayAmount[] {
  return mergeDays(
    actions
      .filter((a) => states.includes(a.state) || (states.includes("PENDING") && !["APPROVED", "PENDING", "REVERSED"].includes(a.state)))
      .map((a) => ({ day: a.day, currency: a.currency, cents: a.cents, pendingCents: a.state === "APPROVED" ? 0 : a.cents })),
  );
}

/** TCGplayer by tag (2026-10-26): the same breakdown as eBay's, from each action's sharedid. Reversed actions pay nothing. */
export function impactTagDays(actions: readonly ImpactAction[]): TagDay[] {
  return tagDays(
    actions
      .filter((a) => a.state !== "REVERSED")
      .map((a) => ({ day: a.day, tag: a.tag ?? "", pending: a.state !== "APPROVED", currency: a.currency, cents: a.cents })),
  );
}

export function impactDays(json: unknown): DayAmount[] {
  return impactActionDays(uniqueActions(impactActions(json)));
}

// ── eBay Partner Network: the Performance by Day report ─────────────────────
// GET …/Reports/ebay_partner_perf_by_day_v2.json (EPN_DAILY_REPORT) — one row per day and checkout
// site, with Earnings (and OtherEarnings) in that site's currency. The JSON is
// Impact-style ({ Records: [...] }); the parser also accepts a bare array and
// lower-case keys, so a format change shows as a zero, not a crash.
export function reportRecords(json: unknown): Record<string, unknown>[] {
  return recordsOf(json);
}

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

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ymd = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;

/** A report's date cell as YYYY-MM-DD: ISO ("2026-10-24", "2026-10-24T…"), US
 *  ("10/24/2026", EPN's own CSV style) or written out ("Oct 24, 2026"). */
export function reportDay(v: unknown): string | null {
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return ymd(+m[3], +m[1], +m[2]);
  m = /^([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/i.exec(s);
  if (m && MONTHS.includes(m[1].toLowerCase())) return ymd(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  return null;
}

/** How many rows a report response holds and their column names (never values),
 *  so an unreadable eBay report can say what it got instead of showing $0. */
export function reportShape(json: unknown): { rows: number; columns: string[] } {
  const recs = recordsOf(json);
  return { rows: recs.length, columns: recs.length ? Object.keys(recs[0]).slice(0, 20) : [] };
}

// ONE CURRENCY PER ACCOUNT (2026-10-25). EPN reports every earning in the
// currency the partner chose at sign-up, whatever eBay site the sale was on. The
// first version labelled each row with its checkout site's currency (US → USD,
// UK → GBP), so an AUD account's US sales were converted up a second time: the
// owner saw ~2,500 all-time against ~1,500 on eBay's own dashboard. A currency
// column wins if eBay ever sends one; otherwise the account currency
// (EPN_CURRENCY, AUD by default) applies to every row.
export function epnDays(json: unknown, accountCurrency = "AUD"): DayAmount[] {
  const { earnings, other } = epnDailyParts(reportRecords(json), accountCurrency);
  return mergeDays([...earnings, ...other]);
}

/** The daily report's two money columns kept apart: Earnings and OtherEarnings. */
export function epnDailyParts(records: readonly Record<string, unknown>[], accountCurrency = "AUD"): { earnings: DayAmount[]; other: DayAmount[] } {
  const earnings: DayAmount[] = [];
  const other: DayAmount[] = [];
  for (const r of records) {
    const day = reportDay(pick(r, "Date", "EventDate", "Day", "ReportDate", "TransactionDate"));
    if (!day) continue;
    const currency = String(pick(r, "Currency", "CurrencyCode", "EarningsCurrency") ?? accountCurrency).toUpperCase();
    earnings.push({ day, currency, cents: toCents(pick(r, "Earnings", "TotalEarnings", "Commission")) });
    other.push({ day, currency, cents: toCents(pick(r, "OtherEarnings")) });
  }
  return { earnings: mergeDays(earnings), other: mergeDays(other) };
}

/** The newest date any report row carries (zero-earning rows too), or "" when none. */
export function latestReportDay(records: readonly Record<string, unknown>[], ...columns: string[]): string {
  let max = "";
  for (const r of records) {
    const day = reportDay(pick(r, ...columns));
    if (day && day > max) max = day;
  }
  return max;
}

/** Exact-duplicate report rows (same values in every column) counted once: a row
 *  that comes back twice, from an overlapping window or a repeated page, is the
 *  same row, never a second day of earnings. */
export function uniqueRecords(records: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const r of records) {
    const k = JSON.stringify(Object.keys(r).sort().map((key) => [key, r[key]]));
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// ── eBay Transaction Detail report: one sale, many records ──────────────────
// eBay's glossary: an adjusted sale gets an UPDATED RECORD whose Earnings is the
// sale's new final value (DeltaEarnings is the change). Summing every record
// counts an adjusted sale twice, so records are folded to the latest per
// EpnTransactionId (by UpdateDate) before anything is added up.
export interface EpnTxn {
  id: string | null;
  day: string;
  tag: string; // the click's customid, "" when none
  /** For an untagged sale, what the report says about it (category, eBay site, link tool, traffic), so the
   *  dashboard can tell which site's links lost their customid. "" when tagged. */
  hint?: string;
  pending: boolean;
  currency: string;
  cents: number;
  updated: string;
}

export function epnTransactions(json: unknown, accountCurrency = "AUD"): EpnTxn[] {
  const out: EpnTxn[] = [];
  for (const r of recordsOf(json)) {
    const day = reportDay(pick(r, "EventDate", "Date", "TransactionDate"));
    if (!day) continue;
    const id = String(pick(r, "EpnTransactionId", "EbayCheckoutTransactionId", "TransactionId") ?? "").trim() || null;
    const tag = String(pick(r, "CustomId", "CustomID", "SubId") ?? "").trim();
    out.push({
      id,
      day,
      tag,
      hint: tag ? "" : untaggedHint(r),
      pending: /pending/i.test(String(pick(r, "Status") ?? "")),
      currency: String(pick(r, "Currency", "CurrencyCode", "EarningsCurrency") ?? accountCurrency).toUpperCase(),
      cents: toCents(pick(r, "Earnings", "TotalEarnings", "Commission")),
      updated: String(pick(r, "UpdateDate", "EventDate") ?? ""),
    });
  }
  return out;
}

// UNTAGGED SALES, EXPLAINED (2026-10-26). A third of eBay's 30-day earnings came
// with no customid, so no site could claim them. Every site tags its own links,
// so the report's other columns are the only way to tell where they came from:
// the item's category (cards vs cameras vs phones), the eBay site, the link tool
// and the traffic type. Whatever of those the report carries, in that order.
// Names compared like every other column; a value is cut to 40 characters.
const HINT_COLUMNS: string[][] = [
  ["MetaCategoryName", "MetaCategory", "CategoryName", "LeafCategoryName", "ItemCategory"],
  ["CheckoutSite", "CheckoutSiteName", "ItemSite", "ItemSiteName", "EbaySite", "SiteName"],
  ["ToolId", "ToolID", "ToolName"],
  ["TrafficType", "Device", "DeviceType", "Platform"],
];
export function untaggedHint(r: Record<string, unknown>): string {
  const parts = HINT_COLUMNS.map((names) => String(pick(r, ...names) ?? "").trim().slice(0, 40)).filter(Boolean);
  return parts.join(" · ") || "no detail in the report";
}

/** The latest record of each sale (a record without an id stands alone). */
export function latestPerSale(txns: readonly EpnTxn[]): EpnTxn[] {
  const byId = new Map<string, EpnTxn>();
  const loose: EpnTxn[] = [];
  for (const t of txns) {
    if (!t.id) loose.push(t);
    else {
      const prev = byId.get(t.id);
      if (!prev || Date.parse(t.updated) >= Date.parse(prev.updated) || !Number.isFinite(Date.parse(prev.updated))) byId.set(t.id, t);
    }
  }
  return [...byId.values(), ...loose];
}

export function txnDays(txns: readonly EpnTxn[]): DayAmount[] {
  return mergeDays(txns.map((t) => ({ day: t.day, currency: t.currency, cents: t.cents, pendingCents: t.pending ? t.cents : 0 })));
}

// ── Earnings by tracking tag (2026-10-25, owner: "drill down into the eBay
// earnings by the first two letters, first three letters of the tag … OP, then
// it's One Piece. If it's Dex, then it's Pokemon") ──────────────────────────
// One EPN account serves every site, each tagging its links' customid with its
// own prefix (RiftCompare: `rc-<market>-<placement>`, lib/affiliate.ts).
export interface TagDay {
  day: string;
  tag: string;
  /** Untagged sales only: see untaggedHint. */
  hint?: string;
  currency: string;
  cents: number;
  pendingCents: number;
  sales: number;
}

export function tagDays(txns: readonly Pick<EpnTxn, "day" | "tag" | "hint" | "pending" | "currency" | "cents">[]): TagDay[] {
  const m = new Map<string, TagDay>();
  for (const t of txns) {
    const k = `${t.day}|${t.tag}|${t.hint ?? ""}|${t.currency}`;
    const row = m.get(k) ?? { day: t.day, tag: t.tag, ...(t.hint ? { hint: t.hint } : {}), currency: t.currency, cents: 0, pendingCents: 0, sales: 0 };
    row.cents += t.cents;
    if (t.pending) row.pendingCents += t.cents;
    row.sales += 1;
    m.set(k, row);
  }
  return [...m.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.tag.localeCompare(b.tag)));
}

// GROUPED BY PREFIX, NOT BY A LIST (2026-10-25, owner: "as I add more sites …
// MTG … Gundam … Lorcana … just take the first couple of letters and use that
// as a split"). Every site starts its tags with its own short prefix and a
// separator (`rc-au-ebay`, `op-…`, `dex-…`), so the group is the letters before
// the first separator, and a new site's tags appear as their own group with no
// code change. A tag with no separator groups by its first three characters.
// TAG_NAMES only adds a friendly name next to a prefix; it never decides a group.
export const TAG_NAMES: Record<string, string> = {
  rc: "RiftCompare (Riftbound)",
  pkmn: "Pokémon on RiftCompare",
  dex: "DexCompare (Pokémon)",
  op: "One Piece",
  oc: "OP Compare (One Piece)",
  gundam: "Gundam Compare",
  lorcana: "Lorcana Compare",
  ygo: "YGO Compare (Yu-Gi-Oh!)",
  cc: "CamCompare",
};

export function tagGroup(tag: string): { key: string; label: string } {
  const t = tag.trim().toLowerCase();
  if (!t) return { key: "", label: "No tag" };
  const m = /^([a-z0-9]+)[-_.\s/:|]/.exec(t);
  const key = m ? m[1] : t.slice(0, 3);
  return { key, label: TAG_NAMES[key] ?? key.toUpperCase() };
}

export interface TagGroupTotal {
  key: string;
  label: string;
  cents: number;
  pendingCents: number;
  sales: number;
  native: Record<string, number>;
  tags: { tag: string; cents: number; pendingCents: number; sales: number }[];
}

/** Tag groups for a range, biggest first, each with its full tags (in `display`). */
export function tagBreakdown(rows: readonly TagDay[], range: RangeKey, today: string, display: string): TagGroupTotal[] {
  const groups = new Map<string, TagGroupTotal>();
  const tagMaps = new Map<string, Map<string, { tag: string; cents: number; pendingCents: number; sales: number }>>();
  for (const r of rows) {
    if (!inRange(r.day, range, today)) continue;
    const g = tagGroup(r.tag);
    const grp = groups.get(g.key) ?? { ...g, cents: 0, pendingCents: 0, sales: 0, native: {}, tags: [] };
    const cents = toDisplay(r.cents, r.currency, display);
    const pend = toDisplay(r.pendingCents, r.currency, display);
    grp.cents += cents;
    grp.pendingCents += pend;
    grp.sales += r.sales;
    grp.native[r.currency] = (grp.native[r.currency] ?? 0) + r.cents;
    groups.set(g.key, grp);
    const tm = tagMaps.get(g.key) ?? new Map();
    // An untagged sale is listed by what the report says about it (untaggedHint).
    const line = r.tag || (r.hint ? `(none) ${r.hint}` : "(none)");
    const t = tm.get(line) ?? { tag: line, cents: 0, pendingCents: 0, sales: 0 };
    t.cents += cents;
    t.pendingCents += pend;
    t.sales += r.sales;
    tm.set(line, t);
    tagMaps.set(g.key, tm);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, tags: [...(tagMaps.get(g.key)?.values() ?? [])].sort((a, b) => b.cents - a.cents) }))
    .sort((a, b) => b.cents - a.cents);
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
