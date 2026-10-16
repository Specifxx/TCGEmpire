// Server-side leaderboard logic for the arcade games (/games/*). Each game has a
// direction (higher or lower wins) and sane bounds — scores come from the client
// so we clamp obviously-impossible values, which is enough for a casual board.
import { prisma } from "./db";

export type GameDir = "desc" | "asc"; // desc = higher is better
export interface GameMeta {
  label: string;
  dir: GameDir;
  min: number;
  max: number;
  unit: string; // shown after the number, e.g. "streak", "pts", "moves"
}

export const GAMES: Record<string, GameMeta> = {
  "higher-lower": { label: "Higher or Lower", dir: "desc", min: 0, max: 200, unit: "streak" },
  // Riftbound 2048 ("twenty48") was retired on 2026-10-16 (owner: "get rid of
  // riftbound 2048"). Its old GameScore rows stay, orphaned, like space-invaders'.
  // Price Check, Zoomed In, Card Smash and Sealed Bid went the same day
  // (DECISIONS.md, "Ten features nobody used"): one to two Google clicks each in
  // 90 days. Their GameScore rows, and Sealed Bid's GameRoom rows, stay orphaned.
  // Card Rain and Pairs were retired on 2026-10-16 (the two least played games:
  // DECISIONS.md, "Seraphine's Piano"), as "space-invaders" was before them. Their
  // rows stay in GameScore, orphaned and invisible: no lookup can reach a key
  // that isn't in this table.
  // A rhythm game (lib/seraphine-piano.ts). A hard song with every combo and
  // Encore lands in the low hundreds of thousands; the cap is a generous guard.
  "seraphines-piano": { label: "Seraphine's Piano", dir: "desc", min: 0, max: 2_000_000, unit: "pts" },
  // The score IS the win streak (not guesses used) — a loss resets the client's
  // streak to 0 before it would ever be submitted, so min: 1 is just a guard,
  // never a value this leaderboard is expected to actually clamp.
  riftle: { label: "Riftle", dir: "desc", min: 1, max: 1000, unit: "win streak" },
};

export function isGameKey(k: string): k is keyof typeof GAMES {
  return Object.prototype.hasOwnProperty.call(GAMES, k);
}

const better = (dir: GameDir, a: number, b: number) => (dir === "desc" ? a > b : a < b);

export interface LeaderRow {
  rank: number;
  name: string;
  score: number;
  isYou: boolean;
}
export interface Leaderboard {
  game: string;
  unit: string;
  rows: LeaderRow[];
  you: { rank: number; score: number } | null;
  total: number;
}

// Record a score, keeping only the player's best. Returns their new best + rank.
export async function submitScore(
  userId: string,
  game: string,
  rawScore: number,
  seconds?: number
): Promise<{ best: number; rank: number } | null> {
  const meta = GAMES[game];
  if (!meta) return null;
  if (!Number.isFinite(rawScore)) return null;
  const score = Math.max(meta.min, Math.min(meta.max, Math.round(rawScore)));

  const existing = await prisma.gameScore.findUnique({ where: { userId_game: { userId, game } } });
  if (!existing) {
    await prisma.gameScore.create({
      data: { userId, game, score, meta: seconds != null ? { seconds } : undefined },
    });
  } else if (better(meta.dir, score, existing.score)) {
    await prisma.gameScore.update({
      where: { id: existing.id },
      data: { score, meta: seconds != null ? { seconds } : undefined },
    });
  }
  const best = existing ? (better(meta.dir, score, existing.score) ? score : existing.score) : score;
  const rank = await rankFor(game, userId, best, meta.dir);
  return { best, rank };
}

async function rankFor(game: string, _userId: string, best: number, dir: GameDir): Promise<number> {
  const ahead = await prisma.gameScore.count({
    where: { game, score: dir === "desc" ? { gt: best } : { lt: best } },
  });
  return ahead + 1;
}

export async function getLeaderboard(
  game: string,
  currentUserId: string | null,
  limit = 10
): Promise<Leaderboard | null> {
  const meta = GAMES[game];
  if (!meta) return null;
  // Tiebreak: same score → whoever set it earlier ranks higher.
  const rows = await prisma.gameScore.findMany({
    where: { game },
    orderBy: [{ score: meta.dir }, { updatedAt: "asc" }],
    take: limit,
    select: { score: true, userId: true, user: { select: { displayName: true } } },
  });
  const total = await prisma.gameScore.count({ where: { game } });

  let you: { rank: number; score: number } | null = null;
  if (currentUserId) {
    const mine = await prisma.gameScore.findUnique({
      where: { userId_game: { userId: currentUserId, game } },
      select: { score: true },
    });
    if (mine) you = { rank: await rankFor(game, currentUserId, mine.score, meta.dir), score: mine.score };
  }

  return {
    game,
    unit: meta.unit,
    total,
    you,
    rows: rows.map((r, i) => ({
      rank: i + 1,
      name: r.user.displayName,
      score: r.score,
      isYou: !!currentUserId && r.userId === currentUserId,
    })),
  };
}
