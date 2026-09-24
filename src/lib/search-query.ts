// One search box, and people type more than a name into it.
//
// THE BUG THIS CLOSES: `normalizeSearch` strips spaces and punctuation, so
// "akali overnumbered" became "akaliovernumbered" and was compared against
// `nameNormalized`, which is the NAME alone — no card has ever matched it. The
// same is true of "shen signature riftbound", "alt art jinx" and every other
// shape a collector actually types. The site had the filters for all of these
// (`sig=1`, `over=1`, `variant=alt` …), reachable only from the browse page's
// chips, and the search box could not reach them at all. A visitor who found a
// card page through Google and retyped the phrase they searched got nothing.
//
// So: split the raw string into the NAME part and the FILTER part before it
// touches the database. "akali overnumbered" is name "akali" plus `over=1`,
// which is precisely the query the browse chips would have built.
//
// ── WHAT IS DELIBERATELY NOT MAPPED ─────────────────────────────────────────
// Bare "over" and bare "alt" are NOT keywords. They are ordinary English and a
// plausible fragment of a card name, and turning a fragment into a filter
// silently removes results the visitor asked for — the failure mode that is
// hardest to notice, because the page looks like it worked. Only the unambiguous
// full forms map. Same reasoning for keeping the list short and hand-written
// rather than deriving it from the facet tables: a filter word has to be a word
// people mean as a filter, which is a judgement, not a schema fact.

import { aliasSlugsFor } from "@/lib/content/card-aliases";

/**
 * The CardQuery fields a typed phrase may fill in. Structurally a subset of
 * `CardQuery` in lib/cards.ts, declared here rather than imported from it
 * because cards.ts imports THIS module.
 */
export interface SearchQueryFilters {
  sig?: string;
  over?: string;
  ult?: string;
  promo?: string;
  variant?: string;
  rarity?: string;
  set?: string;
}

/**
 * Facet words that ALSO occur inside real card names, so they can never be
 * applied as a plain narrowing filter.
 *
 * Measured across the catalogue: "rune" appears in 31 card names (the cards are
 * literally called "Fury Rune" and "Rune Prison"), every domain word appears in
 * 5-6, and "legends" appears in one ("Hall of Legends"). A top-level filter
 * built from a word like that deletes results the visitor asked for and leaves a
 * page that looks like it worked — the worst failure mode a search box has.
 *
 * So these are kept apart from `filters` and applied by `buildCardWhere` as an
 * ALTERNATIVE rather than a constraint: the whole typed phrase is always tried
 * as a literal name first, and only then as "this name, of this kind". See
 * lib/cards.ts. `rune`, `runes` and `legends` are not mapped at all — no
 * alternative can rescue a word that is one card's entire name.
 */
export interface ScopedFilters {
  type?: string;
  domain?: string;
  rarity?: string;
}

export interface ParsedSearchQuery {
  /** What is left after the filter words are removed — possibly "". */
  name: string;
  filters: SearchQueryFilters;
  /** Facet words that must be applied as an alternative, never as a constraint. */
  scoped: ScopedFilters;
  /** Card slugs whose community nickname the whole raw query matches. */
  aliasSlugs: string[];
}

// Multi-word forms, stripped BEFORE single tokens so "alternate art" is not seen
// as the two unmapped tokens "alternate" and "art". Matched on a space-padded
// string, so each pattern is anchored to whole words.
const PHRASES: ReadonlyArray<readonly [RegExp, SearchQueryFilters]> = [
  [/ (?:alternate|alt) art /g, { variant: "alt" }],
  // The Crystal Rose alt-arts are a Vendetta-only line (lib/constants.ts
  // isCrystalRose), so the set IS the filter — there is no "crystal rose" column.
  [/ crystal rose /g, { set: "VEN" }],
  [/ over numbered /g, { over: "1" }],
];

// Single tokens. `null` means "drop it": noise words that are true of every card
// on the site and would otherwise be searched as part of the name.
const TOKENS: Record<string, SearchQueryFilters | null> = {
  signature: { sig: "1" },
  sig: { sig: "1" },
  overnumbered: { over: "1" },
  // No card name contains "ultimate" (checked 2026-09-24), so it is a safe filter.
  ultimate: { ult: "1" },
  promo: { promo: "1" },
  promos: { promo: "1" },
  showcase: { rarity: "Showcase" },
  riftbound: null,
  card: null,
};

// The ambiguous half. Singular AND plural where both are safe; nothing here is
// mapped unless its collision count across the catalogue is zero or the
// alternative-match shape in buildCardWhere covers it.
//
// DELIBERATELY ABSENT: `rune`/`runes` (31 name collisions — "Fury Rune", "Rune
// Prison") and `legends` (one, "Hall of Legends"). Adding either would mean a
// search for a card by its own name is answered by a filter.
const SCOPED_TOKENS: Record<string, ScopedFilters> = {
  legend: { type: "Legend" },
  unit: { type: "Unit" },
  units: { type: "Unit" },
  spell: { type: "Spell" },
  spells: { type: "Spell" },
  gear: { type: "Gear" },
  battlefield: { type: "Battlefield" },
  battlefields: { type: "Battlefield" },
  fury: { domain: "Fury" },
  calm: { domain: "Calm" },
  mind: { domain: "Mind" },
  body: { domain: "Body" },
  chaos: { domain: "Chaos" },
  order: { domain: "Order" },
  colorless: { domain: "Colorless" },
  common: { rarity: "Common" },
  uncommon: { rarity: "Uncommon" },
  rare: { rarity: "Rare" },
  epic: { rarity: "Epic" },
};

/**
 * Split a raw search string into a name and the filters it names.
 *
 * Hyphens and underscores become spaces first, so "over-numbered" and "alt-art"
 * are the same input as their spaced forms. That is safe for the name half:
 * everything downstream runs it through `normalizeSearch`, which drops those
 * characters anyway.
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const aliasSlugs = aliasSlugsFor(raw ?? "");
  let work = ` ${(raw ?? "").toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()} `;

  const filters: SearchQueryFilters = {};
  for (const [pattern, f] of PHRASES) {
    const re = new RegExp(pattern.source, "g");
    if (re.test(work)) {
      Object.assign(filters, f);
      work = work.replace(new RegExp(pattern.source, "g"), " ");
    }
  }

  const scoped: ScopedFilters = {};
  const kept: string[] = [];
  for (const token of work.split(" ").filter(Boolean)) {
    if (token in TOKENS) {
      const f = TOKENS[token];
      if (f) Object.assign(filters, f);
      continue;
    }
    if (token in SCOPED_TOKENS) {
      Object.assign(scoped, SCOPED_TOKENS[token]);
      continue;
    }
    kept.push(token);
  }

  return { name: kept.join(" "), filters, scoped, aliasSlugs };
}
