// Riftle — the free daily "guess the Riftbound card" game. One card per Sydney
// day, chosen deterministically from the base-print pool; guesses get Wordle-style
// per-attribute feedback. All facts come straight from the card database, so the
// game never asserts rules text it can't back up.
import { prisma } from "./db";
import { unstable_cache } from "next/cache";
import { RIFTLE_ATTEMPTS, RIFTLE_HINT_GATES, type Cell, type Feedback, type RiftleCard } from "./riftle-shared";

// Re-export the client-safe constants/types so existing importers of "@/lib/riftle"
// (the API route) keep working. The actual definitions live in riftle-shared.ts,
// which is free of server imports so the Riftle CLIENT component can import them
// without dragging prisma into the browser bundle (that leak crashed /riftle).
export { RIFTLE_ATTEMPTS, RIFTLE_HINT_GATES };
export type { Cell, Feedback, RiftleCard };

// Rarity ladder for higher/lower hints (Showcase prints are excluded from the pool).
const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Epic"];
// Guessable card types — Battlefields/Runes are too niche to be fun answers.
// (Champions are type "Unit" in the DB.)
const POOL_TYPES = ["Unit", "Spell", "Gear", "Legend"];

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

// Pick a pool card deterministically from any seed string. The daily puzzle is just
// the seed `riftle:<day>`; Unlimited mode passes a random per-game seed, so every
// game draws a different (but server-verifiable) card while the server stays
// stateless and the answer never reaches the client.
export async function getCardForSeed(seed: string): Promise<RiftleCard | null> {
  const pool = await getPool();
  if (!pool.length) return null;
  return pool[hash(seed) % pool.length];
}

export async function getDailyCard(day = riftleDay()): Promise<RiftleCard | null> {
  return getCardForSeed(`riftle:${day}`);
}

// Resolve a player's typed guess to a pool card (exact name match, case-insensitive).
export async function resolveGuess(name: string): Promise<RiftleCard | null> {
  const pool = await getPool();
  const q = name.trim().toLowerCase();
  return pool.find((c) => c.name.toLowerCase() === q) ?? null;
}

function numCell(guess: number | null, answer: number | null): Cell {
  const show = guess == null ? "—" : String(guess);
  if (guess === answer) return { value: show, state: "hit" };
  if (guess == null || answer == null) return { value: show, state: "miss" };
  return { value: show, state: "miss", hint: answer > guess ? "higher" : "lower" };
}

// Leading integer of a collector number ("187/219" → 187). Pool cards always have
// a standard N/M number (tokens/runes are excluded from POOL_TYPES).
function collectorNum(n: string): number | null {
  const m = n.match(/^\d+/);
  return m ? parseInt(m[0], 10) : null;
}

export function compareGuess(guess: RiftleCard, answer: RiftleCard): Feedback {
  const gi = RARITY_ORDER.indexOf(guess.rarity);
  const ai = RARITY_ORDER.indexOf(answer.rarity);
  const rarity: Cell =
    guess.rarity === answer.rarity
      ? { value: guess.rarity, state: "hit" }
      : { value: guess.rarity, state: "miss", ...(gi >= 0 && ai >= 0 ? { hint: ai > gi ? ("higher" as const) : ("lower" as const) } : {}) };
  // Collector number: compare the numeric part; display it without the "/total"
  // denominator to keep the cell compact. Hit requires the FULL number to match
  // (same set+number = the card itself, give or take printing, which the pool
  // dedupes), so a row can only be all-green when it IS the answer.
  const gNum = collectorNum(guess.collectorNumber);
  const aNum = collectorNum(answer.collectorNumber);
  const num: Cell =
    guess.setCode === answer.setCode && guess.collectorNumber === answer.collectorNumber
      ? { value: String(gNum ?? guess.collectorNumber), state: "hit" }
      : {
          value: String(gNum ?? guess.collectorNumber),
          state: "miss",
          ...(gNum != null && aNum != null && gNum !== aNum ? { hint: aNum > gNum ? ("higher" as const) : ("lower" as const) } : {}),
        };
  return {
    name: guess.name,
    imageThumbUrl: guess.imageThumbUrl,
    correct: guess.id === answer.id,
    cells: {
      set: { value: guess.setCode, state: guess.setCode === answer.setCode ? "hit" : "miss" },
      num,
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

// Progressive hints for one card, ordered least → most revealing (the last gives
// the initial letter). Derived purely from the card's own attributes — no rules
// text we can't back up. Shown one at a time in the UI, gated by RIFTLE_HINT_GATES.
export function buildHints(c: RiftleCard): string[] {
  const cost =
    c.energyCost == null
      ? "It has no energy cost."
      : c.might != null
        ? `It costs ${c.energyCost} energy and has ${c.might} might.`
        : `It costs ${c.energyCost} energy to play.`;
  const words = c.name.trim().split(/\s+/).length;
  const rarity = c.rarity.toLowerCase();
  const article = /^[aeiou]/.test(rarity) ? "an" : "a"; // "an epic", "an uncommon"
  return [
    c.domain === "Colorless"
      ? "It's a Colorless card — it fits into a deck of any domain."
      : `It belongs to the ${c.domain} domain.`,
    `It's ${article} ${rarity} ${c.type.toLowerCase()}.`,
    cost,
    `Its name starts with “${c.name[0]?.toUpperCase() ?? "?"}” and is ${words} word${words === 1 ? "" : "s"} long.`,
  ];
}

// Hints for whichever card a seed resolves to. Served on demand so they aren't in
// the default puzzle payload until a stuck player asks for them.
export async function getHintsForSeed(seed: string): Promise<string[]> {
  const c = await getCardForSeed(seed);
  return c ? buildHints(c) : [];
}

export async function getDailyHints(day = riftleDay()): Promise<string[]> {
  return getHintsForSeed(`riftle:${day}`);
}
