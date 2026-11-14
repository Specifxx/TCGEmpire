// Temporary read-only report: outbound clicks by day, retailer and page type. Counts only.
import { dbHistory } from "../src/lib/db-history";
function cls(p: string | null): string {
  if (!p) return "(none)";
  const s = p.split("?")[0];
  if (s === "/" || /^\/(au|nz|us|uk|ca|eu)?\/?$/.test(s)) return "home";
  const seg = s.split("/").filter(Boolean)[0];
  return seg ?? "home";
}
async function main() {
  const since = new Date(Date.now() - 10 * 86400_000);
  const rows = await dbHistory.clickEvent.findMany({ where: { createdAt: { gte: since }, retailer: { in: ["ebay", "tcgplayer", "amazon"] } }, select: { retailer: true, path: true, createdAt: true } });
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const byDay = new Map<string, number>();
  const byDayCls = new Map<string, number>();
  for (const r of rows) {
    const k = `${day(r.createdAt)} ${r.retailer}`;
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
    if (r.retailer === "ebay") { const k2 = `${day(r.createdAt)} ebay ${cls(r.path)}`; byDayCls.set(k2, (byDayCls.get(k2) ?? 0) + 1); }
  }
  console.log("PER DAY (UTC) retailer clicks");
  [...byDay].sort().forEach(([k, v]) => console.log(k, v));
  console.log("\nEBAY per day by page type");
  [...byDayCls].sort().forEach(([k, v]) => console.log(k, v));
}
main().then(() => process.exit(0));
