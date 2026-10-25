import { prisma } from "@/lib/db";
import { stripe, stripeEnabled } from "@/lib/stripe";
import {
  adsenseDays,
  dayIn,
  epnDays,
  reportShape,
  impactDays,
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
const fetchImpact: Fetcher = async () => {
  const sid = process.env.IMPACT_ACCOUNT_SID;
  const token = process.env.IMPACT_AUTH_TOKEN;
  if (!sid || !token) return notConfigured("Set IMPACT_ACCOUNT_SID and IMPACT_AUTH_TOKEN (Impact → Settings → API).");
  const headers = { Authorization: basic(sid, token), Accept: "application/json" };
  const days: DayAmount[] = [];
  for (const [from, to] of windows(EARNINGS_SINCE, dayIn(Date.now()), 30)) {
    let url: string | null =
      `https://api.impact.com/Mediapartners/${encodeURIComponent(sid)}/Actions?ActionDateStart=${from}T00:00:00Z&ActionDateEnd=${to}T23:59:59Z&PageSize=1000`;
    for (let page = 0; url && page < 20; page++) {
      const json = (await getJson(url, { headers })) as { "@nextpageuri"?: string } | null;
      days.push(...impactDays(json));
      const next: string | undefined = json?.["@nextpageuri"];
      url = next ? `https://api.impact.com${next}` : null;
    }
  }
  return { status: "ok", days: mergeDays(days) };
};

// ── eBay Partner Network ─────────────────────────────────────────────────────
// The daily report's id. eBay retired "ebay_partner_perf_by_day" for "_v2"
// (2026-10-25, the dashboard showed the API's error); EPN_DAILY_REPORT overrides
// it without a code change if eBay renames it again.
export const EPN_DAILY_REPORT = /^[a-z0-9_]+$/.test(process.env.EPN_DAILY_REPORT ?? "") ? process.env.EPN_DAILY_REPORT! : "ebay_partner_perf_by_day_v2";
// The request follows eBay's own guide ("Partner Reporting via the New API
// Endpoints"): CAMPAIGN_ID=0 and CHECKOUT_SITE=0 ask for every campaign and site.
// Without them the report answered 200 with no rows (2026-10-25: "Connected" and
// $0 for hours after the keys went in). If the daily report still has nothing,
// the Transaction Detail report (one row per sale, EventDate + Earnings) is read
// instead, and a response whose columns don't parse says so rather than showing $0.
const EPN_TDR_REPORTS = ["ebay_partner_transaction_detail", "ebay_partner_transaction_detail_v2"];

async function epnReport(sid: string, headers: Record<string, string>, report: string, params: string): Promise<{ days: DayAmount[]; rows: number; columns: string[] }> {
  const days: DayAmount[] = [];
  let rows = 0;
  let columns: string[] = [];
  for (const [from, to] of windows(EARNINGS_SINCE, dayIn(Date.now()), 31)) {
    let url: string | null = `https://api.partner.ebay.com/Mediapartners/${encodeURIComponent(sid)}/Reports/${report}.json?${params}&START_DATE=${from}&END_DATE=${to}`;
    for (let page = 0; url && page < 20; page++) {
      const json = (await getJson(url, { headers })) as { "@nextpageuri"?: string } | null;
      const shape = reportShape(json);
      rows += shape.rows;
      if (!columns.length) columns = shape.columns;
      days.push(...epnDays(json));
      const next: string | undefined = json?.["@nextpageuri"];
      url = next ? `https://api.partner.ebay.com${next}` : null;
    }
  }
  return { days: mergeDays(days), rows, columns };
}

const fetchEpn: Fetcher = async () => {
  const sid = process.env.EPN_ACCOUNT_SID;
  const token = process.env.EPN_AUTH_TOKEN;
  if (!sid || !token) return notConfigured("Set EPN_ACCOUNT_SID and EPN_AUTH_TOKEN (eBay Partner Network → cloud icon → API).");
  const headers = { Authorization: basic(sid, token), Accept: "application/json" };
  const daily = await epnReport(sid, headers, EPN_DAILY_REPORT, "CAMPAIGN_ID=0&CHECKOUT_SITE=0");
  if (daily.days.length) return { status: "ok", days: daily.days, detail: "Transactions can take up to 48 hours to appear." };
  let tdr: Awaited<ReturnType<typeof epnReport>> | null = null;
  let tdrError = "";
  for (const report of EPN_TDR_REPORTS) {
    try {
      tdr = await epnReport(sid, headers, report, "STATUS=APPROVED&STATUS=PENDING&CHECKOUT_SITE=0&CAMPAIGN_ID=0");
      break;
    } catch (e) {
      tdrError = e instanceof Error ? scrubSecrets(e.message).slice(0, 120) : "failed";
    }
  }
  if (tdr?.days.length) return { status: "ok", days: tdr.days, detail: "From eBay's transaction report. Transactions can take up to 48 hours to appear." };
  const unread = [daily, tdr].find((r) => r && r.rows > 0);
  if (unread) {
    return { status: "error", days: [], detail: `eBay sent ${unread.rows} rows but no date/earnings column was readable. Columns: ${unread.columns.join(", ").slice(0, 200)}` };
  }
  return {
    status: "ok",
    days: [],
    detail: `Connected, but eBay reports no earnings since ${EARNINGS_SINCE} (daily report and transaction report both empty${tdrError ? `; transaction report: ${tdrError}` : ""}). New sales take up to 48 hours to appear.`,
  };
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
