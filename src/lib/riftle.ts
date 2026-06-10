// Riftle — the free daily "guess the Riftbound card" game. One card per Sydney
// day, chosen deterministically from the base-print pool; guesses get Wordle-style
// per-attribute feedback. All facts come straight from the card database, so the
// game never asserts rules text it can't back up.
import { prisma } from "./db";
import { unstable_cache } from "next/cache";

export const RIFTLE_ATTEMPTS = 8;
// Rarity ladder for higher/lower hints (Showcase prints are excluded from the pool).
const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Epic"];
// Guessable card types — Battlefields/Runes are too niche to be fun answers.
// (Champions are type "Unit" in the DB.)
const POOL_TYPES = ["Unit", "Spell", "Gear", "Legend"];

export type RiftleCard = {
  id: string;
  name: string;
  slug: string | null;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  domain: string;
  type: string;
  rarity: string;
  energyCost: number | null;
  might: number | null;
};

const SELECT = {
  id: true, name: true, slug: true, setCode: true, collectorNumber: true,
  imageThumbUrl: true, domain: true, type: true, rarity: true, energyCost: true, might: true,
} as const;

// Sydney calendar day — the puzzle flips at midnight AEST like the price snapshots.
export function riftleDay(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Base-print pool, deduped by name (a name may have alt-art/showcase reprints).
const getPool = unstable_cache(
  async (): Promise<RiftleCard[]> => {
    const cards = await prisma.card.findMany({
      where: {
        variant: null,
        isPromo: false,
        rarity: { not: "Showcase" },
        type: { in: POOL_TYPES },
        imageThumbUrl: { not: null },
      },
      orderBy: [{ setCode: "asc" }, { collectorNumber: "asc" }],
      select: SELECT,
    });
    const seen = new Set<string>();
    const pool: RiftleCard[] = [];
    for (const c of cards) {
      const k = c.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      pool.push(c as RiftleCard);
    }
    return pool;
  },
  ["riftle-pool"],
  { revalidate: 3600 }
);

export async function getDailyCard(day = riftleDay()): Promise<RiftleCard | null> {
  const pool = await getPool();
  if (!pool.length) return null;
  return pool[hash(`riftle:${day}`) % pool.length];
}

// Resolve a player's typed guess to a pool card (exact name match, case-insensitive).
export async function resolveGuess(name: string): Promise<RiftleCard | null> {
  const pool = await getPool();
  const q = name.trim().toLowerCase();
  return pool.find((c) => c.name.toLowerCase() === q) ?? null;
}

export type Cell = { value: string; state: "hit" | "miss"; hint?: "higher" | "lower" };
export type Feedback = {
  name: string;
  imageThumbUrl: string | null;
  correct: boolean;
  cells: { set: Cell; type: Cell; domain: Cell; rarity: Cell; cost: Cell; might: Cell };
};

function numCell(guess: number | null, answer: number | null): Cell {
  const show = guess == null ? "—" : String(guess);
  if (guess === answer) return { value: show, state: "hit" };
  if (guess == null || answer == null) return { value: show, state: "miss" };
  return { value: show, state: "miss", hint: answer > guess ? "higher" : "lower" };
}

export function compareGuess(guess: RiftleCard, answer: RiftleCard): Feedback {
  const gi = RARITY_ORDER.indexOf(guess.rarity);
  const ai = RARITY_ORDER.indexOf(answer.rarity);
  const rarity: Cell =
    guess.rarity === answer.rarity
      ? { value: guess.rarity, state: "hit" }
      : { value: guess.rarity, state: "miss", ...(gi >= 0 && ai >= 0 ? { hint: ai > gi ? ("higher" as const) : ("lower" as const) } : {}) };
  return {
    name: guess.name,
    imageThumbUrl: guess.imageThumbUrl,
    correct: guess.id === answer.id,
    cells: {
      set: { value: guess.setCode, state: guess.setCode === answer.setCode ? "hit" : "miss" },
      type: { value: guess.type, state: guess.type === answer.type ? "hit" : "miss" },
      domain: { value: guess.domain, state: guess.domain === answer.domain ? "hit" : "miss" },
      rarity,
      cost: numCell(guess.energyCost, answer.energyCost),
      might: numCell(guess.might, answer.might),
    },
  };
}

// Names for the client-side autocomplete (small payload: ~900 strings).
export async function getPoolNames(): Promise<string[]> {
  const pool = await getPool();
  return pool.map((c) => c.name);
}
