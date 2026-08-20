// Box EV model — the maths, with no React and no Prisma, so it can be unit-tested
// without a database. The page supplies rows; this decides pools, averages and EV.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO DELIBERATE CHANGES FROM THE ORIGINAL MODEL
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. CHASE PRINTS ARE NOW IN THE EV, NOT DELETED FROM IT.
//    The old page detected signature / over-numbered / alt-art prints and
//    `continue`d — they were stripped from the base rarity pools (correct: a
//    1-in-720 card must not be averaged into a normal Showcase pull) and then
//    never added back anywhere. So the tool silently understated every box by
//    the entire value of the cards people actually open boxes hoping to hit.
//    They now get their OWN pools with their own pull rates.
//
// 2. EVERY VALUE COMES FROM THE TCGPLAYER US MARKET PRICE, CONVERTED.
//    The old page used the cheapest tracked STORE listing in the viewer's own
//    market. That had three problems: coverage was sparse outside AU (so EV
//    swung by country for reasons that had nothing to do with the cards), a
//    store's asking price is not a market value, and it needed an eBay carve-out
//    because eBay's per-listing shipping floor inflated bulk. The TCGplayer US
//    market price is TCGplayer's own computed fair-market value, it exists for
//    essentially every card, and it is the same number for everyone — so the EV
//    is consistent across markets and only the currency changes.
//
//    The honest cost of that choice, which the UI must state: a converted US
//    market price is NOT local retail. AU singles typically sell above the
//    converted USD figure, so this reads low against what you would actually pay
//    at a local store. It is a consistent yardstick, not a local quote.

import { isCrystalRose, isOvernumbered, isSignature, RARITY_KEYS } from "./constants";
import { printingKind } from "./content/card-narrative";

// ── Pools ────────────────────────────────────────────────────────────────────
// A "pool" is a set of cards one pack slot can produce. Base rarities plus the
// three chase tiers, which are kept SEPARATE rather than merged into a single
// "chase" bucket: they have wildly different rarities and values, so averaging a
// signature together with an alt-art would reproduce the exact distortion that
// made excluding them necessary in the first place.
export const BASE_POOLS = ["Common", "Uncommon", "Rare", "Epic", "Showcase"] as const;
export const CHASE_POOLS = ["AltArt", "Overnumbered", "Signature"] as const;
export const POOL_ORDER = [...BASE_POOLS, ...CHASE_POOLS] as const;
export type PoolKey = (typeof POOL_ORDER)[number];

export const POOL_LABEL: Record<PoolKey, string> = {
  Common: "Common",
  Uncommon: "Uncommon",
  Rare: "Rare",
  Epic: "Epic",
  Showcase: "Showcase",
  AltArt: "Alt art",
  Overnumbered: "Over-numbered",
  Signature: "Signature",
};

export const isChasePool = (k: PoolKey): boolean => (CHASE_POOLS as readonly string[]).includes(k);

/** The minimum a card needs for us to classify it. */
export interface PoolCard {
  setCode: string;
  collectorNumber: string;
  rarity: string;
  variant?: string | null;
  isPromo?: boolean;
  /** Denormalised column; the string predicate is used as a belt-and-braces OR. */
  isOvernumbered?: boolean;
}

/**
 * Which pool a card belongs to, or null if it is not a pack pull at all.
 *
 * ORDER IS LOAD-BEARING and matches the canonical rules in constants.ts that
 * tests/rarity.test.ts pins:
 *   • promos are not pack pulls — they come from events and boxes toppers;
 *   • signature takes precedence over over-numbered (isOvernumbered already
 *     returns false for a "*" number, but the explicit order documents it);
 *   • alt-art clones are identified by `variant`, not by their number;
 *   • ANYTHING ELSE falls through to its printed rarity, which leaves an
 *     unparseable number ("TBA", "R01") in its base tier, per rarity.test.ts.
 *
 * This replaces the page's old hand-rolled isSpecialPrint(), which tested for a
 * LETTER in the numerator and documented the example "223s/221". No such shape
 * exists: a real signature is collector number 197 followed by a star, over a
 * total of 166. The letter branch therefore never fired for a signature, and
 * signatures were excluded only because they also happen to be numbered above
 * the set total. A signature numbered inside the base range would have been
 * silently averaged into a base pool. It also wrongly swept up Crystal Rose,
 * runes and tokens.
 *
 * CRYSTAL ROSE IS DELIBERATELY POOLED WITH ALT-ART HERE, even though the rarity
 * taxonomy keeps SP1–SP6 at their genuine Epic tier (constants.ts:354-360, and
 * tests/rarity.test.ts pins it). These pools are PULL SLOTS, not rarities: the
 * Crystal Rose prints come out of the same slot as the set's other alt arts.
 * Do not "fix" this to match chasePrintRarity() — they answer different
 * questions, and this file must not change the rarity rule.
 */
export function poolOf(card: PoolCard): PoolKey | null {
  // PROMO IS CHECKED FIRST, ahead of printingKind(), and the order genuinely
  // differs from that helper on purpose. printingKind() ranks over-numbered
  // ABOVE promo because it answers "what should the card page's Printing cell
  // say?" — and for an over-numbered promo, "Overnumbered" is the more useful
  // label. This function answers a different question: "which pack slot
  // produced this card?" A promo did not come out of a pack at all, whatever
  // its collector number, so it must be excluded before any other test.
  if (card.isPromo) return null;

  const kind = printingKind({
    isCrystalRose: isCrystalRose(card.setCode, card.collectorNumber),
    isSignature: isSignature(card.collectorNumber),
    isOvernumbered: card.isOvernumbered || isOvernumbered(card.collectorNumber),
    isPromo: card.isPromo ?? false,
    variant: card.variant ?? null,
  });
  switch (kind) {
    case "promo":
      return null; // event/box-topper distribution, not a pack pull
    case "signature":
      return "Signature";
    case "overnumbered":
      return "Overnumbered";
    case "crystal-rose":
    case "alternate-art":
      return "AltArt";
    case "base":
      return (RARITY_KEYS as string[]).includes(card.rarity) ? (card.rarity as PoolKey) : null;
  }
}

// ── Pool statistics ──────────────────────────────────────────────────────────

export interface PoolStat {
  /** Mean value of a RANDOM card from this pool, in the display currency. */
  avgCents: number;
  /** Cards in the pool that carry a market price. */
  priced: number;
  /** Every card in the pool, priced or not. */
  total: number;
  /** Most valuable card in the pool — drives the "what am I chasing" display. */
  topCents: number;
}

/**
 * Mean value of a random card of each pool.
 *
 * Divides by EVERY card in the pool, not just the priced ones: a card with no
 * market price is genuinely worth ~nothing to a box opener, and dividing by the
 * priced subset would silently claim the unpriced tail is as valuable as the
 * priced head.
 *
 * NO OUTLIER CAP, unlike the old model. That cap existed because a single
 * mis-keyed STORE listing could define a whole rarity's average. A TCGplayer
 * market price cannot: it is TCGplayer's own aggregate, not one seller's ask.
 * More importantly, capping is actively wrong now — in a chase pool the
 * expensive card IS the signal, and a median-anchored cap would shave off
 * exactly the value this change exists to include.
 */
export function poolStats(
  cards: readonly (PoolCard & { valueCents: number | null })[],
): Map<PoolKey, PoolStat> {
  const acc = new Map<PoolKey, { sum: number; priced: number; total: number; top: number }>();
  for (const c of cards) {
    const pool = poolOf(c);
    if (!pool) continue;
    const cell = acc.get(pool) ?? { sum: 0, priced: 0, total: 0, top: 0 };
    cell.total += 1;
    if (c.valueCents != null && c.valueCents > 0) {
      cell.sum += c.valueCents;
      cell.priced += 1;
      if (c.valueCents > cell.top) cell.top = c.valueCents;
    }
    acc.set(pool, cell);
  }
  const out = new Map<PoolKey, PoolStat>();
  for (const [pool, { sum, priced, total, top }] of acc) {
    out.set(pool, { avgCents: total > 0 ? Math.round(sum / total) : 0, priced, total, topCents: top });
  }
  return out;
}

/**
 * Adapter for the page, which has already aggregated per pool server-side (in
 * USD cents) and ships only the totals plus a capped sample of cards. Keeps the
 * client from having to receive every card in the set just to recompute a mean
 * it was already told.
 */
export function poolStatsFromPools(
  pools: readonly { pool: PoolKey; avgUsdCents: number; topUsdCents: number; priced: number; total: number }[],
): Map<PoolKey, PoolStat> {
  return new Map(
    pools.map((p) => [
      p.pool,
      { avgCents: p.avgUsdCents, topCents: p.topUsdCents, priced: p.priced, total: p.total },
    ]),
  );
}

// ── Pull rates ───────────────────────────────────────────────────────────────
//
// EXPECTED CARDS PER PACK, not probabilities. Expected value is linear, so these
// do not need to form a distribution — E[pack] = Σ rate × mean holds whatever
// they sum to. That is why the UI can expose them as free-form numbers and still
// be mathematically sound. It also means a nonsense configuration produces a
// nonsense EV silently, so the UI surfaces the implied cards-per-pack total as a
// sanity check.
//
// PROVENANCE, because this matters more than the numbers themselves.
//
// BASE RATES come from the magicalmeta.ink community pull-rate guide for
// Riftbound: Origins — observed box/case data, not a guess.
export const DEFAULT_BASE_RATES: Record<string, number> = {
  Common: 7,
  Uncommon: 3,
  Rare: 2,
  Epic: 0.25, // ~1 in 4 packs
};

export const DEFAULT_PACKS = 24;

// ── The special-treatment slot ───────────────────────────────────────────────
//
// Riot publishes NO odds for signature, over-numbered or alt-art prints. The
// temptation is to invent one rate per tier; that would be four fabricated
// numbers wearing the authority of a calculator, and it would also silently
// INFLATE the EV — the old model already spent ~1-in-72-packs on Showcase, so
// bolting three more independent rates on top would count the same hit slot
// four times over.
//
// Instead there is ONE assumption, and the user can see and change it: how many
// special-treatment cards a box yields. The default 0.33/box is not a new claim
// — it is exactly the Showcase rate the tool already used (0.0139/pack × 24
// packs ≈ 0.33), so switching to this model does not move the headline number
// on its own. It is then split across the four special pools IN PROPORTION TO
// HOW MANY CARDS EACH POOL CONTAINS.
//
// That proportional split is itself a crude assumption and the UI says so:
// signatures are widely reported as rarer than their share of the card count
// would imply. Every derived rate stays individually editable for exactly that
// reason.
export const DEFAULT_SPECIALS_PER_BOX = 0.33;

/** Pools that share the one special-treatment slot. */
export const SPECIAL_POOLS = ["Showcase", ...CHASE_POOLS] as const;

/**
 * Expected cards per pack for every pool.
 *
 * Base pools take their community rate. The special pools split
 * `specialsPerBox` by card count, then divide by `packs` to reach a per-pack
 * figure. A pool with no cards gets 0 rather than a share of the slot.
 */
export function derivedRates(opts: {
  counts: Map<PoolKey, number>;
  packs: number;
  specialsPerBox: number;
}): Record<PoolKey, number> {
  const { counts, packs, specialsPerBox } = opts;
  const rates = {} as Record<PoolKey, number>;
  for (const p of POOL_ORDER) rates[p] = DEFAULT_BASE_RATES[p] ?? 0;

  const specialTotal = SPECIAL_POOLS.reduce((a, p) => a + (counts.get(p) ?? 0), 0);
  const perPack = Math.max(1, packs);
  for (const p of SPECIAL_POOLS) {
    const n = counts.get(p) ?? 0;
    rates[p] = specialTotal > 0 ? (specialsPerBox * (n / specialTotal)) / perPack : 0;
  }
  return rates;
}

/** "≈ 1 in N packs" for a per-pack rate below 1 — decimals like 0.0139 are unreadable. */
export function oneInPacks(rate: number): string | null {
  if (rate <= 0 || rate >= 1) return null;
  const n = Math.round(1 / rate);
  return `≈ 1 in ${n.toLocaleString()} packs`;
}

export interface EvLine {
  pool: PoolKey;
  label: string;
  rate: number;
  avgCents: number;
  topCents: number;
  priced: number;
  total: number;
  /** rate × avgCents — this pool's contribution to one pack. */
  contributionCents: number;
  /** Share of total pack EV, 0–1. The bar length in the UI. */
  share: number;
  chase: boolean;
}

export interface EvResult {
  lines: EvLine[];
  evPackCents: number;
  evBoxCents: number;
  /** Implied cards per pack across every pool — a sanity check on the rates. */
  cardsPerPack: number;
  /** EV ÷ box price, or null when no price has been entered. */
  ratio: number | null;
  priceCents: number;
}

export function computeEv(opts: {
  stats: Map<PoolKey, PoolStat>;
  rates: Record<string, number>;
  packs: number;
  boxPriceCents: number;
}): EvResult {
  const { stats, rates, packs, boxPriceCents } = opts;

  const raw = POOL_ORDER.filter((p) => stats.has(p)).map((pool) => {
    const s = stats.get(pool)!;
    const rate = Math.max(0, rates[pool] ?? 0);
    return {
      pool,
      label: POOL_LABEL[pool],
      rate,
      avgCents: s.avgCents,
      topCents: s.topCents,
      priced: s.priced,
      total: s.total,
      contributionCents: rate * s.avgCents,
      chase: isChasePool(pool),
    };
  });

  const evPackExact = raw.reduce((a, l) => a + l.contributionCents, 0);
  const lines: EvLine[] = raw.map((l) => ({
    ...l,
    contributionCents: Math.round(l.contributionCents),
    share: evPackExact > 0 ? l.contributionCents / evPackExact : 0,
  }));

  const evPackCents = Math.round(evPackExact);
  const evBoxCents = Math.round(evPackExact * Math.max(1, packs));
  return {
    lines,
    evPackCents,
    evBoxCents,
    cardsPerPack: raw.reduce((a, l) => a + l.rate, 0),
    ratio: boxPriceCents > 0 ? evBoxCents / boxPriceCents : null,
    priceCents: boxPriceCents,
  };
}

/** Verdict shown against the box price. Thresholds match the original tool. */
export function verdictFor(ratio: number | null) {
  if (ratio == null) return null;
  if (ratio >= 1.1) {
    return {
      tone: "up" as const,
      emoji: "🔥",
      text: "EV-positive at that price — opening beats buying singles on raw value (variance still applies).",
    };
  }
  if (ratio >= 0.85) {
    return { tone: "flat" as const, emoji: "⚖️", text: "Roughly break-even — open it for the fun, not the value." };
  }
  return {
    tone: "down" as const,
    emoji: "✋",
    text: "Well below EV — buying the singles you want is cheaper than ripping packs.",
  };
}
