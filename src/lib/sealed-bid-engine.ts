// Sealed Bid — the rules engine for RiftCompare's multiplayer blind-auction game
// (/games/sealed-bid). PURE: no database, no clock of its own (every entry point
// takes `now`), no randomness after the cards are dealt. The whole game is one
// JSON document (`SbState`) that lives in a GameRoom row; lib/sealed-bid.ts is
// the only thing that reads and writes it.
//
// Why pure + one document: the site is serverless (Vercel) with no websocket
// layer, so multiplayer has to be "clients poll, the server is the referee".
// Making every transition a deterministic function of (state, action, now) is
// what lets ANY request — a bid, or a poll from someone who just tabbed back —
// safely advance a stalled room, and it is what tests/sealed-bid.test.ts pins.
//
// ── The game ─────────────────────────────────────────────────────────────────
// 2–6 rival collectors, 1,000 Shards each. Each round three real Riftbound
// cards go under the hammer with their live market price HIDDEN. Everyone
// seals one bid on one card. Highest bid wins and pays it; a tie for the top
// bid SHATTERS the card (nobody gets it, the tied bidders each lose half their
// bid). Then the prices are revealed. After the last round the vault is
// appraised: the cards' market value in Shards + half your unspent Shards +
// set bonuses. Highest total wins. Two one-shot power plays per player:
// Appraise (privately peek at one card's real price) and Surge (this round's
// bid counts +25% against rivals, but you still only pay what you bid).

export const SB = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 6,
  START_SHARDS: 1000,
  CARDS_PER_ROUND: 3,
  ROUND_OPTIONS: [6, 8, 10] as const,
  TIMER_OPTIONS: [30, 45, 60] as const,
  DEFAULT_ROUNDS: 8,
  DEFAULT_TIMER: 45,
  // How long the reveal screen stays up before the next round deals itself.
  REVEAL_MS: 10_000,
  SURGE_PCT: 25,
  // Unspent Shards count at half value — sitting on your budget is safe, not free.
  LEFTOVER_RATE: 0.5,
  BONUS: {
    // Every domain you hold 3+ cards of.
    DOMAIN_SET: 150,
    // 5+ different domains in one vault.
    RAINBOW: 250,
    // Total Might across your vault's units at or above WARBAND_MIGHT.
    WARBAND: 150,
  },
  RAINBOW_DOMAINS: 5,
  WARBAND_MIGHT: 20,
  NAME_MIN: 2,
  NAME_MAX: 16,
  // A lobby nobody starts, or a finished game, is purged after this.
  ROOM_TTL_MS: 6 * 60 * 60 * 1000,
} as const;

export type SbPhase = "lobby" | "bidding" | "reveal" | "over";

// A card as dealt into a round. `priceCents` is the live market price in the
// room's currency and `shards` its appraisal (see shardsFor) — both are secrets
// until the round resolves, and `viewFor` is what enforces that.
export interface SbCard {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  img: string;
  rarity: string;
  domain: string;
  type: string;
  might: number | null;
  energy: number | null;
  priceCents: number;
  shards: number;
}

export interface SbBid {
  card: number; // index into the round's cards
  amount: number; // whole Shards, 0 = pass
  surge: boolean;
  at: number;
}

export interface SbVaultEntry {
  round: number;
  card: number;
  paid: number;
}

export interface SbPlayer {
  token: string; // bearer secret — NEVER leaves the server (viewFor strips it)
  pid: string; // public id
  name: string;
  userId: string | null;
  shards: number;
  vault: SbVaultEntry[];
  appraiseUsed: boolean;
  surgeUsed: boolean;
  joinedAt: number;
  lastSeenAt: number;
}

export interface SbCardResult {
  card: number;
  winnerPid: string | null;
  shattered: boolean;
  bids: { pid: string; amount: number; effective: number; surge: boolean }[];
}

export interface SbRound {
  cards: SbCard[];
  bids: Record<string, SbBid>; // pid → bid
  appraisals: Record<string, number>; // pid → card index they peeked at
  result: { cards: SbCardResult[]; resolvedAt: number } | null;
}

export interface SbBonus {
  key: "domain-set" | "rainbow" | "warband";
  label: string;
  points: number;
}

export interface SbStanding {
  pid: string;
  rank: number;
  vaultShards: number;
  leftoverShards: number;
  leftoverCredit: number;
  bonuses: SbBonus[];
  total: number;
  totalMight: number;
  domains: string[];
}

export interface SbSettings {
  rounds: number;
  timerSec: number;
}

export interface SbState {
  v: 1;
  code: string;
  hostPid: string;
  country: string;
  currency: string;
  settings: SbSettings;
  phase: SbPhase;
  round: number; // 0-based index of the current round
  phaseEndsAt: number | null;
  players: SbPlayer[];
  rounds: SbRound[]; // empty until the host starts; then fully dealt up front
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  standings: SbStanding[] | null;
  nextCode: string | null; // rematch room, once the host opens one
}

export class SbError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// 1 Shard = 10 cents of live market price, floor 1. The same unit in every
// market: everyone in a room shares one currency, so only the ratio matters.
export function shardsFor(priceCents: number): number {
  return Math.max(1, Math.round(priceCents / 10));
}

export function cleanName(raw: unknown): string {
  const s = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SB.NAME_MAX);
  if (s.length < SB.NAME_MIN) throw new SbError(`Pick a name of ${SB.NAME_MIN}–${SB.NAME_MAX} characters.`);
  return s;
}

export function normalizeSettings(raw: { rounds?: unknown; timerSec?: unknown } | null | undefined): SbSettings {
  const r = Number(raw?.rounds);
  const t = Number(raw?.timerSec);
  return {
    rounds: (SB.ROUND_OPTIONS as readonly number[]).includes(r) ? r : SB.DEFAULT_ROUNDS,
    timerSec: (SB.TIMER_OPTIONS as readonly number[]).includes(t) ? t : SB.DEFAULT_TIMER,
  };
}

function findByToken(state: SbState, token: string | null | undefined): SbPlayer {
  const p = token ? state.players.find((x) => x.token === token) : undefined;
  if (!p) throw new SbError("You're not in this room — join it first.", 403);
  return p;
}

function currentRound(state: SbState): SbRound {
  const r = state.rounds[state.round];
  if (!r) throw new SbError("No round in progress.", 409);
  return r;
}

function uniqueName(state: SbState, name: string): string {
  const taken = new Set(state.players.map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; i < 100; i++) {
    const candidate = `${name.slice(0, SB.NAME_MAX - String(i).length - 1)} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  throw new SbError("Couldn't find a free name.");
}

// ── Dealing (the pure half — lib/sealed-bid.ts supplies the card pool) ───────
//
// Each round is one card from each price tier, so every hand has a chase card
// worth fighting over, a mid-range card where price knowledge separates the
// players, and a cheap one that punishes an over-bid. Tiers are in cents of
// the room's market; the same three thresholds work across every currency the
// site prices in because the shape of the market (a long cheap tail and a few
// expensive chase cards) is the same everywhere.
export const TIER_CHASE_MIN = 800; // ≥ $8
export const TIER_MID_MIN = 150; // $1.50 – $7.99; below is "budget"

export type Priced = { id: string; price: number };

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick `rounds` triples of ids (one per tier) without repeats. A thin tier
// borrows from its neighbours so a small market still deals a full game.
export function pickTiers(pool: Priced[], rounds: number): string[][] {
  const chase = shuffle(pool.filter((p) => p.price >= TIER_CHASE_MIN));
  const mid = shuffle(pool.filter((p) => p.price >= TIER_MID_MIN && p.price < TIER_CHASE_MIN));
  const budget = shuffle(pool.filter((p) => p.price < TIER_MID_MIN));
  const tiers = [chase, mid, budget];
  const used = new Set<string>();
  const take = (preferred: number): string | null => {
    // preferred tier first, then the others in order of closeness.
    for (const t of [preferred, ...[0, 1, 2].filter((i) => i !== preferred).sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))]) {
      while (tiers[t].length) {
        const c = tiers[t].pop()!;
        if (!used.has(c.id)) {
          used.add(c.id);
          return c.id;
        }
      }
    }
    return null;
  };
  const out: string[][] = [];
  for (let r = 0; r < rounds; r++) {
    const ids = [take(0), take(1), take(2)];
    if (ids.some((x) => x == null)) return out;
    out.push(ids as string[]);
  }
  return out;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export interface SbIdentity {
  token: string;
  pid: string;
  name: string;
  userId: string | null;
}

function newPlayer(id: SbIdentity, now: number): SbPlayer {
  return {
    token: id.token,
    pid: id.pid,
    name: id.name,
    userId: id.userId,
    shards: SB.START_SHARDS,
    vault: [],
    appraiseUsed: false,
    surgeUsed: false,
    joinedAt: now,
    lastSeenAt: now,
  };
}

export function createState(opts: {
  code: string;
  host: SbIdentity;
  country: string;
  currency: string;
  settings: SbSettings;
  now: number;
}): SbState {
  return {
    v: 1,
    code: opts.code,
    hostPid: opts.host.pid,
    country: opts.country,
    currency: opts.currency,
    settings: opts.settings,
    phase: "lobby",
    round: 0,
    phaseEndsAt: null,
    players: [newPlayer({ ...opts.host, name: cleanName(opts.host.name) }, opts.now)],
    rounds: [],
    createdAt: opts.now,
    startedAt: null,
    finishedAt: null,
    standings: null,
    nextCode: null,
  };
}

export function join(state: SbState, id: SbIdentity, now: number): SbState {
  if (state.phase !== "lobby") throw new SbError("That game has already started.", 409);
  if (state.players.length >= SB.MAX_PLAYERS) throw new SbError(`Room is full (${SB.MAX_PLAYERS} players max).`, 409);
  if (state.players.some((p) => p.token === id.token || p.pid === id.pid)) return state;
  const name = uniqueName(state, cleanName(id.name));
  return { ...state, players: [...state.players, newPlayer({ ...id, name }, now)] };
}

export function leave(state: SbState, token: string, now: number): SbState {
  const p = findByToken(state, token);
  if (state.phase !== "lobby") throw new SbError("You can't leave a game in progress — it ends when the last round does.", 409);
  const players = state.players.filter((x) => x.pid !== p.pid);
  // Host leaves → the longest-standing remaining player inherits the room.
  const hostPid = p.pid === state.hostPid ? players[0]?.pid ?? state.hostPid : state.hostPid;
  return { ...state, players, hostPid, ...(players.length === 0 ? { finishedAt: now } : {}) };
}

// `dealt` is rounds × CARDS_PER_ROUND fully-priced cards, dealt by the caller
// (lib/sealed-bid.ts) from the live database. Dealing everything up front is
// what keeps every later transition synchronous and pure.
export function start(state: SbState, token: string, dealt: SbCard[][], now: number): SbState {
  const p = findByToken(state, token);
  if (p.pid !== state.hostPid) throw new SbError("Only the host can start the game.", 403);
  if (state.phase !== "lobby") throw new SbError("The game has already started.", 409);
  if (state.players.length < SB.MIN_PLAYERS) throw new SbError(`You need at least ${SB.MIN_PLAYERS} players.`, 409);
  if (dealt.length !== state.settings.rounds || dealt.some((r) => r.length !== SB.CARDS_PER_ROUND)) {
    throw new SbError("Couldn't deal enough priced cards for a full game — try again in a moment.", 503);
  }
  return {
    ...state,
    phase: "bidding",
    round: 0,
    startedAt: now,
    phaseEndsAt: now + state.settings.timerSec * 1000,
    rounds: dealt.map((cards) => ({ cards, bids: {}, appraisals: {}, result: null })),
  };
}

export function bid(
  state: SbState,
  token: string,
  raw: { card: unknown; amount: unknown; surge?: unknown },
  now: number
): SbState {
  const p = findByToken(state, token);
  if (state.phase !== "bidding") throw new SbError("Bidding is closed for this round.", 409);
  const round = currentRound(state);
  if (round.bids[p.pid]) throw new SbError("Your bid is already sealed for this round.", 409);
  const card = Number(raw.card);
  if (!Number.isInteger(card) || card < 0 || card >= round.cards.length) throw new SbError("Pick a card to bid on.");
  const amount = Number(raw.amount);
  if (!Number.isInteger(amount) || amount < 0) throw new SbError("Bids are whole Shards, 0 to pass.");
  if (amount > p.shards) throw new SbError(`You only have ${p.shards} Shards.`);
  const wantsSurge = raw.surge === true && amount > 0;
  if (wantsSurge && p.surgeUsed) throw new SbError("You've already used your Surge.", 409);

  const players = state.players.map((x) =>
    x.pid === p.pid ? { ...x, surgeUsed: x.surgeUsed || wantsSurge, lastSeenAt: now } : x
  );
  const rounds = state.rounds.slice();
  rounds[state.round] = { ...round, bids: { ...round.bids, [p.pid]: { card, amount, surge: wantsSurge, at: now } } };
  // Everyone sealed → resolve right away rather than waiting out the clock.
  return advance({ ...state, players, rounds }, now);
}

export function appraise(state: SbState, token: string, rawCard: unknown, now: number): SbState {
  const p = findByToken(state, token);
  if (state.phase !== "bidding") throw new SbError("You can only appraise while bidding is open.", 409);
  if (p.appraiseUsed) throw new SbError("You've already used your Appraise.", 409);
  const round = currentRound(state);
  if (round.bids[p.pid]) throw new SbError("Your bid is sealed — too late to appraise this round.", 409);
  const card = Number(rawCard);
  if (!Number.isInteger(card) || card < 0 || card >= round.cards.length) throw new SbError("Pick a card to appraise.");
  const rounds = state.rounds.slice();
  rounds[state.round] = { ...round, appraisals: { ...round.appraisals, [p.pid]: card } };
  const players = state.players.map((x) => (x.pid === p.pid ? { ...x, appraiseUsed: true, lastSeenAt: now } : x));
  return { ...state, players, rounds };
}

// Presence: a poll from a known player refreshes their lastSeenAt (at most
// every 5s so idle polling doesn't churn the row).
export function touch(state: SbState, token: string | null | undefined, now: number): SbState {
  if (!token) return state;
  const p = state.players.find((x) => x.token === token);
  if (!p || now - p.lastSeenAt < 5000) return state;
  return { ...state, players: state.players.map((x) => (x.pid === p.pid ? { ...x, lastSeenAt: now } : x)) };
}

export function setNextCode(state: SbState, token: string, nextCode: string): SbState {
  const p = findByToken(state, token);
  if (p.pid !== state.hostPid) throw new SbError("Only the host can open a rematch.", 403);
  if (state.phase !== "over") throw new SbError("Finish this game first.", 409);
  if (state.nextCode) throw new SbError("A rematch room is already open.", 409);
  return { ...state, nextCode };
}

// ── The referee ──────────────────────────────────────────────────────────────

// Advance every transition that `now` allows. Called on EVERY read and write, so
// a room whose players all wandered off still resolves its rounds — with the
// transition timestamps chained off the deadlines, not the wall clock, so the
// result is the same whoever's request happens to trigger it.
export function advance(state: SbState, now: number): SbState {
  let s = state;
  for (let guard = 0; guard < 64; guard++) {
    if (s.phase === "bidding") {
      const round = s.rounds[s.round];
      const everyoneIn = s.players.every((p) => !!round.bids[p.pid]);
      const timedOut = s.phaseEndsAt != null && now >= s.phaseEndsAt;
      if (!everyoneIn && !timedOut) return s;
      const at = everyoneIn ? Math.min(now, s.phaseEndsAt ?? now) : s.phaseEndsAt!;
      s = resolveRound(s, at);
      continue;
    }
    if (s.phase === "reveal") {
      if (s.phaseEndsAt == null || now < s.phaseEndsAt) return s;
      const at = s.phaseEndsAt;
      if (s.round + 1 < s.rounds.length) {
        s = { ...s, phase: "bidding", round: s.round + 1, phaseEndsAt: at + s.settings.timerSec * 1000 };
      } else {
        s = finish(s, at);
      }
      continue;
    }
    return s;
  }
  return s;
}

export function effectiveBid(amount: number, surge: boolean): number {
  return surge ? Math.floor((amount * (100 + SB.SURGE_PCT)) / 100) : amount;
}

function resolveRound(state: SbState, at: number): SbState {
  const round = state.rounds[state.round];
  const players = state.players.map((p) => ({ ...p, vault: p.vault.slice() }));
  const byPid = new Map(players.map((p) => [p.pid, p]));

  const results: SbCardResult[] = round.cards.map((_, card) => {
    const bids = Object.entries(round.bids)
      .filter(([, b]) => b.card === card && b.amount > 0)
      .map(([pid, b]) => ({ pid, amount: b.amount, effective: effectiveBid(b.amount, b.surge), surge: b.surge }))
      .sort((a, b) => b.effective - a.effective || a.amount - b.amount);
    if (bids.length === 0) return { card, winnerPid: null, shattered: false, bids };
    const top = bids[0].effective;
    const tied = bids.filter((b) => b.effective === top);
    if (tied.length > 1) {
      // Shatter: no winner, each tied bidder burns half their bid.
      for (const t of tied) {
        const p = byPid.get(t.pid)!;
        p.shards -= Math.floor(t.amount / 2);
      }
      return { card, winnerPid: null, shattered: true, bids };
    }
    const w = byPid.get(bids[0].pid)!;
    w.shards -= bids[0].amount;
    w.vault.push({ round: state.round, card, paid: bids[0].amount });
    return { card, winnerPid: w.pid, shattered: false, bids };
  });

  const rounds = state.rounds.slice();
  rounds[state.round] = { ...round, result: { cards: results, resolvedAt: at } };
  return { ...state, players, rounds, phase: "reveal", phaseEndsAt: at + SB.REVEAL_MS };
}

export function vaultCards(state: SbState, p: SbPlayer): (SbCard & { paid: number })[] {
  return p.vault.map((e) => ({ ...state.rounds[e.round].cards[e.card], paid: e.paid }));
}

export function scorePlayer(state: SbState, p: SbPlayer): Omit<SbStanding, "rank"> {
  const cards = vaultCards(state, p);
  const vaultShards = cards.reduce((n, c) => n + c.shards, 0);
  const leftoverCredit = Math.floor(p.shards * SB.LEFTOVER_RATE);
  const totalMight = cards.reduce((n, c) => n + (c.might ?? 0), 0);

  const byDomain = new Map<string, number>();
  for (const c of cards) byDomain.set(c.domain, (byDomain.get(c.domain) ?? 0) + 1);
  const domains = [...byDomain.keys()].sort();

  const bonuses: SbBonus[] = [];
  for (const [domain, n] of [...byDomain.entries()].sort()) {
    if (n >= 3) bonuses.push({ key: "domain-set", label: `${domain} set ×${n}`, points: SB.BONUS.DOMAIN_SET });
  }
  if (domains.length >= SB.RAINBOW_DOMAINS) bonuses.push({ key: "rainbow", label: `Rainbow (${domains.length} domains)`, points: SB.BONUS.RAINBOW });
  if (totalMight >= SB.WARBAND_MIGHT) bonuses.push({ key: "warband", label: `Warband (${totalMight} Might)`, points: SB.BONUS.WARBAND });

  const total = vaultShards + leftoverCredit + bonuses.reduce((n, b) => n + b.points, 0);
  return { pid: p.pid, vaultShards, leftoverShards: p.shards, leftoverCredit, bonuses, total, totalMight, domains };
}

function finish(state: SbState, at: number): SbState {
  const scored = state.players.map((p) => ({ s: scorePlayer(state, p), p }));
  scored.sort(
    (a, b) =>
      b.s.total - a.s.total ||
      b.p.vault.length - a.p.vault.length ||
      b.s.vaultShards - a.s.vaultShards ||
      a.p.joinedAt - b.p.joinedAt
  );
  const standings: SbStanding[] = scored.map((x, i) => ({ ...x.s, rank: i + 1 }));
  return { ...state, phase: "over", phaseEndsAt: null, finishedAt: at, standings };
}

// ── What a client is allowed to see ──────────────────────────────────────────

export interface SbViewCard extends Omit<SbCard, "priceCents" | "shards"> {
  priceCents: number | null;
  shards: number | null;
}

export interface SbViewPlayer {
  pid: string;
  name: string;
  shards: number;
  vaultCount: number;
  sealed: boolean;
  appraiseUsed: boolean;
  surgeUsed: boolean;
  isHost: boolean;
  isYou: boolean;
  online: boolean;
}

export interface SbView {
  code: string;
  phase: SbPhase;
  round: number;
  totalRounds: number;
  timerSec: number;
  currency: string;
  country: string;
  serverNow: number;
  phaseEndsAt: number | null;
  hostPid: string;
  players: SbViewPlayer[];
  you: {
    pid: string;
    name: string;
    shards: number;
    appraiseUsed: boolean;
    surgeUsed: boolean;
    bid: SbBid | null;
    appraised: number | null; // card index you peeked at this round
    vault: (SbViewCard & { paid: number; round: number })[];
  } | null;
  cards: SbViewCard[]; // current round (prices hidden while bidding)
  result: SbRound["result"];
  history: { round: number; cards: SbViewCard[]; result: SbRound["result"] }[];
  standings: SbStanding[] | null;
  nextCode: string | null;
  minPlayers: number;
  maxPlayers: number;
  startShards: number;
}

function reveal(c: SbCard, show: boolean): SbViewCard {
  return show ? { ...c } : { ...c, priceCents: null, shards: null };
}

export function viewFor(state: SbState, token: string | null | undefined, now: number): SbView {
  const me = token ? state.players.find((p) => p.token === token) ?? null : null;
  const round = state.rounds[state.round] ?? null;
  const roundOpen = state.phase === "bidding";
  const myPeek = me && round ? round.appraisals[me.pid] ?? null : null;

  const cards = round ? round.cards.map((c, i) => reveal(c, !roundOpen || i === myPeek)) : [];
  const history = state.rounds
    .map((r, i) => ({ round: i, cards: r.cards.map((c) => reveal(c, true)), result: r.result }))
    .filter((h) => h.result != null && h.round !== (state.phase === "reveal" ? state.round : -1));

  return {
    code: state.code,
    phase: state.phase,
    round: state.round,
    totalRounds: state.settings.rounds,
    timerSec: state.settings.timerSec,
    currency: state.currency,
    country: state.country,
    serverNow: now,
    phaseEndsAt: state.phaseEndsAt,
    hostPid: state.hostPid,
    players: state.players.map((p) => ({
      pid: p.pid,
      name: p.name,
      shards: p.shards,
      vaultCount: p.vault.length,
      sealed: !!(round && roundOpen && round.bids[p.pid]),
      appraiseUsed: p.appraiseUsed,
      surgeUsed: p.surgeUsed,
      isHost: p.pid === state.hostPid,
      isYou: !!me && p.pid === me.pid,
      online: now - p.lastSeenAt < 20_000,
    })),
    you: me
      ? {
          pid: me.pid,
          name: me.name,
          shards: me.shards,
          appraiseUsed: me.appraiseUsed,
          surgeUsed: me.surgeUsed,
          bid: round ? round.bids[me.pid] ?? null : null,
          appraised: myPeek,
          vault: me.vault.map((e) => ({ ...reveal(state.rounds[e.round].cards[e.card], true), paid: e.paid, round: e.round })),
        }
      : null,
    cards,
    result: state.phase === "reveal" && round ? round.result : null,
    history,
    standings: state.standings,
    nextCode: state.nextCode,
    minPlayers: SB.MIN_PLAYERS,
    maxPlayers: SB.MAX_PLAYERS,
    startShards: SB.START_SHARDS,
  };
}

// Wordle-style share blurb for the final screen.
export function shareText(state: SbState, pid: string): string {
  const s = state.standings?.find((x) => x.pid === pid);
  const p = state.players.find((x) => x.pid === pid);
  if (!s || !p) return "";
  const medal = s.rank === 1 ? "🥇" : s.rank === 2 ? "🥈" : s.rank === 3 ? "🥉" : `#${s.rank}`;
  return `🔨 Sealed Bid — ${medal} of ${state.players.length} with ${s.total.toLocaleString()} pts (${p.vault.length} cards in the vault)\nriftcompare.com/games/sealed-bid`;
}
