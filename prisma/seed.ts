import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { titleCase } from "../src/lib/constants";

const prisma = new PrismaClient();

// ---- deterministic PRNG so re-seeding is stable -------------------------------
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260605);
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const between = (min: number, max: number) => min + rng() * (max - min);

const CONDITIONS = ["NM", "NM", "NM", "LP", "LP", "MP", "HP", "DMG"];
const CONDITION_MULT: Record<string, number> = {
  NM: 1, LP: 0.85, MP: 0.7, HP: 0.55, DMG: 0.4,
};

const SET_NAMES: Record<string, string> = {
  OGN: "Origins",
  OGS: "Origins: Proving Grounds",
  SFD: "Spirit Forged",
  UNL: "Unleashed",
  VEN: "Vengeance",
};

// Synthesised reference prices (AUD cents) by rarity — RiftScribe has no prices.
const RARITY_PRICE_CENTS: Record<string, [number, number]> = {
  Common: [20, 120],
  Uncommon: [60, 320],
  Rare: [180, 1100],
  Epic: [700, 4200],
  Showcase: [2200, 16000],
};
const TYPE_MULT: Record<string, number> = { Legend: 2.2, Battlefield: 1.3 };

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
}

function referencePrice(rarity: string, type: string): number {
  const [lo, hi] = RARITY_PRICE_CENTS[rarity] ?? RARITY_PRICE_CENTS.Common;
  const mult = TYPE_MULT[type] ?? 1;
  return Math.max(20, Math.round(between(lo, hi) * mult));
}

const SELLERS = [
  { email: "riftraider@tcgempire.au", displayName: "RiftRaider", balance: 2500 },
  { email: "hextechhoard@tcgempire.au", displayName: "HextechHoard", balance: 3800 },
  { email: "summonerscove@tcgempire.au", displayName: "SummonersCove", balance: 4200 },
  { email: "noxianvault@tcgempire.au", displayName: "NoxianVault", balance: 2100 },
  { email: "piltoverpulls@tcgempire.au", displayName: "PiltoverPulls", balance: 3400 },
  { email: "freljordfinds@tcgempire.au", displayName: "FreljordFinds", balance: 2900 },
];

async function main() {
  const file = join(process.cwd(), "prisma", "riftbound-cards.json");
  const rsCards = JSON.parse(readFileSync(file, "utf8")) as RsCard[];
  console.log(`Loaded ${rsCards.length} real cards from RiftScribe data.`);

  console.log("Resetting data…");
  await prisma.order.deleteMany();
  await prisma.buyOrder.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.card.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  const demo = await prisma.user.create({
    data: {
      email: "demo@tcgempire.au",
      passwordHash,
      displayName: "DemoCollector",
      balanceCents: 50000,
      isAdmin: true,
    },
  });
  console.log("Created demo account: demo@tcgempire.au / password123");

  // ---- cards -----------------------------------------------------------------
  const cardData = rsCards.map((c) => {
    // The card id encodes the real collector number incl. alt-art suffix,
    // e.g. "ogn-112a-298" -> number segment "112a", total "298".
    const parts = c.id.split("-");
    const numSeg = parts[1] ?? String(c.collector_number);
    const total = parts[2] ?? "000";
    const variant = numSeg.match(/^\d+([a-z]+)$/i)?.[1]?.toLowerCase() ?? null;
    const domain = c.faction === "colorless" ? "Colorless" : titleCase(c.faction);
    const rarity = titleCase(c.rarity);
    return {
      externalId: c.id,
      name: c.name,
      setCode: c.set_id,
      setName: SET_NAMES[c.set_id] ?? c.set_id,
      collectorNumber: `${numSeg}/${total}`,
      variant,
      domain,
      type: c.type,
      rarity,
      orientation: c.orientation ?? null,
      energyCost: c.stats?.energy ?? null,
      might: c.stats?.might ?? null,
      power: c.stats?.power ?? null,
      imageUrl: c.image ?? null,
      imageThumbUrl: c.image_thumb?.large ?? c.image_thumb?.medium ?? null,
      blurDataUrl: c.image_blur_data_url ?? null,
      marketPriceCents: referencePrice(rarity, c.type),
      artSeed: Math.floor(rng() * 1_000_000),
    };
  });
  await prisma.card.createMany({ data: cardData });
  const variants = cardData.filter((c) => c.variant).length;
  console.log(`Created ${cardData.length} cards with real images (${variants} alt-art variants).`);

  // NOTE: the peer-to-peer marketplace (listings + buy orders) is stashed while
  // the site operates as a card database + price-comparison tool. The Listing /
  // BuyOrder models and routes remain in place for a future revisit. Run the
  // price importer to populate retailer prices:  npx tsx scripts/import-prices.ts
  console.log("Seed complete ✔  (next: npx tsx scripts/import-prices.ts)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
