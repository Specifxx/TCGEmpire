import { prisma } from "./db";
import { normalizeSearch } from "./format";
import { CARD_TILE_SELECT } from "./cards";
import type { CardTileData } from "@/components/CardTile";

// "Chase cards" — the most sought-after Riftbound cards, ordered by real-world
// demand. The seed order below comes from TCGPlayer's "best selling" ranking for
// the Riftbound card line (the single biggest TCG marketplace), deduped to one
// entry per card. This is the INITIAL signal; once we have enough on-site demand
// data we can blend/replace it with our own searchCount.
//
// Matching is by normalized name (normalizeSearch strips spaces/punctuation), so
// "Diana, Scorn of the Moon" here resolves to the DB card regardless of how the
// separator is written. For each name we surface its most valuable printing (the
// signature / overnumbered / alt-art chase version) as the representative card.
export const CHASE_ORDER: string[] = [
  "Teemo, Scout",
  "Baited Hook",
  "Thousand-Tailed Watcher",
  "Baron Nashor",
  "Ahri, Inquisitive",
  "Diana, Scorn of the Moon",
  "Defiant Dance",
  "Rengar, Trophy Hunter",
  "Moonfall",
  "Dazzling Aurora",
  "Vex, Gloomist",
  "Unchecked Power",
  "Mirror Image",
  "Fizz, Trickster",
  "Kai'Sa, Survivor",
  "Last Rites",
  "LeBlanc, Deceiver",
  "Stacked Deck",
  "Sabotage",
  "Irelia, Fervent",
  "Vex, Apathetic",
  "Arise!",
  "Veteran Poro",
  "Pyke, Dockside Butcher",
  "Mind Rune",
  "Pyke, Bloodharbor Ripper",
  "Teemo, Strategist",
  "Irelia, Blade Dancer",
  "Body Rune",
  "Elder Dragon",
  "Vilemaw",
  "Guerilla Warfare",
  "Sett, Brawler",
  "Hwei, Brooding Painter",
  "Viktor, Herald of the Arcane",
  "Tideturner",
  "Ahri, Nine-Tailed Fox",
  "Thrill of the Hunt",
];

// Rank a printing as a chase representative: prefer ones with a real photo and a
// live price, then the most valuable (the signature/alt-art version is the chase).
function score(c: CardTileData): number {
  let s = 0;
  if (c.imageThumbUrl || c.imageUrl) s += 1_000_000_000;
  if (c.lowestPriceCents != null) s += 100_000_000 + c.lowestPriceCents;
  return s;
}

// Resolve the chase list to real cards, in popularity order, one card per name.
// Unmatched names are skipped, so the section always renders a clean list.
export async function getChaseCards(limit = 12): Promise<CardTileData[]> {
  const keyFor = (name: string) => normalizeSearch(name);
  const orderIndex = new Map<string, number>();
  CHASE_ORDER.forEach((name, i) => orderIndex.set(keyFor(name), i));

  const cards = (await prisma.card.findMany({
    where: { nameNormalized: { in: [...orderIndex.keys()] } },
    select: { ...CARD_TILE_SELECT, nameNormalized: true },
  })) as (CardTileData & { nameNormalized: string })[];

  // Pick the best representative printing per normalized name.
  const best = new Map<string, CardTileData & { nameNormalized: string }>();
  for (const c of cards) {
    const cur = best.get(c.nameNormalized);
    if (!cur || score(c) > score(cur)) best.set(c.nameNormalized, c);
  }

  return [...best.values()]
    .sort((a, b) => (orderIndex.get(a.nameNormalized)! - orderIndex.get(b.nameNormalized)!))
    .slice(0, limit);
}
