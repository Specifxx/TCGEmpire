/**
 * SEARCH CONSOLE CANNIBALISATION REPORT — read-only, every property the service account can read.
 *
 * "One page, one phrase" (docs/CURRENT-STATE.md): when two of a site's own pages both get
 * impressions for one query, Google splits them and neither ranks as well as one would. For
 * every Search Console property GSC_SA_KEY can read (Rift Compare and the sister sites it has
 * been added to), prints the queries where two or more pages of that site showed, with each
 * page's impressions, clicks and position, so the weaker page can be merged, redirected or
 * retitled. Also the top pages, for context. Search terms only: no revenue, no visitor data.
 *
 * Usage: GSC_SA_KEY=... DAYS=90 npx tsx scripts/gsc-cannibal.ts
 */
import { createSign } from "node:crypto";

const DAYS = Math.max(7, Math.min(480, Number(process.env.DAYS ?? 90)));
const MIN_IMPR = Number(process.env.MIN_IMPR ?? 5);
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

async function sites(tok: string): Promise<string[]> {
  const r = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error(`sites ${r.status}`);
  const j = (await r.json()) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] };
  return (j.siteEntry ?? []).filter((e) => e.permissionLevel !== "siteUnverifiedUser").map((e) => e.siteUrl);
}

async function query(tok: string, property: string, start: string, end: string, dimensions: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let startRow = 0; startRow < 50_000; startRow += 25_000) {
    const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions, rowLimit: 25_000, startRow }),
    });
    if (!r.ok) throw new Error(`searchAnalytics ${r.status}`);
    const rows = ((await r.json()) as { rows?: Row[] }).rows ?? [];
    out.push(...rows);
    if (rows.length < 25_000) break;
  }
  return out;
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";

async function main() {
  if (!process.env.GSC_SA_KEY) return console.log("GSC_SA_KEY is not set.");
  const tok = await token();
  const end = Date.now() - 3 * DAY;
  const start = end - (DAYS - 1) * DAY;
  const props = await sites(tok);
  console.log(`Properties this key can read: ${props.join(", ") || "none"}`);
  console.log(`Window ${ymd(start)}..${ymd(end)} (${DAYS} days); a page counts when it had ${MIN_IMPR}+ impressions for the query.\n`);
  for (const prop of props) {
    let rows: Row[];
    let pages: Row[];
    try {
      [rows, pages] = await Promise.all([query(tok, prop, ymd(start), ymd(end), ["query", "page"]), query(tok, prop, ymd(start), ymd(end), ["page"])]);
    } catch (e) {
      console.log(`\n=== ${prop}: not readable (${(e as Error).message})`);
      continue;
    }
    // Hreflang twins (/au/x and /us/x) are one page in different markets, not a split: group by the path without its region.
    const byQuery = new Map<string, Row[]>();
    for (const r of rows) if (r.impressions >= MIN_IMPR) byQuery.set(r.keys[0], [...(byQuery.get(r.keys[0]) ?? []), r]);
    const split = [...byQuery]
      .map(([q, rs]) => ({ q, rs: rs.sort((a, b) => b.impressions - a.impressions), impr: rs.reduce((a, r) => a + r.impressions, 0) }))
      .filter((x) => x.rs.length >= 2)
      .sort((a, b) => b.impr - a.impr);
    const clicks = pages.reduce((a, r) => a + r.clicks, 0);
    console.log(`\n=== ${prop}: ${clicks} clicks, ${pages.length} pages with impressions, ${split.length} queries shown on 2+ pages`);
    console.log("TOP PAGES");
    for (const r of [...pages].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 25))
      console.log(`  ${path(r.keys[0]).slice(0, 80).padEnd(80)} ${String(r.clicks).padStart(5)} clk ${String(r.impressions).padStart(7)} impr  pos ${r.position.toFixed(1)}`);
    console.log("SPLIT QUERIES (query, then each page: impressions / clicks / position)");
    for (const x of split.slice(0, 60)) {
      console.log(`  "${x.q}" (${x.impr} impr)`);
      for (const r of x.rs.slice(0, 5)) console.log(`      ${path(r.keys[1]).slice(0, 78).padEnd(78)} ${String(r.impressions).padStart(6)} / ${String(r.clicks).padStart(4)} / ${r.position.toFixed(1)}`);
    }
    // Page pairs that share the most split queries: the candidates to merge.
    const pairs = new Map<string, { n: number; impr: number }>();
    for (const x of split) {
      const ps = x.rs.map((r) => path(r.keys[1]));
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) {
          const k = [ps[i], ps[j]].sort().join("  <->  ");
          const v = pairs.get(k) ?? { n: 0, impr: 0 };
          pairs.set(k, { n: v.n + 1, impr: v.impr + x.impr });
        }
    }
    console.log("PAGE PAIRS SHARING THE MOST QUERIES");
    for (const [k, v] of [...pairs].sort((a, b) => b[1].impr - a[1].impr).slice(0, 25)) console.log(`  ${String(v.n).padStart(4)} queries ${String(v.impr).padStart(7)} impr  ${k}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
