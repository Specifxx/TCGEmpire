// Stores Search Console clicks per day for each site in OpsSnapshot "growth:gsc",
// and the queries our own pages compete for, read by /admin/growth (2026-10-27). Runs after the ops monitor every three hours.
// PUBLIC LOGS: this prints only which properties answered, never a number.
import { prisma } from "../src/lib/db";
import { fetchGscDaily, fetchGscQueryPages, findSplitQueries, listGscProperties, mergeGscDays, propertiesByHost, type GscDay, type SplitQuery } from "../src/lib/ops/gsc-daily";

const DAYS = 90;
// Every site the service account can read (2026-11-02, "Family growth target" in
// DECISIONS.md), one series per site (mergeGscDays). GSC_PROPERTIES (comma list)
// still overrides the list.
const FIXED = (process.env.GSC_PROPERTIES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  const raw = process.env.GSC_SA_KEY;
  if (!raw) {
    console.log("GSC_SA_KEY not set: nothing stored.");
    return;
  }
  const end = new Date();
  const start = new Date(end.getTime() - DAYS * 86400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  // Competing pages over the last 28 settled days (Search Console's newest two are provisional).
  const splitEnd = new Date(end.getTime() - 3 * 86400_000);
  const splitStart = new Date(splitEnd.getTime() - 27 * 86400_000);
  const hosts = propertiesByHost(FIXED.length ? FIXED : await listGscProperties(raw));
  const sites: Record<string, { status: "ok" | "error"; detail?: string; days: GscDay[]; splits?: SplitQuery[] }> = {};
  for (const [host, props] of hosts) {
    const got: { p: string; days: GscDay[] }[] = [];
    let err = "";
    for (const p of props) {
      try {
        got.push({ p, days: await fetchGscDaily(raw, p, ymd(start), ymd(end)) });
      } catch (e) {
        err = (e as Error).message.slice(0, 120);
      }
    }
    if (!got.length) {
      sites[host] = { status: "error", detail: err, days: [] };
      console.log(`${host}: unavailable (${err.slice(0, 80)})`);
      continue;
    }
    // Competing pages from the property with the most clicks in the window.
    const main = got.reduce((a, b) => (b.days.reduce((x, d) => x + d.clicks, 0) > a.days.reduce((x, d) => x + d.clicks, 0) ? b : a));
    const splits = await fetchGscQueryPages(raw, main.p, ymd(splitStart), ymd(splitEnd))
      .then((rows) => findSplitQueries(rows, { limit: 25 }))
      .catch(() => undefined);
    sites[host] = { status: "ok", days: mergeGscDays(got.map((g) => g.days)), splits };
    console.log(`${host}: ok (${got.length} of ${props.length} properties)`);
  }
  const json = { updatedAt: new Date().toISOString(), sites };
  await prisma.opsSnapshot.upsert({ where: { key: "growth:gsc" }, create: { key: "growth:gsc", json }, update: { json } });
  console.log("Stored growth:gsc.");
}

main()
  .catch((e) => {
    // Never fails the monitor's run: the growth page shows the last good snapshot.
    console.log(`growth snapshot skipped: ${(e as Error).message.slice(0, 120)}`);
  })
  .finally(() => prisma.$disconnect());
