// COMMUNITY PULL RATES, as pure functions (2026-11-26; DECISIONS.md "Community pull rates").
//
// The pull tracker (lib/pull-tracker.ts) already lets anyone tap what a box gave them. This adds the one
// thing no Riftbound site publishes: what members ACTUALLY pulled, per set, beside Riot's own figures
// (lib/pack-composition.ts PULL_RATES). A signed-in member says "I opened N packs, and these were every
// Epic and Showcase in them" (tapped, or read by the card scanner); the site adds the counts up.
//
// THE RULES THIS FILE HOLDS
// - Members only: a log needs an account (one person, one daily cap), never an anonymous POST.
// - Private one by one, public only in aggregate: a page shows a set's totals and per-card counts, never a
//   log, a member, a date or a market. Nothing is published for a set until MIN_MEMBERS different members
//   and MIN_PACKS packs are in, so a single opener's box can never be read off the page.
// - Only Epic and up count. Riot publishes no rate for a Rare, and asking for every Rare (two a pack) is
//   the tedium that makes people stop logging. Every Epic and Showcase, or the log is wrong: the form says so.
// - Bounded: MAX_PACKS_PER_LOG a log, MAX_LOGS_PER_DAY a member, MAX_PACKS_PER_MEMBER_SET a member per set,
//   and at most MAX_HITS_PER_PACK hits a pack. A log over any of them is refused, not trimmed.
// - Nothing here changes a price, a ranking or an eBay call. It is counts.
import { isOvernumbered, isSignature, isUltimate } from "./constants";
import { LEGACY_PRERIFT_START } from "./sets/legacy";
import { PULL_RATES } from "./pack-composition";

export interface PullRateSet {
  slug: string;
  code: string;
  name: string;
  /** First day packs can be opened (Pre-Rift), for a set not out yet: logging opens then. */
  opensOn?: string;
}

/** Newest first. Proving Grounds is a boxed starter, not packs, so it is not here. */
export const PULL_RATE_SETS: PullRateSet[] = [
  { slug: "legacy", code: "LGC", name: "Legacy", opensOn: LEGACY_PRERIFT_START },
  { slug: "radiance", code: "RAD", name: "Radiance" },
  { slug: "vendetta", code: "VEN", name: "Vendetta" },
  { slug: "unleashed", code: "UNL", name: "Unleashed" },
  { slug: "spiritforged", code: "SFD", name: "Spirit Forged" },
  { slug: "origins", code: "OGN", name: "Origins" },
];

export const pullRateSetBySlug = (slug: string) => PULL_RATE_SETS.find((s) => s.slug === slug);
export const pullRateSetByCode = (code: string) => PULL_RATE_SETS.find((s) => s.code === code);

/** True once packs of this set can be opened (from midnight UTC of its Pre-Rift day). */
export function setIsOpen(set: PullRateSet, now: Date = new Date()): boolean {
  return !set.opensOn || now.getTime() >= Date.parse(`${set.opensOn}T00:00:00Z`);
}

export const MIN_MEMBERS = 3;
export const MIN_PACKS = 24;
export const MAX_PACKS_PER_LOG = 48;
export const MAX_LOGS_PER_DAY = 10;
export const MAX_PACKS_PER_MEMBER_SET = 480;
/** Two rare-or-better slots and a foil slot that can upgrade: three hits in one pack is the most possible. */
export const MAX_HITS_PER_PACK = 3;
export const MAX_HIT_LINES = 60;

export type PullTier = "epic" | "altart" | "overnumbered" | "signature" | "ultimate" | "showcase";

export interface TierInfo {
  key: PullTier;
  label: string;
  /** Riot's one-in-N packs (lib/pack-composition.ts), when Riot published one. */
  official: number | null;
}

const official = (k: string) => PULL_RATES.find((r) => r.key === k)?.onePerPacks ?? null;

/** Commonest first, the order of the table. */
export const PULL_TIERS: TierInfo[] = [
  { key: "epic", label: "Epic", official: official("epic") },
  { key: "altart", label: "Alternate art", official: official("altart") },
  { key: "showcase", label: "Other Showcase (alt-art runes, specials)", official: null },
  { key: "overnumbered", label: "Overnumbered", official: official("overnumbered") },
  { key: "signature", label: "Signature", official: official("signature") },
  { key: "ultimate", label: "Ultimate", official: official("ultimate") },
];

/** Sets that have an Ultimate print: the row is shown only there. */
export const SETS_WITH_ULTIMATE = ["UNL", "RAD"];

export interface TierCard {
  setCode: string;
  rarity: string;
  collectorNumber: string;
}

/** What a card counts as in the tally, or null when it is below Epic (not logged). The rarest tier wins. */
export function pullTier(c: TierCard): PullTier | null {
  const num = c.collectorNumber.trim();
  if (c.rarity === "Showcase" || c.rarity === "Epic") {
    if (isUltimate(c.setCode, num)) return "ultimate";
    if (isSignature(num)) return "signature";
    if (isOvernumbered(num)) return "overnumbered";
  }
  if (c.rarity === "Showcase") return /^\d+[a-z]\//i.test(num) ? "altart" : "showcase";
  if (c.rarity === "Epic") return "epic";
  return null;
}

export interface LoggableCard extends TierCard {
  id: string;
}

export interface PullLogInput {
  setCode: string;
  packs: number;
  hits: { cardId: string; tier: PullTier; qty: number }[];
  source: "scan" | "pick";
}

/**
 * Checks a log against the set's own card list. Refuses rather than repairs: a log with a card from
 * another set, a Rare, too many packs or more hits than packs can hold is someone's mistake, and a
 * trimmed version of it would still be wrong.
 */
export function parsePullLog(
  body: unknown,
  cards: LoggableCard[],
  now: Date = new Date(),
): { ok: true; log: PullLogInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const set = typeof b.set === "string" ? pullRateSetBySlug(b.set) ?? pullRateSetByCode(b.set) : undefined;
  if (!set) return { ok: false, error: "Pick the set you opened." };
  if (!setIsOpen(set, now)) return { ok: false, error: `${set.name} packs are not out yet. Logging opens on ${set.opensOn}.` };
  const packs = Number(b.packs);
  if (!Number.isInteger(packs) || packs < 1) return { ok: false, error: "Say how many packs you opened." };
  if (packs > MAX_PACKS_PER_LOG) return { ok: false, error: `Log at most ${MAX_PACKS_PER_LOG} packs (two boxes) at a time.` };
  const raw = Array.isArray(b.hits) ? b.hits : [];
  if (raw.length > MAX_HIT_LINES) return { ok: false, error: "That is more cards than one log can hold." };
  const byId = new Map(cards.filter((c) => c.setCode === set.code).map((c) => [c.id, c]));
  const merged = new Map<string, { cardId: string; tier: PullTier; qty: number }>();
  for (const h of raw) {
    const r = (h && typeof h === "object" ? h : {}) as Record<string, unknown>;
    const id = typeof r.cardId === "string" ? r.cardId : "";
    const qty = Number(r.qty ?? 1);
    const card = byId.get(id);
    if (!card) return { ok: false, error: `One of those cards is not a ${set.name} pack card.` };
    if (!Number.isInteger(qty) || qty < 1) return { ok: false, error: "Each card needs a count of one or more." };
    const tier = pullTier(card);
    if (!tier) continue; // a Rare or below from the tracker's list: not part of the tally
    const prev = merged.get(id);
    merged.set(id, { cardId: id, tier, qty: (prev?.qty ?? 0) + qty });
  }
  const hits = [...merged.values()];
  const total = hits.reduce((n, h) => n + h.qty, 0);
  if (total > packs * MAX_HITS_PER_PACK) return { ok: false, error: `${total} hits from ${packs} pack${packs === 1 ? "" : "s"} is more than packs can hold. Check the pack count.` };
  return { ok: true, log: { setCode: set.code, packs, hits, source: b.source === "scan" ? "scan" : "pick" } };
}

// ── The public tally ─────────────────────────────────────────────────────────

export interface SetTally {
  code: string;
  packs: number;
  logs: number;
  members: number;
  tiers: Record<PullTier, number>;
  /** Hit counts per card, most pulled first. */
  cards: { cardId: string; tier: PullTier; qty: number }[];
  /** False until MIN_MEMBERS members and MIN_PACKS packs: then nothing but the progress counts is shown. */
  published: boolean;
}

export interface PullTally {
  at: string;
  sets: Record<string, SetTally>;
}

const emptyTiers = (): Record<PullTier, number> => ({ epic: 0, altart: 0, showcase: 0, overnumbered: 0, signature: 0, ultimate: 0 });

/** Grouped rows (lib/pull-rates-server.ts) into the tally pages read. */
export function shapeTally(
  logs: { setCode: string; packs: number; logs: number }[],
  members: { setCode: string; members: number }[],
  hits: { setCode: string; cardId: string; tier: string; qty: number }[],
  at: Date,
): PullTally {
  const sets: Record<string, SetTally> = {};
  const get = (code: string) => (sets[code] ??= { code, packs: 0, logs: 0, members: 0, tiers: emptyTiers(), cards: [], published: false });
  for (const l of logs) {
    const s = get(l.setCode);
    s.packs += l.packs;
    s.logs += l.logs;
  }
  for (const m of members) get(m.setCode).members += m.members;
  const perCard = new Map<string, { cardId: string; tier: PullTier; qty: number; setCode: string }>();
  for (const h of hits) {
    if (!PULL_TIERS.some((t) => t.key === h.tier) || h.qty <= 0) continue;
    const tier = h.tier as PullTier;
    get(h.setCode).tiers[tier] += h.qty;
    const k = `${h.setCode}|${h.cardId}`;
    const prev = perCard.get(k);
    perCard.set(k, { setCode: h.setCode, cardId: h.cardId, tier, qty: (prev?.qty ?? 0) + h.qty });
  }
  for (const c of perCard.values()) get(c.setCode).cards.push({ cardId: c.cardId, tier: c.tier, qty: c.qty });
  for (const s of Object.values(sets)) {
    s.cards.sort((a, b) => b.qty - a.qty || a.cardId.localeCompare(b.cardId));
    s.published = s.members >= MIN_MEMBERS && s.packs >= MIN_PACKS;
    // An unpublished set says only how far it has to go: no tier or card counts leave the server.
    if (!s.published) {
      s.tiers = emptyTiers();
      s.cards = [];
    }
  }
  return { at: at.toISOString(), sets };
}

/** "1 in 3.8 packs" style figure: packs per hit, or null with no hits. */
export function onePer(packs: number, hits: number): number | null {
  if (hits <= 0 || packs <= 0) return null;
  return packs / hits;
}

export function onePerText(n: number | null): string {
  if (n == null) return "none yet";
  if (n < 1.05) return "about 1 a pack";
  const v = n < 10 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.round(n));
  return `1 in ${v} packs`;
}

/** Per 24-pack box, for the "per box" column. */
export function perBox(packs: number, hits: number): number {
  return packs > 0 ? (hits / packs) * 24 : 0;
}

/** How far a set is from being published, for the "help fill this in" line. */
export function toPublish(s: Pick<SetTally, "packs" | "members"> | undefined): { packs: number; members: number } {
  return { packs: Math.max(0, MIN_PACKS - (s?.packs ?? 0)), members: Math.max(0, MIN_MEMBERS - (s?.members ?? 0)) };
}
