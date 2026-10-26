import { prisma } from "@/lib/db";
import { stripe, stripeEnabled } from "@/lib/stripe";
import {
  adsenseDays,
  dayIn,
  epnDailyParts,
  impactActionDays,
  impactTagDays,
  impactActions,
  reportRecords,
  uniqueActions,
  uniqueRecords,
  type ImpactAction,
  epnTransactions,
  latestPerSale,
  reportShape,
  tagDays,
  txnDays,
  type EpnTxn,
  mergeDays,
  stripeDays,
  windows,
  type DayAmount,
  type EarningsSourceKey,
  type SourceResult,
  type StripeTxn,
} from "./core";

// The earnings dashboard's fetchers (/admin/earnings; DECISIONS.md "One
// earnings dashboard"). Each source is read from its own reporting API with
// credentials that live only in Vercel, independently guarded: one failing or
// unconfigured source shows as such and never hides the others. Results are kept
// for 30 minutes per server instance (a globalThis memo, lib/db.ts rule 2) so the
// page can be reloaded freely; "Refresh" bypasses it.
//
// NONE OF THIS READS NEON except Mediavine's manual entries (one small table).
// The external APIs are each bounded: Stripe pages of 100 balance transactions
// since EARNINGS_SINCE (capped), Impact in 30-day windows, EPN in 31-day windows (paged),
// AdSense in one request.

const TTL_MS = 30 * 60_000;
const TIMEOUT_MS = 25_000;
/** How far back "all time" reaches. RiftCompare's earning history starts in 2026. */
export const EARNINGS_SINCE = /^\d{4}-\d{2}-\d{2}$/.test(process.env.EARNINGS_SINCE ?? "") ? process.env.EARNINGS_SINCE! : "2026-01-01";

type Fetcher = () => Promise<Omit<SourceResult, "key" | "fetchedAt">>;
const memo: Map<string, SourceResult> = ((globalThis as { __rcEarnings?: Map<string, SourceResult> }).__rcEarnings ??= new Map());

const notConfigured = (detail: string) => ({ status: "not-configured" as const, detail, days: [] as DayAmount[] });

async function getJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const r = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 160).replace(/\s+/g, " ")}`);
  return text ? JSON.parse(text) : null;
}

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

// ── Stripe ───────────────────────────────────────────────────────────────────
const STRIPE_MAX_TXNS = 20_000;
const fetchStripe: Fetcher = async () => {
  if (!stripeEnabled()) return notConfigured("STRIPE_SECRET_KEY is not set.");
  const since = Math.floor(Date.parse(`${EARNINGS_SINCE}T00:00:00Z`) / 1000);
  const txns: StripeTxn[] = [];
  for await (const t of stripe().balanceTransactions.list({ created: { gte: since }, limit: 100 })) {
    txns.push({ type: t.type, net: t.net, currency: t.currency, created: t.created });
    if (txns.length >= STRIPE_MAX_TXNS) break;
  }
  return { status: "ok", days: stripeDays(txns), detail: txns.length >= STRIPE_MAX_TXNS ? `Capped at ${STRIPE_MAX_TXNS} transactions.` : undefined };
};

// ── TCGplayer via Impact ─────────────────────────────────────────────────────
// WHICH DATE THE WINDOWS FILTER (2026-10-25). Impact's partner Actions docs: with
// no StartDate/EndDate (the action's LAST-UPDATED date) the list returns only
// the past 7 days, and that pair may span at most 45 days. Filtering on the
// event date alone risked exactly that silent 7-day cut. So the windows walk the
// last-updated date from EARNINGS_SINCE to now: every action has one
// last-updated date, so each lands in some window, and the windows overlap by a
// second at each seam, with actions folded by Id (uniqueActions). Days still
// come from EventDate. If Impact ever refuses those parameters, the old
// event-date query runs instead.
const isoSec = (ms: number) => new Date(ms).toISOString().slice(0, 19) + "Z";

async function impactPages(sid: string, headers: Record<string, string>, query: (from: string, to: string) => string): Promise<ImpactAction[]> {
  const out: ImpactAction[] = [];
  for (const [from, to] of windows(EARNINGS_SINCE, dayIn(Date.now()), 44)) {
    let url: string | null = `https://api.impact.com/Mediapartners/${encodeURIComponent(sid)}/Actions?${query(from, to)}&PageSize=1000`;
    for (let page = 0; url && page < 50; page++) {
      const json = (await getJson(url, { headers })) as { "@nextpageuri"?: string } | null;
      out.push(...impactActions(json));
      const next: string | undefined = json?.["@nextpageuri"];
      url = next ? `https://api.impact.com${next}` : null;
    }
  }
  return uniqueActions(out);
}

const fetchImpact: Fetcher = async () => {
  const sid = process.env.IMPACT_ACCOUNT_SID;
  const token = process.env.IMPACT_AUTH_TOKEN;
  if (!sid || !token) return notConfigured("Set IMPACT_ACCOUNT_SID and IMPACT_AUTH_TOKEN (Impact → Settings → API).");
  const headers = { Authorization: basic(sid, token), Accept: "application/json" };
  let actions: ImpactAction[];
  let how = "by last-updated date";
  try {
    actions = await impactPages(sid, headers, (from, to) => {
      const end = Math.min(Date.parse(`${to}T00:00:00Z`) + 86_400_000, Date.now());
      return `StartDate=${isoSec(Date.parse(`${from}T00:00:00Z`) - 1000)}&EndDate=${isoSec(end)}`;
    });
  } catch (e) {
    console.error("[earnings] impact update-date query failed, using event dates:", e);
    how = "by event date (the update-date query was refused)";
    actions = await impactPages(sid, headers, (from, to) => `ActionDateStart=${from}T00:00:00Z&ActionDateEnd=${to}T23:59:59Z`);
  }
  actions = actions.filter((a) => a.day >= EARNINGS_SINCE);
  const count = (st: string) => actions.filter((a) => a.state === st).length;
  return {
    status: "ok",
    days: impactActionDays(actions),
    tags: impactTagDays(actions),
    checks: [
      { label: `Approved (${count("APPROVED")} actions)`, counted: true, days: impactActionDays(actions, ["APPROVED"]) },
      { label: `Pending (${actions.length - count("APPROVED") - count("REVERSED")} actions)`, counted: true, days: impactActionDays(actions, ["PENDING"]) },
      { label: `Reversed (${count("REVERSED")} actions, not counted)`, counted: false, days: impactActionDays(actions, ["REVERSED"]) },
    ],
    detail: `${actions.length} actions, fetched ${how}. Payouts in each action's own currency.`,
  };
};

// ── eBay Partner Network ─────────────────────────────────────────────────────
// The daily report's id. eBay retired "ebay_partner_perf_by_day" for "_v2"
// (2026-10-25, the dashboard showed the API's error); EPN_DAILY_REPORT overrides
// it without a code change if eBay renames it again.
export const EPN_DAILY_REPORT = /^[a-z0-9_]+$/.test(process.env.EPN_DAILY_REPORT ?? "") ? process.env.EPN_DAILY_REPORT! : "ebay_partner_perf_by_day_v2";
// The request follows eBay's own guide ("Partner Reporting via the New API
// Endpoints"): CAMPAIGN_ID=0 and CHECKOUT_SITE=0 ask for every campaign and site.
// Two reports are read side by side (2026-10-25):
//   • Performance by Day — eBay's own daily sums, the headline figure;
//   • Transaction Detail — one row per sale RECORD, folded to the latest record
//     per sale (lib/earnings/core.ts latestPerSale), which carries the customid
//     the tag breakdown needs. If the daily report is empty its sums stand in.
// Every amount is in the EPN account's currency (EPN_CURRENCY, AUD unless set):
// eBay reports all earnings in the currency chosen at sign-up.
export const EPN_CURRENCY = /^[A-Z]{3}$/.test((process.env.EPN_CURRENCY ?? "").trim().toUpperCase())
  ? (process.env.EPN_CURRENCY ?? "").trim().toUpperCase()
  : "AUD";
const EPN_TDR_REPORTS = ["ebay_partner_transaction_detail", "ebay_partner_transaction_detail_v2"];

async function epnPages(sid: string, headers: Record<string, string>, report: string, params: string, onPage: (json: unknown) => void): Promise<{ rows: number; columns: string[] }> {
  let rows = 0;
  let columns: string[] = [];
  for (const [from, to] of windows(EARNINGS_SINCE, dayIn(Date.now()), 31)) {
    let url: string | null = `https://api.partner.ebay.com/Mediapartners/${encodeURIComponent(sid)}/Reports/${report}.json?${params}&START_DATE=${from}&END_DATE=${to}`;
    for (let page = 0; url && page < 20; page++) {
      const json = (await getJson(url, { headers })) as { "@nextpageuri"?: string } | null;
      const shape = reportShape(json);
      rows += shape.rows;
      if (!columns.length) columns = shape.columns;
      onPage(json);
      const next: string | undefined = json?.["@nextpageuri"];
      url = next ? `https://api.partner.ebay.com${next}` : null;
    }
  }
  return { rows, columns };
}

const money2 = (cents: number) => (cents / 100).toFixed(2);
const sumCents = (days: readonly DayAmount[]) => days.reduce((n, d) => n + d.cents, 0);

const fetchEpn: Fetcher = async () => {
  const sid = process.env.EPN_ACCOUNT_SID;
  const token = process.env.EPN_AUTH_TOKEN;
  if (!sid || !token) return notConfigured("Set EPN_ACCOUNT_SID and EPN_AUTH_TOKEN (eBay Partner Network → cloud icon → API).");
  const headers = { Authorization: basic(sid, token), Accept: "application/json" };

  const dailyRun = (async () => {
    const records: Record<string, unknown>[] = [];
    const shape = await epnPages(sid, headers, EPN_DAILY_REPORT, "CAMPAIGN_ID=0&CHECKOUT_SITE=0", (j) => records.push(...reportRecords(j)));
    const unique = uniqueRecords(records);
    const parts = epnDailyParts(unique, EPN_CURRENCY);
    return { days: mergeDays([...parts.earnings, ...parts.other]), parts, duplicates: records.length - unique.length, ...shape };
  })();
  const tdrRun = (async () => {
    let lastError: unknown = null;
    for (const report of EPN_TDR_REPORTS) {
      try {
        const records: EpnTxn[] = [];
        const shape = await epnPages(sid, headers, report, "STATUS=APPROVED&STATUS=PENDING&CHECKOUT_SITE=0&CAMPAIGN_ID=0", (j) => records.push(...epnTransactions(j, EPN_CURRENCY)));
        return { sales: latestPerSale(records), records: records.length, ...shape };
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  })();
  const [daily, tdr] = await Promise.allSettled([dailyRun, tdrRun]);
  if (daily.status === "rejected" && tdr.status === "rejected") throw daily.reason;
  const d = daily.status === "fulfilled" ? daily.value : null;
  const t = tdr.status === "fulfilled" ? tdr.value : null;
  const tdrDays = t ? txnDays(t.sales) : [];
  const days = d?.days.length ? d.days : tdrDays;
  const tags = t?.sales.length ? tagDays(t.sales) : undefined;

  if (!days.length) {
    const unread = [d, t].find((r) => r && r.rows > 0);
    if (unread) return { status: "error", days: [], detail: `eBay sent ${unread.rows} rows but no date/earnings column was readable. Columns: ${unread.columns.join(", ").slice(0, 200)}` };
    return { status: "ok", days: [], detail: `Connected, but eBay reports no earnings since ${EARNINGS_SINCE}. New sales take up to 48 hours to appear.` };
  }
  // Both totals side by side, so a mismatch with eBay's own dashboard is visible.
  const parts = [`Amounts in ${EPN_CURRENCY}, your EPN account currency (set EPN_CURRENCY if yours differs).`];
  if (d?.days.length) parts.push(`Daily report all-time ${EPN_CURRENCY} ${money2(sumCents(d.days))}.`);
  if (t) parts.push(`Transaction report ${EPN_CURRENCY} ${money2(sumCents(tdrDays))} from ${t.sales.length} sales (${t.records} records). Its columns: ${t.columns.join(", ").slice(0, 300)}.`);
  else if (tdr.status === "rejected") parts.push(`Transaction report unavailable (${tdr.reason instanceof Error ? scrubSecrets(tdr.reason.message).slice(0, 80) : "failed"}), so no tag breakdown.`);
  parts.push("New sales take up to 48 hours to appear.");
  if (d?.duplicates) parts.push(`${d.duplicates} repeated daily rows ignored.`);
  const checks: NonNullable<SourceResult["checks"]> = [];
  if (d?.days.length) {
    checks.push({ label: "Daily report · Earnings column", counted: true, days: d.parts.earnings });
    checks.push({ label: "Daily report · Other earnings column", counted: true, days: d.parts.other });
  }
  if (t) {
    checks.push({ label: `Transaction report · ${t.sales.length} sales (latest record of each)`, counted: !d?.days.length, days: tdrDays });
    checks.push({ label: "Transaction report · of which pending", counted: false, days: tdrDays.map((x) => ({ ...x, cents: x.pendingCents ?? 0 })) });
  }
  return { status: "ok", days, tags, checks, detail: parts.join(" ") };
};

// ── Google AdSense ───────────────────────────────────────────────────────────
function adsenseAccount(): string | null {
  const explicit = (process.env.ADSENSE_ACCOUNT_ID ?? "").trim();
  if (/^pub-\d{16}$/.test(explicit)) return explicit;
  const m = /^ca-(pub-\d{16})$/.exec((process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? "").trim());
  return m ? m[1] : null;
}

const fetchAdsense: Fetcher = async () => {
  const id = process.env.ADSENSE_API_CLIENT_ID;
  const secret = process.env.ADSENSE_API_CLIENT_SECRET;
  const refresh = process.env.ADSENSE_API_REFRESH_TOKEN;
  const account = adsenseAccount();
  if (!id || !secret || !refresh) return notConfigured("Set ADSENSE_API_CLIENT_ID, ADSENSE_API_CLIENT_SECRET and ADSENSE_API_REFRESH_TOKEN (a Google OAuth client with the AdSense read-only scope).");
  if (!account) return notConfigured("Set ADSENSE_ACCOUNT_ID (pub-…) or NEXT_PUBLIC_ADSENSE_CLIENT_ID.");
  const tok = (await getJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  })) as { access_token?: string };
  if (!tok?.access_token) throw new Error("Google did not return an access token");
  const [y0, m0, d0] = EARNINGS_SINCE.split("-").map(Number);
  const [y1, m1, d1] = dayIn(Date.now()).split("-").map(Number);
  const q = new URLSearchParams({
    dateRange: "CUSTOM",
    "startDate.year": String(y0),
    "startDate.month": String(m0),
    "startDate.day": String(d0),
    "endDate.year": String(y1),
    "endDate.month": String(m1),
    "endDate.day": String(d1),
    metrics: "ESTIMATED_EARNINGS",
    dimensions: "DATE",
    currencyCode: "USD",
  });
  const json = await getJson(`https://adsense.googleapis.com/v2/accounts/${account}/reports:generate?${q}`, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  return { status: "ok", days: adsenseDays(json), detail: "Estimated earnings, as AdSense reports them." };
};

// ── Mediavine (no API): entries typed in on the dashboard ───────────────────
const fetchMediavine: Fetcher = async () => {
  const rows = await prisma.manualEarning.findMany({
    where: { source: "mediavine" },
    select: { day: true, currency: true, amountCents: true },
    orderBy: { day: "asc" },
    take: 5000,
  });
  if (!rows.length) return notConfigured("Mediavine has no API: add its earnings below from the Mediavine dashboard.");
  return { status: "ok", days: mergeDays(rows.map((r) => ({ day: r.day, currency: r.currency, cents: r.amountCents }))), detail: "Entered by hand." };
};

const FETCHERS: Record<EarningsSourceKey, Fetcher> = {
  stripe: fetchStripe,
  tcgplayer: fetchImpact,
  ebay: fetchEpn,
  adsense: fetchAdsense,
  mediavine: fetchMediavine,
};

export const SOURCE_KEYS = Object.keys(FETCHERS) as EarningsSourceKey[];

async function load(key: EarningsSourceKey, fresh: boolean): Promise<SourceResult> {
  const hit = memo.get(key);
  if (!fresh && hit && Date.now() - hit.fetchedAt < TTL_MS) return hit;
  let res: SourceResult;
  try {
    res = { key, fetchedAt: Date.now(), ...(await FETCHERS[key]()) };
  } catch (e) {
    console.error(`[earnings] ${key} failed:`, e);
    // An error message from the API, never the credentials (they are only ever in headers).
    res = { key, fetchedAt: Date.now(), status: "error", detail: e instanceof Error ? scrubSecrets(e.message).slice(0, 200) : "Request failed", days: hit?.days ?? [] };
  }
  memo.set(key, res);
  return res;
}

/**
 * An API's error text, with anything key-shaped removed: Stripe echoes the key it
 * rejected ("Invalid API Key provided: sk_live_…"), and this text is shown on the
 * dashboard and sent in the ops email.
 */
export function scrubSecrets(msg: string): string {
  return msg
    .replace(/\b(sk|rk|pk|whsec)_[A-Za-z0-9_*]+/g, "[key]")
    .replace(/\b(ya29\.|1\/\/)[A-Za-z0-9._\-]+/g, "[token]")
    .replace(/(Basic|Bearer)\s+[A-Za-z0-9+/=._\-]+/gi, "$1 [hidden]");
}

/** Every source, fetched in parallel. `fresh` skips the 30-minute memo. */
export function loadEarnings(fresh = false): Promise<SourceResult[]> {
  return Promise.all(SOURCE_KEYS.map((k) => load(k, fresh)));
}

/** For the ops monitor: which sources are set up and whether they answer. Names and status only. */
export async function earningsHealth(): Promise<{ key: EarningsSourceKey; status: SourceResult["status"]; detail?: string }[]> {
  const all = await loadEarnings(false);
  return all.map((s) => ({ key: s.key, status: s.status, detail: s.status === "error" ? s.detail : undefined }));
}

/** Drop the memo for one source (after a manual entry changes). */
export function forgetEarnings(key: EarningsSourceKey): void {
  memo.delete(key);
}
