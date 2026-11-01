// Stores Search Console clicks per day for each site in OpsSnapshot "growth:gsc",
// and the queries our own pages compete for, read by /admin/growth (2026-10-27). Runs after the ops monitor every three hours.
// PUBLIC LOGS: this prints only which properties answered, never a number.
import { prisma } from "../src/lib/db";
import { fetchGscDaily, fetchGscQueryPages, findSplitQueries, listGscProperties, onePropertyPerHost, type GscDay, type SplitQuery } from "../src/lib/ops/gsc-daily";

const DAYS = 90;
// Every site the service account can read (2026-11-02, "Family growth target" in
// DECISIONS.md): one property per host, the Domain property first, since it also
// counts www and http. GSC_PROPERTIES (comma list) still overrides it.
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
  const PROPERTIES = FIXED.length ? FIXED : onePropertyPerHost(await listGscProperties(raw));
  const sites: Record<string, { status: "ok" | "error"; detail?: string; days: GscDay[]; splits?: SplitQuery[] }> = {};
  for (const p of PROPERTIES) {
    try {
      const days = await fetchGscDaily(raw, p, ymd(start), ymd(end));
      const splits = await fetchGscQueryPages(raw, p, ymd(splitStart), ymd(splitEnd))
        .then((rows) => findSplitQueries(rows, { limit: 25 }))
        .catch(() => undefined);
      sites[p] = { status: "ok", days, splits };
      console.log(`${p}: ok`);
    } catch (e) {
      sites[p] = { status: "error", detail: (e as Error).message.slice(0, 120), days: [] };
      console.log(`${p}: unavailable (${(e as Error).message.slice(0, 80)})`);
    }
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
