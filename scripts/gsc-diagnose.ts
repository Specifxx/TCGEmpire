/**
 * SEARCH CONSOLE CLICK-DROP DIAGNOSIS — read-only.
 *
 * For each property (DIAG = comma list; empty = every property GSC_SA_KEY reads):
 * the last three settled weeks side by side, split by device, country, page type
 * (first path segment), brand vs non-brand searches, and the queries and pages that
 * lost or gained the most clicks. Separates "fewer impressions" (demand or ranking)
 * from "lower CTR" (titles, SERP features) from "worse position" (ranking).
 *
 * Usage: GSC_SA_KEY=... DIAG=sc-domain:riftcompare.com npx tsx scripts/gsc-diagnose.ts
 */
import { createSign } from "node:crypto";

const DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function token(): Promise<string> {
  const sa = JSON.parse(process.env.GSC_SA_KEY ?? "") as { client_email: string; private_key: string };
  const b64 = (b: string | Buffer) => Buffer.from(b).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const h = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const c = b64(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const s = createSign("RSA-SHA256");
  s.update(`${h}.${c}`);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${c}.${b64(s.sign(sa.private_key))}` }),
  });
  const t = ((await r.json()) as { access_token?: string }).access_token;
  if (!t) throw new Error(`token request failed (${r.status})`);
  return t;
}

type Row = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
let tok = "";
async function q(property: string, start: string, end: string, dimensions: string[], rowLimit = 25000): Promise<Row[]> {
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: start, endDate: end, dimensions, rowLimit, dataState: "final" }),
  });
  if (!r.ok) throw new Error(`searchAnalytics ${r.status}`);
  return ((await r.json()) as { rows?: Row[] }).rows ?? [];
}

type Agg = { c: number; i: number; p: number };
const agg = (rows: Row[]): Agg => {
  const c = rows.reduce((a, r) => a + r.clicks, 0);
  const i = rows.reduce((a, r) => a + r.impressions, 0);
  const p = i ? rows.reduce((a, r) => a + r.position * r.impressions, 0) / i : 0;
  return { c, i, p };
};
const fmt = (x: Agg) => `${String(x.c).padStart(5)} cl ${String(x.i).padStart(7)} im ctr ${(x.i ? (100 * x.c) / x.i : 0).toFixed(2).padStart(5)}% pos ${x.p.toFixed(1).padStart(5)}`;

function group(rows: Row[], key: (r: Row) => string): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}

function compare(title: string, weeks: Row[][], key: (r: Row) => string, top = 12) {
  const gs = weeks.map((w) => group(w, key));
  const keys = new Set(gs.flatMap((g) => [...g.keys()]));
  const list = [...keys].map((k) => ({ k, a: gs.map((g) => agg(g.get(k) ?? [])) }));
  list.sort((x, y) => Math.abs(y.a[0].c - y.a[1].c) + Math.abs(y.a[0].i - y.a[1].i) / 100 - (Math.abs(x.a[0].c - x.a[1].c) + Math.abs(x.a[0].i - x.a[1].i) / 100));
  console.log(`  -- ${title} (W0 | W1 | W2)`);
  for (const { k, a } of list.slice(0, top)) console.log(`    ${k.slice(0, 48).padEnd(48)} ${a.map(fmt).join(" | ")}`);
}

function movers(title: string, w0: Row[], w1: Row[], top = 20) {
  const m = new Map<string, { c0: number; c1: number; i0: number; i1: number; p0: number; p1: number }>();
  for (const r of w0) m.set(r.keys[0], { c0: r.clicks, c1: 0, i0: r.impressions, i1: 0, p0: r.position, p1: 0 });
  for (const r of w1) {
    const x = m.get(r.keys[0]) ?? { c0: 0, c1: 0, i0: 0, i1: 0, p0: 0, p1: 0 };
    Object.assign(x, { c1: r.clicks, i1: r.impressions, p1: r.position });
    m.set(r.keys[0], x);
  }
  const all = [...m.entries()];
  const show = (label: string, l: typeof all) => {
    console.log(`  -- ${title} ${label}: clicks W1->W0, impr W1->W0, pos W1->W0`);
    for (const [k, x] of l) console.log(`    ${k.replace(/^https?:\/\/[^/]+/, "").slice(0, 70).padEnd(70)} ${String(x.c1).padStart(4)}->${String(x.c0).padEnd(4)} ${String(x.i1).padStart(6)}->${String(x.i0).padEnd(6)} ${x.p1.toFixed(1)}->${x.p0.toFixed(1)}`);
  };
  show("LOSERS", all.sort((a, b) => a[1].c0 - a[1].c1 - (b[1].c0 - b[1].c1)).slice(0, top));
  show("GAINERS", all.sort((a, b) => b[1].c0 - b[1].c1 - (a[1].c0 - a[1].c1)).slice(0, Math.ceil(top / 2)));
  // Rank vs demand split for the queries/pages present in both weeks
  const both = all.filter(([, x]) => x.i0 > 0 && x.i1 > 0);
  const gone = all.filter(([, x]) => x.i0 === 0 && x.i1 > 0);
  const fresh = all.filter(([, x]) => x.i1 === 0 && x.i0 > 0);
  const s = (l: typeof all, f: (x: (typeof all)[0][1]) => number) => l.reduce((a, [, x]) => a + f(x), 0);
  console.log(`  -- ${title} split: in both weeks ${both.length} (clicks ${s(both, (x) => x.c1)}->${s(both, (x) => x.c0)}, impr ${s(both, (x) => x.i1)}->${s(both, (x) => x.i0)}, imp-weighted pos ${(s(both, (x) => x.p1 * x.i1) / Math.max(1, s(both, (x) => x.i1))).toFixed(1)}->${(s(both, (x) => x.p0 * x.i0) / Math.max(1, s(both, (x) => x.i0))).toFixed(1)}); only W1 ${gone.length} (clicks ${s(gone, (x) => x.c1)}, impr ${s(gone, (x) => x.i1)}); only W0 ${fresh.length} (clicks ${s(fresh, (x) => x.c0)}, impr ${s(fresh, (x) => x.i0)})`);
}

const BRAND: [RegExp, RegExp][] = [
  [/riftcompare/, /rift ?compare/],
  [/dexcompare/, /dex ?compare/],
  [/camcompare/, /cam ?compare/],
  [/compareempire/, /compare ?empire/],
  [/opcompare/, /op ?compare/],
  [/mtgcompare/, /mtg ?compare/],
  [/kaeyoung/, /kae ?young/],
];

async function diagnose(property: string) {
  const end = Date.now() - 2 * DAY; // last final-ish day
  const wk = (n: number) => [ymd(end - (n * 7 + 6) * DAY), ymd(end - n * 7 * DAY)] as const;
  const W = [wk(0), wk(1), wk(2)];
  console.log(`\n================ ${property}  W0 ${W[0].join("..")}  W1 ${W[1].join("..")}  W2 ${W[2].join("..")}`);
  const daily = await q(property, ymd(end - 41 * DAY), ymd(end), ["date"], 100);
  console.log(`  daily (date clicks/impr@pos): ${daily.map((r) => `${r.keys[0].slice(5)}:${r.clicks}/${r.impressions}@${r.position.toFixed(0)}`).join(" ")}`);
  const tot = await Promise.all(W.map(([a, b]) => q(property, a, b, ["date"], 100)));
  console.log(`  TOTAL ${tot.map((t) => fmt(agg(t))).join(" | ")}`);
  const dev = await Promise.all(W.map(([a, b]) => q(property, a, b, ["device"])));
  compare("device", dev, (r) => r.keys[0], 3);
  const ctry = await Promise.all(W.map(([a, b]) => q(property, a, b, ["country"])));
  compare("country", ctry, (r) => r.keys[0], 8);
  const app = await Promise.all(W.map(([a, b]) => q(property, a, b, ["searchAppearance"]).catch(() => [] as Row[])));
  compare("search appearance", app, (r) => r.keys[0], 8);
  const pages = await Promise.all(W.map(([a, b]) => q(property, a, b, ["page"])));
  compare("page type", pages, (r) => {
    const u = new URL(r.keys[0]);
    const seg = u.pathname.split("/").filter(Boolean);
    return `${u.host.replace(/^www\./, "")} /${seg[0] ?? ""}${seg.length > 1 ? "/*" : ""}`;
  }, 16);
  movers("pages", pages[0], pages[1], 20);
  const qs = await Promise.all(W.map(([a, b]) => q(property, a, b, ["query"])));
  const brand = BRAND.find(([h]) => h.test(property))?.[1];
  if (brand) compare("brand vs non-brand", qs, (r) => (brand.test(r.keys[0].toLowerCase()) ? "brand" : "non-brand"), 2);
  const anon = W.map((_, n) => agg(tot[n]).c - agg(qs[n]).c);
  console.log(`  clicks from anonymised queries (total - named): ${anon.join(" | ")}`);
  movers("queries", qs[0], qs[1], 25);
}

async function main() {
  if (!process.env.GSC_SA_KEY) return console.log("GSC_SA_KEY is not set.");
  tok = await token();
  let props = (process.env.DIAG ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!props.length) {
    const sites = ((await (await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${tok}` } })).json()) as { siteEntry?: { siteUrl: string }[] }).siteEntry ?? [];
    props = sites.map((s) => s.siteUrl).sort();
  }
  for (const p of props) {
    try {
      await diagnose(p);
    } catch (e) {
      console.log(`== ${p}: unavailable (${(e as Error).message})`);
    }
  }
}

main().catch((e) => {
  console.log(`failed: ${(e as Error).message}`);
  process.exit(1);
});
