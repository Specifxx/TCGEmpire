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

import { isCrystalRose, isOvernumbered, isSignature, isUltimate, RARITY_KEYS } from "./constants";
import { printingKind } from "./content/card-narrative";
import { EPIC_UPGRADE_PER_RARE_SLOT, PACK_SLOTS, PACKS_PER_BOX, PULL_RATES } from "./pack-composition";
import { headlineOffer, type SealedOffer } from "./sealed-offers";

// ── Pools ────────────────────────────────────────────────────────────────────
// A "pool" is a set of cards one pack slot can produce. Base rarities plus the
// three chase tiers, which are kept SEPARATE rather than merged into a single
// "chase" bucket: they have wildly different rarities and values, so averaging a
// signature together with an alt-art would reproduce the exact distortion that
// made excluding them necessary in the first place.
export const BASE_POOLS = ["Common", "Uncommon", "Rare", "Epic", "Showcase"] as const;
export const CHASE_POOLS = ["AltArt", "Overnumbered", "Signature", "Ultimate"] as const;
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
  Ultimate: "Ultimate",
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
    isUltimate: isUltimate(card.setCode, card.collectorNumber),
    isCrystalRose: isCrystalRose(card.setCode, card.collectorNumber),
    isSignature: isSignature(card.collectorNumber),
    isOvernumbered: card.isOvernumbered || isOvernumbered(card.collectorNumber),
    isPromo: card.isPromo ?? false,
    variant: card.variant ?? null,
  });
  switch (kind) {
    case "promo":
      return null; // event/box-topper distribution, not a pack pull
    // Ultimate is its own pool, NOT over-numbered: Baron Nashor 238/219 used to
    // be averaged into Unleashed's Overnumbered pool at 1 in 72 packs, ten times
    // too often for a card pulled at Signature odds (site owner, 2026-09-24).
    case "ultimate":
      return "Ultimate";
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
// BASE RATES are Riot's slot counts (lib/pack-composition.ts, corroborated by
// the magicalmeta.ink community pull-rate guide's observed box/case data).
//
// RARE + EPIC = THE TWO RARE-OR-BETTER SLOTS, NOT 2 + 0.25 (2026-09-25). Riot:
// "an Epic replaces a card in the rare slot". This used to count Rare at the
// full 2 slots AND Epic at 0.25 on top, i.e. 2.25 cards out of two slots, about
// six phantom rares per 24-pack box. The pack simulator already dealt it the
// right way (each rare slot upgrades to Epic at EPIC_UPGRADE_PER_RARE_SLOT), and
// tests/pack-composition.test.ts now pins Rare + Epic to the slot count, so the
// two pages quote the same pack.
const slotCount = (key: string) => PACK_SLOTS.find((s) => s.key === key)?.count ?? 0;
export const DEFAULT_BASE_RATES: Record<string, number> = {
  Common: slotCount("common"),
  Uncommon: slotCount("uncommon"),
  Rare: slotCount("rare") * (1 - EPIC_UPGRADE_PER_RARE_SLOT), // 1.75
  Epic: slotCount("rare") * EPIC_UPGRADE_PER_RARE_SLOT, // 0.25, ~1 in 4 packs
};

export const DEFAULT_PACKS = PACKS_PER_BOX;

// ── Chase-print rates: Riot's own published table ───────────────────────────
//
// This used to say "Riot publishes NO odds for signature, over-numbered or
// alt-art prints" and invent a single shared "specials per box" budget, split
// across all three chase pools plus Showcase in proportion to how many cards
// each contained. That was wrong on two counts: Riot HAS published these odds
// (Nik Davidson's "Collectability in Riftbound: Origins" post, already sourced
// at lib/pack-composition.ts as PULL_RATES and read by the pack-opening
// simulator), and the proportional split actively inverted them — a set has
// far more Alt Art cards than Over-numbered ones, so the split handed
// Over-numbered the BIGGER share of the slot when Riot's real numbers make it
// the rarer of the two by 6x. Site-owner correction, 2026-09-04: "Alt art is 1
// in 12 packs and overnumbered is 1 in 72 packs" — exactly PULL_RATES' own
// altart/overnumbered figures, which is what pointed at the bug.
//
// Reading the SAME table the pack simulator already reads, rather than
// re-deriving a second estimate here, is what stops this page and pack-sim
// disagreeing about the same cards — the exact drift pack-composition.ts's own
// top comment exists to prevent (it already happened once, for the base rates,
// before that file existed; tests/pack-composition.test.ts pins the two files
// against each other so it cannot happen silently again).
const CHASE_PULL_RATE_KEY: Record<(typeof CHASE_POOLS)[number], string> = {
  AltArt: "altart",
  Overnumbered: "overnumbered",
  Signature: "signature",
  Ultimate: "ultimate",
};

function sourcedChaseRate(pool: (typeof CHASE_POOLS)[number]): number {
  const onePerPacks = PULL_RATES.find((r) => r.key === CHASE_PULL_RATE_KEY[pool])?.onePerPacks;
  return onePerPacks ? 1 / onePerPacks : 0;
}

/** Expected cards per pack for each chase pool, straight off Riot's published table. */
export const CHASE_RATES: Record<(typeof CHASE_POOLS)[number], number> = {
  AltArt: sourcedChaseRate("AltArt"),
  Overnumbered: sourcedChaseRate("Overnumbered"),
  Signature: sourcedChaseRate("Signature"),
  Ultimate: sourcedChaseRate("Ultimate"),
};

// ── The one remaining estimate: Showcase ─────────────────────────────────────
//
// Showcase is a genuine rarity tier (RARITY_KEYS), not a chase-print variant,
// and Riot's post never mentions a rate for it — so it is still an assumption,
// and the user can see and change it. The default 0.33/box is not a new claim:
// it is exactly the rate this tool has always used for Showcase alone
// (0.0139/pack × 24 packs ≈ 0.33). Before this fix that number was diluted
// across four pools instead of paying for just the one it was ever measured
// against; now that AltArt/Overnumbered/Signature have their own sourced
// rates, Showcase goes back to spending the whole slot on itself.
export const DEFAULT_SPECIALS_PER_BOX = 0.33;

/** The one pool still priced off the specials-per-box estimate rather than a Riot-published rate. */
export const SPECIAL_POOLS = ["Showcase"] as const;

/**
 * Expected cards per pack for every pool.
 *
 * Base pools take their slot-count rate. AltArt/Overnumbered/Signature take
 * Riot's own published rate, unaffected by how many cards of that pool this
 * set happens to have. Showcase alone is still estimated: `specialsPerBox` per
 * box, divided by `packs`. A pool with no cards in this set gets 0 rather than
 * a rate it can never pay out.
 */
export function derivedRates(opts: {
  counts: Map<PoolKey, number>;
  packs: number;
  specialsPerBox: number;
}): Record<PoolKey, number> {
  const { counts, packs, specialsPerBox } = opts;
  const rates = {} as Record<PoolKey, number>;
  for (const p of POOL_ORDER) rates[p] = DEFAULT_BASE_RATES[p] ?? 0;

  for (const p of CHASE_POOLS) rates[p] = (counts.get(p) ?? 0) > 0 ? CHASE_RATES[p] : 0;

  const perPack = Math.max(1, packs);
  rates.Showcase = (counts.get("Showcase") ?? 0) > 0 ? specialsPerBox / perPack : 0;

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

/**
 * Verdict shown against the box price. `ratio` is EV ÷ price, so below 1 the
 * PRICE is above the EV.
 *
 * The tone thresholds match the colour the calculator paints the ratio and the
 * bar with (green from 1.00, gold from 0.85). The verdict used to turn green only
 * at 1.10, so 1.00–1.09 showed a green percentage over a gold "break-even" line.
 */
export function verdictFor(ratio: number | null) {
  if (ratio == null) return null;
  if (ratio >= 1.1) {
    return {
      tone: "up" as const,
      emoji: "🔥",
      text: "EV-positive at that price — opening beats buying singles on raw value (variance still applies).",
    };
  }
  if (ratio >= 1) {
    return { tone: "up" as const, emoji: "⚖️", text: "Just above break-even — the pulls are worth about what you'd pay, on average." };
  }
  if (ratio >= 0.85) {
    return { tone: "flat" as const, emoji: "⚖️", text: "Roughly break-even — open it for the fun, not the value." };
  }
  // "Well below EV" read as "the price is well below EV", i.e. a bargain: the
  // opposite of what this branch means (2026-09-25 audit).
  return {
    tone: "down" as const,
    emoji: "✋",
    text: "Price is well above EV — buying the singles you want is cheaper than ripping packs.",
  };
}

// ── Which sets have a box to open ────────────────────────────────────────────
// Origins: Proving Grounds (OGS) is a 24-card preconstructed, ready-to-play
// product with no booster packs, so "expected value per box of 24 random packs"
// describes a product that does not exist. It used to be offered anyway because
// it is a released set with cards (2026-09-25 audit). Kept here rather than as a
// flag on SETS so the one tool that needs it owns the list.
export const NO_BOOSTER_SETS: ReadonlySet<string> = new Set(["OGS"]);

// ── The box price to start from ──────────────────────────────────────────────
// The calculator used to make you type a box price the site already tracks on
// /sealed. The cheapest OPEN offer (in stock and read within the staleness
// window, lib/sealed-offers.ts) for a set's Booster Box now fills the field.

export interface BoxOfferListing extends SealedOffer {
  retailer: string;
  retailerName: string;
  url: string;
}

/** The cheapest open Booster Box offer per set code, from one market's sealed groups. Pure. */
export function cheapestBoxOffers(
  groups: readonly { productType: string; setCode: string | null; listings: readonly BoxOfferListing[] }[],
  setCodes: ReadonlySet<string>,
  now: number = Date.now(),
): Map<string, BoxOfferListing> {
  const out = new Map<string, BoxOfferListing>();
  for (const g of groups) {
    if (g.productType !== "Booster Box" || !g.setCode || !setCodes.has(g.setCode)) continue;
    const best = headlineOffer(g.listings, now);
    if (!best) continue;
    const cur = out.get(g.setCode);
    if (!cur || best.priceCents < cur.priceCents) out.set(g.setCode, best);
  }
  return out;
}
