/**
 * Fetch the full Riftbound card catalogue (with real images) from the RiftScribe
 * open API and save it to prisma/riftbound-cards.json so seeding works offline.
 *
 * Usage: npx tsx scripts/fetch-cards.ts
 *
 * RiftScribe (https://riftscribe.gg) is a free community card database. Card
 * images are served from their CDN. This pulls public data only — no auth.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://riftscribe.gg/api/cards";
const PAGE = 100;

interface RsCard {
  id: string;
  name: string;
  set_id: string;
  collector_number: number;
  rarity: string;
  faction: string;
  type: string;
  orientation: string;
  stats: { energy: number | null; might: number | null; power: number | null };
  image: string;
  image_thumb: { small: string; medium: string; large: string };
  image_blur_data_url: string;
  is_banned: boolean;
}

async function main() {
  const all: RsCard[] = [];
  let offset = 0;
  for (;;) {
    const url = `${BASE}?limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`RiftScribe API ${res.status} at offset ${offset}`);
    }
    const batch = (await res.json()) as RsCard[];
    all.push(...batch);
    process.stdout.write(`\rFetched ${all.length} cards…`);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  process.stdout.write("\n");

  const out = join(process.cwd(), "prisma", "riftbound-cards.json");
  writeFileSync(out, JSON.stringify(all, null, 0));

  const types = Array.from(new Set(all.map((c) => c.type))).sort();
  const factions = Array.from(new Set(all.map((c) => c.faction))).sort();
  const rarities = Array.from(new Set(all.map((c) => c.rarity))).sort();
  const sets = Array.from(new Set(all.map((c) => c.set_id))).sort();
  console.log(`Saved ${all.length} cards to ${out}`);
  console.log("Types:", types.join(", "));
  console.log("Factions:", factions.join(", "));
  console.log("Rarities:", rarities.join(", "));
  console.log("Sets:", sets.join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
