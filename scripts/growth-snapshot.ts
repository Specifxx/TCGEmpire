// Stores Search Console clicks per day for each site in OpsSnapshot "growth:gsc",
// read by /admin/growth (2026-10-27). Runs after the ops monitor every three hours.
// PUBLIC LOGS: this prints only which properties answered, never a number.
import { prisma } from "../src/lib/db";
import { fetchGscDaily, type GscDay } from "../src/lib/ops/gsc-daily";

const DAYS = 90;
const PROPERTIES = (process.env.GSC_PROPERTIES || "https://riftcompare.com/,https://opcompare.app/")
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
  const sites: Record<string, { status: "ok" | "error"; detail?: string; days: GscDay[] }> = {};
  for (const p of PROPERTIES) {
    try {
      sites[p] = { status: "ok", days: await fetchGscDaily(raw, p, ymd(start), ymd(end)) };
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
