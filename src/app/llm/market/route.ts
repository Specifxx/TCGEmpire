import { getMarketIndex } from "@/lib/market-index";
import { formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

// Clean markdown version of the RiftCompare Index page, for AI agents (linked from
// llms.txt and the page's `alternate` type=text/markdown). Cheap for LLMs to ingest.
export const revalidate = 1800;

const md = (lines: string[]) =>
  new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
const pct = (p: number | null | undefined) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p}%`);

export async function GET() {
  const index = await getMarketIndex("GLOBAL").catch(() => null);
  const lines: string[] = ["# The RiftCompare Index"];
  if (!index) {
    lines.push("", "The index is warming up — not enough price history yet. See " + `${SITE_URL}/market`);
    return md(lines);
  }
  lines.push(
    "",
    "> A search-weighted price index of the most-searched Riftbound: League of Legends TCG " +
      "singles (base 100), updated weekly. Global composite; switch regions on the page.",
    "",
    `- Level: ${index.latest.toFixed(1)} (base 100 on ${index.startDay})`,
    `- Change: latest ${pct(index.d1)} · 7d ${pct(index.d7)} · 30d ${pct(index.d30)} · all-time ${pct(index.sinceStart)}`
  );
  if (index.stats) {
    lines.push(
      `- Index value (cost of one of each card): ${formatMoney(index.stats.basketValueCents, index.currency)}`,
      `- Breadth: ${index.stats.advancing} advancing / ${index.stats.declining} declining · range ${index.stats.low.toFixed(1)}–${index.stats.high.toFixed(1)} · recent volatility ${index.stats.volatilityPct == null ? "—" : index.stats.volatilityPct + "%"}`
    );
  }
  lines.push("", "## Constituents (top 50 by weight)", "", "| Card | Set | Weight | Price | 7d |", "|---|---|---|---|---|");
  for (const c of index.constituents.slice(0, 50)) {
    lines.push(`| ${c.name} | ${c.setCode} ${c.collectorNumber} | ${c.weightPct}% | ${formatMoney(c.priceCents, index.currency)} | ${pct(c.d7pct)} |`);
  }
  lines.push(
    "",
    `Source: ${SITE_URL}/market · JSON: ${SITE_URL}/api/v1/index.json · Methodology (exact formula): ${SITE_URL}/guides/understanding-the-riftcompare-index-methodology`
  );
  return md(lines);
}
