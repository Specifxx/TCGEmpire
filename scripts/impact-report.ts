/**
 * THE DAILY IMPACT REPORT — read-only, aggregate-only.
 *
 * WHY THIS EXISTS. On 2026-10-14 the owner asked whether the daily search allowance
 * (2026-10-09) and AdSense ads were hurting visitors, buy clicks and sign-ups. The
 * funnel report buckets by week, which is too coarse to see a change that is five
 * days old. This prints one row per UTC day for the last DAYS days (default 35) and
 * the average of each window around the change dates, from every first-party series
 * the site keeps:
 *
 *   Google      Search Console clicks, impressions, CTR, position (GSC_SA_KEY)
 *   Views       card page views per day: the day-over-day rise of SUM(Card.viewCount)
 *               in DemandSnapshot (one per browser per card per day). Snapshots are
 *               taken by the price import, so a day is "since the previous import".
 *   Searches    the same for Card.searchCount
 *   Buy clicks  ClickEvent rows (outbound store clicks), history database
 *   Accounts    new User rows, and those with signupSource = search_limit
 *   Premium     PremiumClick rows: all, the search-limit panel, and checkouts
 *
 * Ratios (buy clicks per 100 Google clicks / per 100 card views) separate "fewer
 * people came" from "the people who came did less".
 *
 * NEVER WRITES. Aggregate only — no emails, names, ids or paths reach the log.
 *
 * Usage: DAYS=35 CHANGE_DATES=2026-10-09 npx tsx scripts/impact-report.ts
 */
import { createSign } from "node:crypto";
import { prisma } from "../src/lib/db";
import { dbHistory } from "../src/lib/db-history";
import { NOT_SEED_WHERE } from "../src/lib/premium";

const DAYS = Math.max(7, Math.min(120, Number(process.env.DAYS ?? 35)));
const DAY = 86_400_000;
const CHANGE_DATES = (process.env.CHANGE_DATES || "2026-10-09")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));

type Row = {
  gscClicks: number | null;
  gscImpr: number | null;
  gscPos: number | null;
  views: number | null;
  searches: number | null;
  buy: number;
  buySingle: number;
  buySealed: number;
  accounts: number;
  accSearchLimit: number;
  premClicks: number;
  premLimitSearch: number;
  checkouts: number;
};
const empty = (): Row => ({
  gscClicks: null,
  gscImpr: null,
  gscPos: null,
  views: null,
  searches: null,
  buy: 0,
  buySingle: 0,
  buySealed: 0,
  accounts: 0,
  accSearchLimit: 0,
  premClicks: 0,
  premLimitSearch: 0,
  checkouts: 0,
});
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function gsc(start: string, end: string): Promise<Map<string, { clicks: number; impr: number; pos: number }>> {
  const out = new Map<string, { clicks: number; impr: number; pos: number }>();
  const raw = process.env.GSC_SA_KEY;
  if (!raw) {
    console.log("Search Console: GSC_SA_KEY not set, Google columns blank.");
    return out;
  }
  try {
    const sa = JSON.parse(raw) as { client_email: string; private_key: string };
    const b64 = (b: string | Buffer) => Buffer.from(b).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const h = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const c = b64(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/webmasters.readonly",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
    const s = createSign("RSA-SHA256");
    s.update(`${h}.${c}`);
    const jwt = `${h}.${c}.${b64(s.sign(sa.private_key))}`;
    const tr = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    });
    const tok = ((await tr.json()) as { access_token?: string }).access_token;
    if (!tok) throw new Error(`token request failed (${tr.status})`);
    const property = process.env.GSC_PROPERTY || "https://riftcompare.com/";
    const r = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["date"], rowLimit: 500 }),
      },
    );
    if (!r.ok) throw new Error(`searchAnalytics ${r.status}`);
    const j = (await r.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] };
    for (const row of j.rows ?? []) out.set(row.keys[0], { clicks: row.clicks, impr: row.impressions, pos: row.position });
  } catch (e) {
    console.log(`Search Console unavailable: ${(e as Error).message}`);
  }
  return out;
}

async function main() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const first = new Date(today.getTime() - (DAYS - 1) * DAY);
  const days = Array.from({ length: DAYS }, (_, i) => ymd(new Date(first.getTime() + i * DAY)));
  const rows = new Map(days.map((d) => [d, empty()]));
  const at = (d: Date) => rows.get(ymd(d));

  // Google, by Search Console's own (Pacific) day; the last ~2 days are not final yet.
  const g = await gsc(days[0], days[days.length - 1]);
  for (const [d, v] of g) {
    const r = rows.get(d);
    if (r) Object.assign(r, { gscClicks: v.clicks, gscImpr: v.impr, gscPos: v.pos });
  }

  // Card views and searches: diff of the cumulative totals across snapshot days.
  const snap = await prisma.demandSnapshot.groupBy({
    by: ["day"],
    where: { day: { gte: new Date(first.getTime() - 2 * DAY) } },
    _sum: { viewCount: true, searchCount: true },
    _count: { _all: true },
    orderBy: { day: "asc" },
  });
  for (let i = 1; i < snap.length; i++) {
    const a = snap[i - 1];
    const b = snap[i];
    const gap = Math.round((b.day.getTime() - a.day.getTime()) / DAY);
    const r = rows.get(ymd(b.day));
    if (!r || gap < 1) continue;
    const dv = (b._sum.viewCount ?? 0) - (a._sum.viewCount ?? 0);
    const ds = (b._sum.searchCount ?? 0) - (a._sum.searchCount ?? 0);
    // A negative step is a catalogue change (cards removed) or a restore, not demand.
    r.views = dv >= 0 ? dv / gap : null;
    r.searches = ds >= 0 ? ds / gap : null;
  }

  const clicks = await dbHistory.clickEvent.findMany({
    where: { createdAt: { gte: first } },
    select: { createdAt: true, kind: true },
  });
  for (const c of clicks) {
    const r = at(c.createdAt);
    if (!r) continue;
    r.buy++;
    if (c.kind === "sealed") r.buySealed++;
    else r.buySingle++;
  }

  const users = await prisma.user.findMany({
    where: { createdAt: { gte: first }, ...NOT_SEED_WHERE },
    select: { createdAt: true, signupSource: true },
  });
  const sources = new Map<string, { before: number; after: number }>();
  const split = CHANGE_DATES[0] ?? "9999-12-31";
  for (const u of users) {
    const r = at(u.createdAt);
    if (!r) continue;
    r.accounts++;
    if (u.signupSource === "search_limit") r.accSearchLimit++;
    const k = u.signupSource ?? "(none)";
    const s = sources.get(k) ?? { before: 0, after: 0 };
    if (ymd(u.createdAt) < split) s.before++;
    else s.after++;
    sources.set(k, s);
  }

  const pcs = await prisma.premiumClick.findMany({
    where: { createdAt: { gte: first } },
    select: { createdAt: true, source: true, surface: true },
  });
  const pcBySource = new Map<string, { before: number; after: number }>();
  for (const p of pcs) {
    const r = at(p.createdAt);
    if (!r) continue;
    r.premClicks++;
    if (p.source === "limit:search" || p.surface === "limit:search") r.premLimitSearch++;
    if (p.source === "checkout") r.checkouts++;
    const k = p.source === "checkout" ? `checkout <- ${p.surface ?? "(none)"}` : p.source;
    const s = pcBySource.get(k) ?? { before: 0, after: 0 };
    if (ymd(p.createdAt) < split) s.before++;
    else s.after++;
    pcBySource.set(k, s);
  }

  // ── Print ───────────────────────────────────────────────────────────────
  const f = (v: number | null, w: number, dp = 0) => (v == null ? "-" : v.toFixed(dp)).padStart(w);
  const head =
    "day         gClick  gImpr  gPos  views  srch   buy  sngl  seal  acct  aSL  prem  pLS  chk  buy/100g  buy/100v";
  console.log(`\nDaily, UTC (Google columns are Search Console's Pacific day). Change dates: ${CHANGE_DATES.join(", ") || "none"}\n`);
  console.log(head);
  for (const d of days) {
    const r = rows.get(d)!;
    const mark = CHANGE_DATES.includes(d) ? " <" : "";
    console.log(
      `${d}  ${f(r.gscClicks, 6)} ${f(r.gscImpr, 6)} ${f(r.gscPos, 5, 1)} ${f(r.views, 6)} ${f(r.searches, 5)} ${f(r.buy, 5)} ${f(r.buySingle, 5)} ${f(r.buySealed, 5)} ${f(r.accounts, 5)} ${f(r.accSearchLimit, 4)} ${f(r.premClicks, 5)} ${f(r.premLimitSearch, 4)} ${f(r.checkouts, 4)} ${f(r.gscClicks ? (100 * r.buy) / r.gscClicks : null, 9, 1)} ${f(r.views ? (100 * r.buy) / r.views : null, 9, 1)}${mark}`,
    );
  }

  // Windows: before the first change, and between/after each change. Today is partial and excluded.
  const bounds = [days[0], ...CHANGE_DATES.filter((d) => d > days[0] && d <= days[days.length - 1]), ymd(today)];
  console.log("\nDaily averages per window (today excluded; the last 2 Google days are provisional):\n");
  console.log("window                     days  gClick   gImpr   views   srch    buy   acct   prem  chk   buy/100g  buy/100v");
  for (let i = 0; i < bounds.length - 1; i++) {
    const ds = days.filter((d) => d >= bounds[i] && d < bounds[i + 1]);
    if (!ds.length) continue;
    const avg = (pick: (r: Row) => number | null) => {
      const v = ds.map((d) => pick(rows.get(d)!)).filter((x): x is number => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const gDays = ds.filter((d) => rows.get(d)!.gscClicks != null);
    const vDays = ds.filter((d) => rows.get(d)!.views != null);
    const buyG = gDays.reduce((a, d) => a + rows.get(d)!.buy, 0);
    const gc = gDays.reduce((a, d) => a + (rows.get(d)!.gscClicks ?? 0), 0);
    const buyV = vDays.reduce((a, d) => a + rows.get(d)!.buy, 0);
    const vc = vDays.reduce((a, d) => a + (rows.get(d)!.views ?? 0), 0);
    console.log(
      `${`${bounds[i]}..${ymd(new Date(Date.parse(bounds[i + 1]) - DAY))}`.padEnd(25)} ${String(ds.length).padStart(5)} ${f(avg((r) => r.gscClicks), 7, 1)} ${f(avg((r) => r.gscImpr), 7)} ${f(avg((r) => r.views), 7)} ${f(avg((r) => r.searches), 6)} ${f(avg((r) => r.buy), 6, 1)} ${f(avg((r) => r.accounts), 6, 1)} ${f(avg((r) => r.premClicks), 6, 1)} ${f(avg((r) => r.checkouts), 4, 1)} ${f(gc ? (100 * buyG) / gc : null, 10, 1)} ${f(vc ? (100 * buyV) / vc : null, 9, 1)}`,
    );
  }

  const table = (title: string, m: Map<string, { before: number; after: number }>) => {
    console.log(`\n${title} (before ${split} | from ${split}):`);
    for (const [k, v] of [...m].sort((a, b) => b[1].before + b[1].after - (a[1].before + a[1].after)))
      console.log(`  ${k.padEnd(40)} ${String(v.before).padStart(5)} | ${String(v.after).padStart(5)}`);
  };
  table("New accounts by signup source", sources);
  table("Premium clicks by surface", pcBySource);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await dbHistory.$disconnect();
  });
