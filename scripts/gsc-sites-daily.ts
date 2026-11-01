/**
 * EVERY SITE'S SEARCH CONSOLE PULSE — read-only.
 *
 * For every property GSC_SA_KEY can read: clicks and impressions per day for the
 * last 35 days, week-over-week totals, and how many distinct pages earned an
 * impression (the leading indicator of indexing). One table for the whole family,
 * so growth targets are measured from one place. Counts only, no search terms.
 *
 * Usage: GSC_SA_KEY=... npx tsx scripts/gsc-sites-daily.ts
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

type Row = { keys: string[]; clicks: number; impressions: number; position: number };
async function query(tok: string, property: string, body: object): Promise<Row[]> {
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`searchAnalytics ${r.status}`);
  return ((await r.json()) as { rows?: Row[] }).rows ?? [];
}

async function main() {
  if (!process.env.GSC_SA_KEY) return console.log("GSC_SA_KEY is not set.");
  const tok = await token();
  const sites = ((await (await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${tok}` } })).json()) as {
    siteEntry?: { siteUrl: string; permissionLevel: string }[];
  }).siteEntry ?? [];
  const end = Date.now() - DAY;
  const start = end - 34 * DAY;
  const pageStart = Date.now() - 31 * DAY;
  const pageEnd = Date.now() - 3 * DAY;
  console.log(`Properties: ${sites.length}. Days ${ymd(start)}..${ymd(end)} (last 2 provisional).\n`);
  for (const { siteUrl } of sites.sort((a, b) => a.siteUrl.localeCompare(b.siteUrl))) {
    try {
      const days = (await query(tok, siteUrl, { startDate: ymd(start), endDate: ymd(end), dimensions: ["date"], rowLimit: 100 })).sort((a, b) => a.keys[0].localeCompare(b.keys[0]));
      const pages = await query(tok, siteUrl, { startDate: ymd(pageStart), endDate: ymd(pageEnd), dimensions: ["page"], rowLimit: 25000 });
      const clicks = days.reduce((a, r) => a + r.clicks, 0);
      if (!days.length) {
        console.log(`== ${siteUrl}: no data`);
        continue;
      }
      // Whole weeks ending on the last settled day (end - 2 days).
      const settled = ymd(end - 2 * DAY);
      const settledRows = days.filter((r) => r.keys[0] <= settled);
      const weeks: { c: number; i: number }[] = [];
      for (let w = 0; w < 4; w++) {
        const hi = ymd(end - 2 * DAY - w * 7 * DAY);
        const lo = ymd(end - 2 * DAY - (w * 7 + 6) * DAY);
        const rows = settledRows.filter((r) => r.keys[0] >= lo && r.keys[0] <= hi);
        weeks.push({ c: rows.reduce((a, r) => a + r.clicks, 0), i: rows.reduce((a, r) => a + r.impressions, 0) });
      }
      const wow = weeks[1].c ? (((weeks[0].c - weeks[1].c) / weeks[1].c) * 100).toFixed(0) + "%" : "n/a";
      console.log(`== ${siteUrl}: 35d clicks ${clicks}; pages with impressions (28d) ${pages.length}, with clicks ${pages.filter((p) => p.clicks > 0).length}`);
      console.log(`   weekly clicks (newest first) ${weeks.map((w) => w.c).join(" / ")}  impr ${weeks.map((w) => w.i).join(" / ")}  WoW ${wow}`);
      console.log(`   daily ${days.slice(-14).map((r) => `${r.keys[0].slice(5)}:${r.clicks}/${r.impressions}@${r.position.toFixed(1)}`).join(" ")}`);
    } catch (e) {
      console.log(`== ${siteUrl}: unavailable (${(e as Error).message})`);
    }
  }
}
main().catch((e) => {
  console.log(`failed: ${(e as Error).message}`);
  process.exit(1);
});
