// Client-safe Riftle constants and types. CRITICAL: this module must NEVER import
// prisma, next/cache, or anything server-only. The Riftle UI (a client component)
// value-imports RIFTLE_HINT_GATES; if that import path pulls in lib/db (which
// instantiates PrismaClient at module load), the Prisma browser shim throws at
// load time on the client — a crash that React error boundaries CANNOT catch
// (it happens during module evaluation, before render). Keeping these here, free
// of server imports, is what keeps /riftle from white-screening.

export const RIFTLE_ATTEMPTS = 8;

// How many guesses a player must make before each successive hint unlocks — so
// hints reward persistence rather than replacing the puzzle. Six gates across
// eight attempts: the last hint (unlocked after guess 7, the final attempt) is a
// straight giveaway — the card's own art — so nobody runs out of guesses on a
// card they'd have recognized on sight.
export const RIFTLE_HINT_GATES = [2, 3, 4, 5, 6, 7];

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

export type Cell = { value: string; state: "hit" | "miss"; hint?: "higher" | "lower" };

export type Feedback = {
  name: string;
  imageThumbUrl: string | null;
  correct: boolean;
  // `num` (collector number) exists so every card is uniquely identifiable from the
  // board: set+number pins down exactly one card, killing the "all columns green
  // but it's the wrong card" failure mode (Legends share set/type/domain/rarity).
  cells: { set: Cell; num: Cell; type: Cell; domain: Cell; rarity: Cell; cost: Cell; might: Cell };
};
