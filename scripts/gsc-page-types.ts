/**
 * TEMPORARY read-only probe (thread "Decide sealed-first engine"): for every
 * Search Console property, clicks / impressions over 90 days bucketed by the
 * first path segment (card, sealed, sets, blog, product…), with how many pages
 * in each bucket earned any impression or click. Counts only, no search terms.
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
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${c}.${b64(s.sign(sa.private_key))}` }) });
  const t = ((await r.json()) as { access_token?: string }).access_token;
  if (!t) throw new Error(`token ${r.status}`);
  return t;
}
type Row = { keys: string[]; clicks: number; impressions: number; position: number };
async function query(tok: string, p: string, body: object): Promise<Row[]> {
  const out: Row[] = [];
  for (let startRow = 0; ; startRow += 25000) {
    const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(p)}/searchAnalytics/query`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...body, rowLimit: 25000, startRow }) });
    if (!r.ok) throw new Error(`query ${r.status}`);
    const rows = ((await r.json()) as { rows?: Row[] }).rows ?? [];
    out.push(...rows);
    if (rows.length < 25000) return out;
  }
}
const REGIONS = new Set(["us", "uk", "au", "ca", "nz", "eu", "sg", "jp"]);
function bucket(url: string): string {
  const segs = new URL(url).pathname.split("/").filter(Boolean);
  if (segs.length && REGIONS.has(segs[0])) segs.shift();
  if (!segs.length) return "(home)";
  return segs.length === 1 ? `/${segs[0]} (hub)` : `/${segs[0]}/*`;
}
async function main() {
  const tok = await token();
  const sites = ((await (await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${tok}` } })).json()) as { siteEntry?: { siteUrl: string }[] }).siteEntry ?? [];
  const end = Date.now() - 3 * DAY, start = end - 90 * DAY;
  console.log(`Window ${ymd(start)}..${ymd(end)}`);
  for (const { siteUrl } of sites.sort((a, b) => a.siteUrl.localeCompare(b.siteUrl))) {
    try {
      const rows = await query(tok, siteUrl, { startDate: ymd(start), endDate: ymd(end), dimensions: ["page"] });
      if (!rows.length) { console.log(`\n== ${siteUrl}: no rows`); continue; }
      const b = new Map<string, { pages: number; clicked: number; clicks: number; imps: number; imp10: number }>();
      for (const r of rows) {
        const k = bucket(r.keys[0]);
        const e = b.get(k) ?? { pages: 0, clicked: 0, clicks: 0, imps: 0, imp10: 0 };
        e.pages++; e.clicks += r.clicks; e.imps += r.impressions; if (r.clicks > 0) e.clicked++; if (r.impressions >= 10) e.imp10++;
        b.set(k, e);
      }
      const tc = rows.reduce((a, r) => a + r.clicks, 0), ti = rows.reduce((a, r) => a + r.impressions, 0);
      console.log(`\n== ${siteUrl}: ${tc} clicks, ${ti} imps, ${rows.length} pages`);
      console.log("bucket | pages w/ imps | pages >=10 imps | pages w/ click | clicks | imps");
      for (const [k, e] of [...b].sort((x, y) => y[1].clicks - x[1].clicks || y[1].imps - x[1].imps).slice(0, 18))
        console.log(`${k} | ${e.pages} | ${e.imp10} | ${e.clicked} | ${e.clicks} | ${e.imps}`);
      const top = rows.filter((r) => r.clicks > 0).sort((a, b) => b.clicks - a.clicks).slice(0, 12);
      console.log("top pages: " + top.map((r) => `${new URL(r.keys[0]).pathname} ${r.clicks}`).join(", "));
    } catch (e) { console.log(`\n== ${siteUrl}: ${(e as Error).message}`); }
  }
}
main();
