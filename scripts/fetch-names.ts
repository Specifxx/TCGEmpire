/**
 * Build prisma/card-names.json — a map of card key -> name slug, scraped from
 * riftbound.gg's public sitemap. Card URLs embed the full TCGplayer-style name
 * (e.g. ogn-251-jinx-loose-cannon), which RiftScribe lacks for Legends.
 *
 * Usage: npx tsx scripts/fetch-names.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SITEMAP = "https://riftbound.gg/cards-latest-sitemap.xml";

async function main() {
  const res = await fetch(SITEMAP, { headers: { "User-Agent": "Mozilla/5.0 RiftCompareAUBot" } });
  if (!res.ok) throw new Error(`sitemap ${res.status}`);
  const xml = await res.text();
  const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);

  const map: Record<string, string> = {};
  for (const loc of locs) {
    const m = loc.match(/\/cards\/([^/]+)\/?$/);
    if (!m) continue;
    const slug = m[1];
    // slug = "{set}-{num}[letter][-p]-{name-slug}", e.g. ogn-039a-kaisa-survivor
    const parsed = slug.match(/^([a-z]{2,4}-\d+[a-z]?)(?:-p)?-(.+)$/);
    if (!parsed) continue;
    const key = parsed[1]; // e.g. "ogn-039a"
    if (!map[key]) map[key] = parsed[2];
  }

  const out = join(process.cwd(), "prisma", "card-names.json");
  writeFileSync(out, JSON.stringify(map, null, 0));
  console.log(`Saved ${Object.keys(map).length} card name slugs to ${out}`);
  console.log("samples:", Object.entries(map).slice(0, 4).map(([k, v]) => `${k}=${v}`).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); });
