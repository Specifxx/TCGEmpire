/**
 * SEARCH CONSOLE QUERY REPORT — read-only.
 *
 * What people type into Google before they reach riftcompare.com, and where we rank for it,
 * so new articles target searches we already nearly win instead of guesses. Prints, for the
 * last DAYS days (default 28):
 *
 *   - the top queries by impressions (clicks, CTR, average position);
 *   - "striking distance": position 4–20 with real impressions, where one good page can move
 *     a query onto page one or into the top three;
 *   - rising queries: last 7 days against the 21 before, per day;
 *   - the top pages, and the blog/guide pages on their own.
 *
 * Search queries are aggregate and anonymised by Google (rare queries are withheld). Writes nothing.
 *
 * Usage: GSC_SA_KEY=... DAYS=28 npx tsx scripts/gsc-queries.ts
 */
import { createSign } from "node:crypto";

const DAYS = Math.max(7, Math.min(90, Number(process.env.DAYS ?? 28)));
const DAY = 86_400_000;
type Row = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function token(): Promise<string> {
  const sa = JSON.parse(process.env.GSC_SA_KEY ?? "") as { client_email: string; private_key: string };
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
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${c}.${b64(s.sign(sa.private_key))}` }),
  });
  const t = ((await r.json()) as { access_token?: string }).access_token;
  if (!t) throw new Error(`token request failed (${r.status})`);
  return t;
}

async function query(tok: string, start: string, end: string, dimensions: string[], rowLimit = 1000): Promise<Row[]> {
  const property = process.env.GSC_PROPERTY || "https://riftcompare.com/";
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: start, endDate: end, dimensions, rowLimit }),
  });
  if (!r.ok) throw new Error(`searchAnalytics ${r.status}`);
  return ((await r.json()) as { rows?: Row[] }).rows ?? [];
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const line = (r: Row, w = 60) =>
  `${r.keys[0].slice(0, w).padEnd(w)} ${String(r.clicks).padStart(5)} ${String(r.impressions).padStart(7)} ${(100 * r.ctr).toFixed(1).padStart(5)}% ${r.position.toFixed(1).padStart(5)}`;

async function main() {
  if (!process.env.GSC_SA_KEY) {
    console.log("GSC_SA_KEY is not set.");
    return;
  }
  const tok = await token();
  // Search Console's last ~2 days are provisional; end three days back.
  const end = Date.now() - 3 * DAY;
  const start = end - (DAYS - 1) * DAY;
  const [queries, pages] = await Promise.all([
    query(tok, ymd(start), ymd(end), ["query"], 2000),
    query(tok, ymd(start), ymd(end), ["page"], 1000),
  ]);
  const head = (w = 60) => `${"".padEnd(w)} clicks   impr.   CTR   pos`;

  console.log(`\nSearch Console ${ymd(start)}..${ymd(end)} (${DAYS} days): ${queries.length} queries, ${pages.length} pages.\n`);
  console.log("TOP QUERIES BY IMPRESSIONS");
  console.log(head());
  for (const r of [...queries].sort((a, b) => b.impressions - a.impressions).slice(0, 120)) console.log(line(r));

  console.log("\nSTRIKING DISTANCE (position 4–20, 40+ impressions): one strong page could move these");
  console.log(head());
  for (const r of queries.filter((q) => q.position >= 4 && q.position <= 20 && q.impressions >= 40).sort((a, b) => b.impressions - a.impressions).slice(0, 80))
    console.log(line(r));

  // Rising: the last 7 days per day against the 21 before, per day.
  const recentStart = end - 6 * DAY;
  const [recent, prior] = await Promise.all([
    query(tok, ymd(recentStart), ymd(end), ["query"], 2000),
    query(tok, ymd(recentStart - 21 * DAY), ymd(recentStart - DAY), ["query"], 2000),
  ]);
  const priorMap = new Map(prior.map((r) => [r.keys[0], r.impressions / 21]));
  const rising = recent
    .map((r) => ({ q: r.keys[0], now: r.impressions / 7, was: priorMap.get(r.keys[0]) ?? 0, pos: r.position }))
    .filter((r) => r.now >= 5 && r.now >= 2 * r.was)
    .sort((a, b) => b.now - b.was - (a.now - a.was))
    .slice(0, 50);
  console.log("\nRISING QUERIES (impressions a day, last 7 days vs the 21 before)");
  for (const r of rising) console.log(`${r.q.slice(0, 60).padEnd(60)} ${r.was.toFixed(1).padStart(6)} -> ${r.now.toFixed(1).padStart(6)}  pos ${r.pos.toFixed(1)}`);

  const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, "") || "/";
  console.log("\nTOP PAGES BY CLICKS");
  console.log(head(70));
  for (const r of [...pages].sort((a, b) => b.clicks - a.clicks).slice(0, 50)) console.log(line({ ...r, keys: [path(r.keys[0])] }, 70));

  console.log("\nBLOG AND GUIDE PAGES");
  console.log(head(70));
  for (const r of pages.filter((p) => /\/(blog|guides)\//.test(p.keys[0])).sort((a, b) => b.impressions - a.impressions))
    console.log(line({ ...r, keys: [path(r.keys[0])] }, 70));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
