/**
 * Build prisma/promos.json — the list of promo printings (set + collector number)
 * from riftbound.gg's sitemap. Promo card URLs look like "ogn-001-p-blazing-scorcher".
 * Promos share the base card's art, so the seed clones the matching base card.
 *
 * Usage: npx tsx scripts/fetch-promos.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const xml = await fetch("https://riftbound.gg/cards-latest-sitemap.xml", {
    headers: { "User-Agent": "Mozilla/5.0 RiftCompareAUBot" },
  }).then((r) => r.text());

  const slugs = Array.from(xml.matchAll(/\/cards\/([^/<]+)/g)).map((m) => m[1]);
  const promos: { set: string; num: string }[] = [];
  const seen = new Set<string>();
  for (const slug of slugs) {
    const m = slug.match(/^([a-z]{2,4})-(\d+[a-z]?)-p-/i);
    if (!m) continue;
    const key = `${m[1].toUpperCase()}-${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    promos.push({ set: m[1].toUpperCase(), num: m[2] });
  }

  const out = join(process.cwd(), "prisma", "promos.json");
  writeFileSync(out, JSON.stringify(promos, null, 0));
  console.log(`Saved ${promos.length} promo printings to ${out}`);
  console.log("samples:", promos.slice(0, 5).map((p) => `${p.set}-${p.num}`).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });
