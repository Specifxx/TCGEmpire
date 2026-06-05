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

  const sellers = [];
  for (const s of SELLERS) {
    sellers.push(
      await prisma.user.create({
        data: {
          email: s.email,
          passwordHash,
          displayName: s.displayName,
          balanceCents: Math.round(s.balance * 100),
        },
      })
    );
  }
  const balance = new Map(sellers.map((s) => [s.id, s.balanceCents]));

  // ---- cards -----------------------------------------------------------------
  const cardData = rsCards.map((c, i) => {
    const total = c.id.split("-")[2] ?? "000";
    const domain = c.faction === "colorless" ? "Colorless" : titleCase(c.faction);
    const rarity = titleCase(c.rarity);
    return {
      externalId: c.id,
      name: c.name,
      setCode: c.set_id,
      setName: SET_NAMES[c.set_id] ?? c.set_id,
      collectorNumber: `${String(c.collector_number).padStart(3, "0")}/${total}`,
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
  const cards = await prisma.card.findMany({
    select: { id: true, rarity: true, type: true, marketPriceCents: true },
  });
  console.log(`Created ${cards.length} cards with real images.`);

  // ---- listings (deliberately sparse stock) ----------------------------------
  const listingChance: Record<string, number> = {
    Common: 0.55, Uncommon: 0.5, Rare: 0.42, Epic: 0.3, Showcase: 0.18,
  };
  const listingsData: any[] = [];
  const cardsWithStock = new Set<string>();
  for (const card of cards) {
    if (rng() > (listingChance[card.rarity] ?? 0.4)) continue;
    cardsWithStock.add(card.id);
    const max = card.rarity === "Showcase" ? 1 : card.rarity === "Epic" ? 2 : 4;
    const n = 1 + Math.floor(rng() * max);
    for (let i = 0; i < n; i++) {
      const condition = pick(CONDITIONS);
      const isFoil = rng() < 0.15;
      const base = card.marketPriceCents * CONDITION_MULT[condition];
      const price = Math.max(
        25,
        Math.round((base * (isFoil ? between(1.6, 2.4) : 1) * between(0.9, 1.18)) / 5) * 5
      );
      listingsData.push({
        cardId: card.id,
        sellerId: pick(sellers).id,
        condition,
        isFoil,
        priceCents: price,
        quantity: 1 + Math.floor(rng() * 3),
        status: "ACTIVE",
      });
    }
  }
  await prisma.listing.createMany({ data: listingsData });
  console.log(
    `Created ${listingsData.length} listings across ${cardsWithStock.size} cards ` +
      `(${cards.length - cardsWithStock.size} cards have NO stock).`
  );

  // ---- buy orders (bids) — weighted toward out-of-stock cards -----------------
  const buyOrdersData: any[] = [];
  for (const card of cards) {
    const hasStock = cardsWithStock.has(card.id);
    const chance = hasStock ? 0.12 : 0.4; // demand concentrates where supply is missing
    if (rng() > chance) continue;
    const n = 1 + Math.floor(rng() < 0.3 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const buyer = pick(sellers);
      const condition = rng() < 0.5 ? "NM" : pick(["ANY", "LP", "NM", "MP"]);
      const isFoil = rng() < 0.12;
      const qty = 1 + Math.floor(rng() * 2);
      // Bids sit a bit below reference, as real bids do.
      const bid = Math.max(
        25,
        Math.round((card.marketPriceCents * between(0.6, 1.0) * (isFoil ? 1.8 : 1)) / 5) * 5
      );
      const reserved = bid * qty;
      const have = balance.get(buyer.id) ?? 0;
      if (have < reserved) continue; // can't afford to escrow
      balance.set(buyer.id, have - reserved);
      buyOrdersData.push({
        cardId: card.id,
        buyerId: buyer.id,
        condition,
        isFoil,
        maxPriceCents: bid,
        quantity: qty,
        quantityFilled: 0,
        reservedCents: reserved,
        status: "OPEN",
      });
    }
  }
  await prisma.buyOrder.createMany({ data: buyOrdersData });
  // Persist escrow deductions.
  for (const s of sellers) {
    await prisma.user.update({
      where: { id: s.id },
      data: { balanceCents: balance.get(s.id) ?? s.balanceCents },
    });
  }
  console.log(`Created ${buyOrdersData.length} open buy orders (bids) with escrow.`);
  console.log("Seed complete ✔");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
