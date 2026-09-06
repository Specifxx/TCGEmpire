// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS ACTUALLY IN A RIFTBOUND BOOSTER PACK
// ─────────────────────────────────────────────────────────────────────────────
// One sourced description of a pack, shared by the pack-opening simulator (which
// deals the slots) and the page that documents them. Every number below is
// Riot's, from game designer Nik Davidson's "Collectability in Riftbound:
// Origins" (28 July 2025) — the only first-party statement of pack structure and
// rates there is:
//
//   https://playriftbound.com/en-us/news/announcements/collectability-in-riftbound-origins/
//
// WHY THIS FILE EXISTS. The simulator used to deal its own invented pack: eight
// commons, three uncommons, one rare and a "hit" slot rolling 8% / 22% / 70%
// across Showcase / Epic / Rare. None of those five numbers came from anywhere,
// and three of them are wrong — a real pack has SEVEN commons and TWO rare-or-
// better slots, plus a foil slot and a rune slot the simulator did not deal at
// all, for fourteen cards rather than thirteen. Meanwhile lib/box-ev.ts had the
// correct rates all along, properly sourced, one import away. The page told
// visitors it used "the same odds by rarity as a physical pack" while doing
// nothing of the kind.
//
// So: the rates live here, with their provenance attached, and both the
// simulator and the published pull-rate table read them. A rate nobody can trace
// is a rate nobody should trust, least of all on a page whose whole claim is
// that it shows you what a real pack does.
//
// WHAT IS DELIBERATELY ABSENT. Riot has never published a per-slot probability
// for the foil slot's upgrade chance, nor for how the two rare-or-better slots
// split between Rare and Epic beyond "Epics appear in approximately 1 out of
// every 4 booster packs". Where a number is inferred rather than stated, it is
// marked `inferred` and the inference is written out. Nothing here is invented
// to fill a gap.

/** The canonical citation for everything in this file. */
export const PACK_SOURCE = {
  title: "Collectability in Riftbound: Origins",
  author: "Nik Davidson, Riftbound game designer",
  published: "2025-07-28",
  url: "https://playriftbound.com/en-us/news/announcements/collectability-in-riftbound-origins/",
} as const;

export interface PackSlot {
  key: string;
  /** How the slot reads in a table. */
  label: string;
  /** How many of this slot are in every pack. */
  count: number;
  /** What comes out of it, in Riot's words where possible. */
  note: string;
  /** True when Riot states this outright; false when we have inferred it. */
  sourced: boolean;
}

/**
 * Every slot in a booster pack, in the order Riot lists them.
 *
 * 7 + 3 + 2 + 1 + 1 = 14 cards, which matches the "14 Cards Ea" printed on
 * retail booster-display packaging — a useful independent check on the article.
 */
export const PACK_SLOTS: PackSlot[] = [
  { key: "common", label: "Common", count: 7, sourced: true, note: "Seven common slots — the bulk of the pack." },
  { key: "uncommon", label: "Uncommon", count: 3, sourced: true, note: "Three uncommon slots. Every Battlefield in Origins sits at uncommon." },
  {
    key: "rare",
    label: "Rare or better",
    count: 2,
    sourced: true,
    note: "Two slots that are Rare at minimum. Every Champion Legend is a Rare, so this is where your deck's centrepiece comes from.",
  },
  {
    key: "foil",
    label: "Foil",
    count: 1,
    sourced: true,
    note: "A dedicated foil slot — usually a foil common or uncommon, but it can upgrade to Rare or Epic. Rares and Epics are always foil anyway.",
  },
  {
    key: "rune",
    label: "Token / Rune",
    count: 1,
    sourced: true,
    note: "Occasionally a foil rune, and very rarely a special alt-art basic rune. Worth looking at.",
  },
];

export const CARDS_PER_PACK = PACK_SLOTS.reduce((n, s) => n + s.count, 0); // 14
export const PACKS_PER_BOX = 24;

export interface PullRate {
  key: string;
  label: string;
  /** Riot's own phrasing of the frequency. */
  frequency: string;
  /** Roughly one in N packs, for sorting and for the "how many boxes" maths. Null when not expressible. */
  onePerPacks: number | null;
  sourced: boolean;
  note: string;
}

/**
 * The published rates, rarest last.
 *
 * `onePerPacks` converts Riot's per-BOX statements at 24 packs a box, which is
 * arithmetic on their number rather than a new claim of our own.
 */
export const PULL_RATES: PullRate[] = [
  {
    key: "epic",
    label: "Epic",
    frequency: "≈1 in 4 packs",
    onePerPacks: 4,
    sourced: true,
    note: "Riot's figure exactly. An Epic replaces a card in the rare slot, so two Epics in one pack is possible.",
  },
  {
    key: "altart",
    label: "Alternate art",
    frequency: "≈2 per box",
    onePerPacks: 12,
    sourced: true,
    note: "The 12 core champions' Champion Units, in a different League skin with a hexagonal gem.",
  },
  {
    key: "overnumbered",
    label: "Over-numbered",
    frequency: "≈1 per 3 boxes",
    onePerPacks: 72,
    sourced: true,
    note: "Champion Legends redrawn by Riot artists, numbered above the set total — which is why they do not count for set legality.",
  },
  {
    key: "signature",
    label: "Signature over-numbered",
    frequency: "≈1 in 10 over-numbers, so ≈1 per 30 boxes",
    onePerPacks: 720,
    sourced: true,
    note: "An over-number carrying the artist's foil signature. The rarest thing a pack can produce.",
  },
];

/**
 * The two rare-or-better slots, resolved to a concrete deal.
 *
 * THE ONE INFERENCE IN THIS FILE, written out so it can be argued with. Riot
 * states the slot count (2) and the Epic frequency (≈1 in 4 packs) but not how
 * they interact beyond "when Epics appear they replace a card in the rare slot".
 * Treating each of the two slots as independently upgrading to Epic at half the
 * stated rate reproduces ≈1 Epic per 4 packs overall while leaving the
 * double-Epic pack that Riot explicitly says is possible — which a single
 * "one slot upgrades 25% of the time" model would make impossible.
 */
export const EPIC_UPGRADE_PER_RARE_SLOT = 1 / 8;

/**
 * The foil slot's upgrade chance.
 *
 * INFERRED, and the weakest number here. Riot says the foil slot is "most of the
 * time" a common or uncommon and "can also upgrade to Rare or Epic", with no
 * figure. "Most of the time" is the only constraint, so this stays a clear
 * minority and is labelled as an assumption wherever it is surfaced. It moves
 * nothing but the simulator's flavour — it is not used in any published rate.
 */
export const FOIL_UPGRADE_CHANCE = 0.2;

/** Riot's stated cards-per-pack, for prose that needs it inline. */
export const PACK_SUMMARY = `${PACK_SLOTS.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ")} — ${CARDS_PER_PACK} cards`;
