/**
 * PAGE SCORECARD INPUT — read-only (2026-11-23, job D of strategy/agent-reassignment-2026-11-18).
 *
 * The Monday growth review ranks every site's pages and names the bottom 20% with a fix or noindex verdict
 * (strategy/page-scorecard-<date>.html, in the project's private files). This task supplies the Google half:
 * for every Search Console property GSC_SA_KEY can read, each page's clicks, impressions and position over
 * the last 28 settled days, the 300 pages with the most impressions. Paths and counts only, no search terms,
 * no amounts. The buy-click half comes from each site's committed data/demand.json.
 *
 * Usage: GSC_SA_KEY=... npx tsx scripts/page-scorecard.ts
 */
import { createSign } from "node:crypto";

const DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const LIMIT = 300;

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

type Row = { keys: string[]; clicks: number; impressions: number; position: number };

/** One page line: path, clicks, impressions, position. Pure. */
export function pageLine(url: string, r: Pick<Row, "clicks" | "impressions" | "position">): string {
  const path = url.replace(/^https?:\/\/[^/]+/, "") || "/";
  return `P ${path}\t${r.clicks}\t${r.impressions}\t${r.position.toFixed(1)}`;
}

async function main() {
  if (!process.env.GSC_SA_KEY) return console.log("GSC_SA_KEY is not set.");
  const tok = await token();
  const sites = ((await (await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${tok}` } })).json()) as {
    siteEntry?: { siteUrl: string }[];
  }).siteEntry ?? [];
  const end = Date.now() - 3 * DAY;
  const start = end - 27 * DAY;
  console.log(`Pages by impressions, ${ymd(start)}..${ymd(end)}, top ${LIMIT} per property. Lines: P path<TAB>clicks<TAB>impressions<TAB>position\n`);
  for (const { siteUrl } of sites.sort((a, b) => a.siteUrl.localeCompare(b.siteUrl))) {
    try {
      const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: ymd(start), endDate: ymd(end), dimensions: ["page"], rowLimit: 25000 }),
      });
      if (!r.ok) throw new Error(`searchAnalytics ${r.status}`);
      const rows = (((await r.json()) as { rows?: Row[] }).rows ?? []).sort((a, b) => b.impressions - a.impressions);
      console.log(`== ${siteUrl}: ${rows.length} pages with impressions, ${rows.filter((x) => x.clicks > 0).length} with clicks`);
      for (const x of rows.slice(0, LIMIT)) console.log(pageLine(x.keys[0], x));
    } catch (e) {
      console.log(`== ${siteUrl}: unavailable (${(e as Error).message})`);
    }
  }
}

if (process.argv[1]?.endsWith("page-scorecard.ts")) main().catch((e) => {
  console.log(`failed: ${(e as Error).message}`);
  process.exit(1);
});
