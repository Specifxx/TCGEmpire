/**
 * SEARCH CONSOLE IDENTIFIER REPORT, read-only.
 *
 * Do people find us by a product's code? For every property GSC_SA_KEY can read, the last
 * DAYS days (default 90) of query x page rows, sorted into identifier kinds:
 *
 *   card-number  a set prefix and a number: OP01-001, BT25-104, GD01-012, OGN-045, ST10-005
 *   fraction     a collector number over the set size: 123/198, 4/102
 *   barcode      12 to 14 digits (UPC-A, EAN-13 / JAN, GTIN-14) or EAN-8
 *   asin         an Amazon ASIN (B0 and eight more)
 *   set-code     a short code alone: sv3pt5, op09, eb02, bt25, rb01, fb05
 *   code         any other token mixing letters and digits (part numbers, model codes, SKUs)
 *
 * Prints each property's identifier share (impressions, clicks) and its top identifier
 * queries with the page Google showed. A baseline to read again after identifiers ship.
 * Search terms only, aggregate and anonymised by Google. Writes nothing.
 *
 * Usage: GSC_SA_KEY=... DAYS=90 npx tsx scripts/gsc-identifiers.ts
 */
import { createSign } from "node:crypto";

const DAYS = Math.max(7, Math.min(480, Number(process.env.DAYS ?? 90)));
const DAY = 86_400_000;
type Row = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

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

async function query(tok: string, property: string, start: string, end: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let startRow = 0; startRow < 100_000; startRow += 25_000) {
    const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["query", "page"], rowLimit: 25_000, startRow }),
    });
    if (!r.ok) throw new Error(`searchAnalytics ${r.status}`);
    const rows = ((await r.json()) as { rows?: Row[] }).rows ?? [];
    out.push(...rows);
    if (rows.length < 25_000) break;
  }
  return out;
}

const KINDS: [string, RegExp][] = [
  ["card-number", /\b[a-z]{1,5}\d{0,3}[a-z]?-[a-z]?\d{2,4}[a-z]?\b/i],
  ["fraction", /\b(?!1\s?\/\s?(144|100|60|48|72|35|24|12)\b)\d{1,3}\s?\/\s?\d{1,3}\b/], // not a kit scale (1/144)
  ["barcode", /\b(\d{12,14}|\d{8})\b/],
  ["asin", /\bb0[a-z0-9]{8}\b/i],
  ["set-code", /\b(sv|swsh|sm|xy|bw|op|eb|st|prb|bt|ex|fb|ogn|sfd|rb|gd|ua|me|pr|lc|tfc|rotf|itk|urs|ssk|azs|ari|cp|ds)\d{1,2}(pt5|\.5|a|b)?\b/i],
  ["code", /\b(?=[a-z0-9-]*\d)(?=[a-z0-9-]*[a-z])[a-z0-9]+(-[a-z0-9]+)*\b/i],
];
// Tokens that mix letters and digits but are not product codes.
const NOT_CODE = /^(\d{4}s?|\d+(st|nd|rd|th|k|p|ml|l|g|oz|mm|cm|x|gb|tb|mp|fps|hz|v|w|pcs|pc|pack|packs)|ps[2-5]|x\d+|v\d|2077|4k|8k|mk\d|ii+)$/i;

function kindOf(q: string): string | null {
  for (const [k, re] of KINDS) {
    if (k !== "code") {
      if (re.test(q)) return k;
      continue;
    }
    const toks = q.split(/\s+/).filter((t) => /\d/.test(t) && /[a-z]/i.test(t) && !NOT_CODE.test(t));
    if (toks.length) return k;
  }
  return null;
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";

async function main() {
  if (!process.env.GSC_SA_KEY) return console.log("GSC_SA_KEY is not set.");
  const tok = await token();
  const only = (process.env.GSC_PROPERTY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const sites = (((await (await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${tok}` } })).json()) as {
    siteEntry?: { siteUrl: string }[];
  }).siteEntry ?? []).map((s) => s.siteUrl).filter((s) => !only.length || only.includes(s)).sort();
  const end = Date.now() - 3 * DAY;
  const start = end - (DAYS - 1) * DAY;
  console.log(`Identifier queries ${ymd(start)}..${ymd(end)} (${DAYS} days), ${sites.length} properties.\n`);
  const summary: string[] = [];
  for (const site of sites) {
    let rows: Row[];
    try {
      rows = await query(tok, site, ymd(start), ymd(end));
    } catch (e) {
      console.log(`== ${site}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (!rows.length) {
      console.log(`== ${site}: no rows`);
      continue;
    }
    const byQ = new Map<string, { impr: number; clicks: number; posW: number; page: string; top: number; kind: string | null }>();
    for (const r of rows) {
      const q = r.keys[0];
      const e = byQ.get(q) ?? { impr: 0, clicks: 0, posW: 0, page: "", top: -1, kind: kindOf(q) };
      e.impr += r.impressions;
      e.clicks += r.clicks;
      e.posW += r.position * r.impressions;
      if (r.impressions > e.top) {
        e.top = r.impressions;
        e.page = path(r.keys[1]);
      }
      byQ.set(q, e);
    }
    const all = [...byQ.values()];
    const totI = all.reduce((a, e) => a + e.impr, 0);
    const totC = all.reduce((a, e) => a + e.clicks, 0);
    const ids = [...byQ.entries()].filter(([, e]) => e.kind);
    const idI = ids.reduce((a, [, e]) => a + e.impr, 0);
    const idC = ids.reduce((a, [, e]) => a + e.clicks, 0);
    const perKind = new Map<string, { n: number; i: number; c: number }>();
    for (const [, e] of ids) {
      const k = perKind.get(e.kind!) ?? { n: 0, i: 0, c: 0 };
      k.n++;
      k.i += e.impr;
      k.c += e.clicks;
      perKind.set(e.kind!, k);
    }
    const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : "0.0") + "%";
    summary.push(`${site.padEnd(44)} queries ${String(byQ.size).padStart(6)}  id-queries ${String(ids.length).padStart(5)}  impr ${String(idI).padStart(7)} of ${String(totI).padStart(8)} (${pct(idI, totI)})  clicks ${String(idC).padStart(5)} of ${String(totC).padStart(6)} (${pct(idC, totC)})`);
    console.log(`\n== ${site}: ${byQ.size} queries (${totI} impr., ${totC} clicks); identifier queries ${ids.length} (${idI} impr. ${pct(idI, totI)}, ${idC} clicks ${pct(idC, totC)})`);
    for (const [k, v] of [...perKind.entries()].sort((a, b) => b[1].i - a[1].i)) console.log(`   ${k.padEnd(12)} ${String(v.n).padStart(5)} queries ${String(v.i).padStart(7)} impr. ${String(v.c).padStart(5)} clicks`);
    console.log(`   top identifier queries (query, kind, clicks, impr., pos, page Google showed most):`);
    for (const [q, e] of ids.sort((a, b) => b[1].impr - a[1].impr).slice(0, 40))
      console.log(`   ${q.slice(0, 48).padEnd(48)} ${e.kind!.padEnd(11)} ${String(e.clicks).padStart(4)} ${String(e.impr).padStart(6)} ${(e.posW / Math.max(1, e.impr)).toFixed(1).padStart(5)}  ${e.page.slice(0, 60)}`);
  }
  console.log("\nSUMMARY (identifier share per property)");
  for (const s of summary) console.log(s);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
