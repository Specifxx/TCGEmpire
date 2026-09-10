// Sealed Bid — the server side of the multiplayer blind-auction game. This is
// the ONLY module that touches the GameRoom table; every rule lives in the pure
// engine (sealed-bid-engine.ts) and this file just deals the cards, persists
// the document, and referees concurrency.
//
// Concurrency model: six players polling and bidding at once on a serverless
// host means concurrent writers with no shared memory. Every mutation is
// read → pure transform → conditional write (`WHERE version = <read version>`).
// A lost race is simply re-read and re-applied, which is safe because every
// engine transition is idempotent for a given (state, action, now).
import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { COUNTRIES, pickPrice, priceField, type Country } from "./country";
import { submitScore } from "./games";
import {
  SB,
  SbError,
  advance,
  createState,
  pickTiers,
  shardsFor,
  shuffle,
  touch,
  type Priced,
  type SbCard,
  type SbIdentity,
  type SbSettings,
  type SbState,
} from "./sealed-bid-engine";

export const SEALED_BID_GAME_KEY = "sealed-bid";

// No 0/O/1/I — codes get read out loud across a table.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newRoomCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

export function normalizeCode(raw: unknown): string {
  const code = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) throw new SbError("Room codes are 6 letters or digits.", 404);
  return code;
}

// Short public id — visible to every player, so it must not be guessable into
// the bearer token (which is a full UUID).
export function newIdentity(name: string, userId: string | null): SbIdentity {
  return { token: randomUUID(), pid: randomBytes(4).toString("hex"), name, userId };
}

// ── Dealing ──────────────────────────────────────────────────────────────────
//
// Each round is one card from each price tier, so every hand has a chase card
// worth fighting over, a mid-range card where price knowledge separates the
// players, and a cheap one that punishes an over-bid. Tiers are in cents of
// the room's market; the same three thresholds work across every currency the
// site prices in because the shape of the market (a long cheap tail and a few
// expensive chase cards) is the same everywhere.
// ids + price per market, cached 10 min: a few thousand tiny rows, same shape
// as /api/games/cards' id cache. Egress rule: bounded, never the full card row.
const pricedIds = unstable_cache(
  async (field: ReturnType<typeof priceField>): Promise<Priced[]> => {
    const where: Prisma.CardWhereInput = { imageThumbUrl: { not: null } };
    where[field] = { not: null };
    const select: Prisma.CardSelect = { id: true, [field]: true };
    const rows = (await prisma.card.findMany({ where, select, take: 6000 })) as unknown as Record<string, unknown>[];
    return rows.map((r) => ({ id: String(r.id), price: Number(r[field] ?? 0) })).filter((r) => r.price > 0);
  },
  ["sealed-bid-priced-ids"],
  { revalidate: 600 }
);

export async function dealRounds(country: Country, rounds: number): Promise<SbCard[][]> {
  const field = priceField(country);
  const pool = await pricedIds(field);
  const picked = pickTiers(pool, rounds);
  if (picked.length < rounds) return [];
  const ids = picked.flat();
  const cards = await prisma.card.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, slug: true, name: true, setCode: true, collectorNumber: true, imageThumbUrl: true,
      rarity: true, domain: true, type: true, might: true, energyCost: true,
      lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true, lowestPriceCentsEu: true,
    },
  });
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out: SbCard[][] = [];
  for (const round of picked) {
    const hand: SbCard[] = [];
    for (const id of round) {
      const c = byId.get(id);
      const price = c ? pickPrice(c, country) : null;
      if (!c || price == null || !c.imageThumbUrl) return [];
      hand.push({
        id: c.id,
        slug: c.slug,
        name: c.name,
        setCode: c.setCode,
        collectorNumber: c.collectorNumber,
        img: c.imageThumbUrl,
        rarity: c.rarity,
        domain: c.domain,
        type: c.type,
        might: c.might,
        energy: c.energyCost,
        priceCents: price,
        shards: shardsFor(price),
      });
    }
    // Shuffle within the hand so the chase card isn't always first.
    out.push(shuffle(hand));
  }
  return out;
}

// ── Persistence ──────────────────────────────────────────────────────────────

type Row = { code: string; state: SbState; version: number };

async function readRoom(code: string): Promise<Row | null> {
  const row = await prisma.gameRoom.findUnique({ where: { code }, select: { code: true, state: true, version: true } });
  if (!row) return null;
  return { code: row.code, state: row.state as unknown as SbState, version: row.version };
}

export async function createRoom(opts: {
  host: SbIdentity;
  country: Country;
  settings: SbSettings;
}): Promise<SbState> {
  const now = Date.now();
  // Housekeeping rides on room creation (cheap: indexed range delete), so the
  // table can't grow without bound and no cron is needed.
  await prisma.gameRoom
    .deleteMany({ where: { game: SEALED_BID_GAME_KEY, createdAt: { lt: new Date(now - SB.ROOM_TTL_MS) } } })
    .catch(() => undefined);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newRoomCode();
    const state = createState({
      code,
      host: opts.host,
      country: opts.country,
      currency: COUNTRIES[opts.country].currency,
      settings: opts.settings,
      now,
    });
    try {
      await prisma.gameRoom.create({
        data: { code, game: SEALED_BID_GAME_KEY, state: state as unknown as Prisma.InputJsonObject },
      });
      return state;
    } catch (e) {
      // P2002 = code collision (31^6 ≈ 887M codes, so this is near-impossible,
      // but a retry costs nothing). Anything else is real.
      if ((e as { code?: string })?.code !== "P2002") throw e;
    }
  }
  throw new SbError("Couldn't allocate a room code — try again.", 503);
}

// Read → transform → conditional write, retried on a lost race. The transform
// ALWAYS runs through `advance` first so a stale room catches up with the clock
// before the action is judged (e.g. a bid arriving after the deadline is
// rejected against the resolved round, not accepted into it).
export async function mutateRoom(
  code: string,
  fn: (state: SbState, now: number) => SbState | Promise<SbState>
): Promise<{ before: SbState; after: SbState }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await readRoom(code);
    if (!row) throw new SbError("That room doesn't exist (or has expired).", 404);
    const now = Date.now();
    const caughtUp = advance(row.state, now);
    const next = await fn(caughtUp, now);
    if (next === row.state) return { before: row.state, after: next };
    const res = await prisma.gameRoom.updateMany({
      where: { code, version: row.version },
      data: { state: next as unknown as Prisma.InputJsonObject, version: row.version + 1 },
    });
    if (res.count === 1) {
      await afterCommit(row.state, next);
      return { before: row.state, after: next };
    }
    // Lost the race — someone else wrote first. Tiny jittered backoff, then retry.
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40));
  }
  throw new SbError("The room is busy — try that again.", 503);
}

// A poll is a read that may still need to write: it refreshes presence and,
// when the clock has moved a phase on, persists the referee's decision so every
// other client sees the same resolved round.
export async function pollRoom(code: string, token: string | null): Promise<{ state: SbState; now: number }> {
  const { after } = await mutateRoom(code, (s, now) => touch(s, token, now));
  return { state: after, now: Date.now() };
}

// The one side effect outside the document: when a game finishes, signed-in
// players' totals go to the arcade leaderboard. Server-computed, so this is the
// first arcade board where the score can't be typed in by the client.
async function afterCommit(before: SbState, after: SbState): Promise<void> {
  if (before.phase === "over" || after.phase !== "over") return;
  await Promise.all(
    after.players
      .filter((p) => p.userId)
      .map(async (p) => {
        const s = after.standings?.find((x) => x.pid === p.pid);
        if (!s) return;
        await submitScore(p.userId!, SEALED_BID_GAME_KEY, s.total).catch(() => null);
      })
  );
}
