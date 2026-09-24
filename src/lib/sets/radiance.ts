// Verified set-facts for Riftbound: Radiance (Set 5) — the single source of
// truth for /sets/radiance's hub modules AND its FAQPage JSON-LD, so the
// visible page and the structured data can never drift (Google only honours
// FAQPage when the answer text is actually visible on the page).
//
// SOURCED 2026-09-14 against riftbound.gg/radiance/ (a third-party wiki that
// tracks reveals in near-real-time; page self-reported "Updated: September
// 14, 2026") and Riot's own playriftbound.com announcement. Do not add a fact
// that isn't traceable to one of those two.
//
// ONE CORRECTION FROM THE ORIGINAL BRIEF THIS WAS BUILT FROM: the brief said
// 5 confirmed Legends (Seraphine, Evelynn, Ekko, Ziggs, Jarvan IV) with 4
// unrevealed. That was Riot's original Set 5 announcement. A 6th Legend,
// Orianna, was confirmed separately and later at a PAX West livestream —
// riftbound.gg's page (dated today) lists her alongside the original five and
// says "Three more unannounced Legends", and an independently tracked reveal
// account corroborates the PAX West reveal. Using 6 confirmed / 3 unrevealed
// here rather than the brief's stale 5/4 — publishing a known-outdated legend
// count on a page whose whole purpose is accuracy would be worse than the
// deviation. Re-verify against riftbound.gg/radiance/ before trusting this
// file if much more time has passed since 2026-09-14.
export interface RadianceLegend {
  name: string;
  /** URL-safe id for the chip's anchor + its query-filter link. */
  slug: string;
}

export const RADIANCE_LEGENDS_CONFIRMED: RadianceLegend[] = [
  { name: "Seraphine", slug: "seraphine" },
  { name: "Evelynn", slug: "evelynn" },
  { name: "Ekko", slug: "ekko" },
  { name: "Ziggs", slug: "ziggs" },
  { name: "Jarvan IV", slug: "jarvan-iv" },
  { name: "Orianna", slug: "orianna" },
];
// 9 Legends total across the set (same figure the original brief used) —
// only which ones are confirmed vs. still unrevealed has moved.
export const RADIANCE_LEGENDS_TOTAL = 9;
export const RADIANCE_LEGENDS_UNREVEALED = RADIANCE_LEGENDS_TOTAL - RADIANCE_LEGENDS_CONFIRMED.length;

export const RADIANCE_TAGLINE = "Own the Stage. The World is Watching.";

// ISO dates — every rendered date string derives from these, never typed a
// second time, so a launch-day slip can never leave the page and the FAQ
// disagreeing with each other.
export const RADIANCE_RELEASE_DATE = "2026-10-23";
export const RADIANCE_PREVIEW_START = "2026-09-25";
export const RADIANCE_PREVIEW_END = "2026-10-09";
export const RADIANCE_PRERIFT_START = "2026-10-16";
export const RADIANCE_PRERIFT_END = "2026-10-22";

/**
 * Is it still before Radiance's release day? Gates the launch email capture
 * ("email me the day Radiance prices go live") on the hub, /radiance-preorders
 * and every radiance-tagged article — one rule, so the three surfaces retire
 * together. After release the release-day email (lib/release-day.ts) has already
 * gone out and the promise would be moot.
 *
 * Midnight UTC on the release date, the same boundary isPreorderSetCode() uses
 * (lib/constants.ts). The callers are ISR / dynamic pages, so this runs at
 * render time; a page cached a day either side of the boundary is acceptable.
 */
export function isBeforeRadianceRelease(now: Date = new Date()): boolean {
  return now.getTime() < Date.parse(`${RADIANCE_RELEASE_DATE}T00:00:00Z`);
}

export const RADIANCE_TOTAL_CARDS = 180;
export const RADIANCE_SHOWCASE_COUNT = 66;

export interface RadianceProduct {
  name: string;
  detail?: string;
  msrp?: string;
}

// CONTENTS AND US PRICES, re-sourced 2026-09-24. Riot's own announcement names
// the products but gives no prices; the contents below are from UVS's retailer
// sheet ("Radiance Dates and Details", July 2026) and the US MSRPs from the
// distributor listing (PHD Games, 15 Jun 2026), which is why they are labelled
// MSRP and never "Riot's price". No non-USD MSRP has been published.
export const RADIANCE_PRODUCTS: RadianceProduct[] = [
  {
    name: "Booster Packs & Displays",
    detail: "14-card packs; a display is 24 packs. A case is six displays",
    msrp: "$4.99 a pack · $120 a display",
  },
  {
    name: "Showdown Decks: Seraphine vs. Evelynn",
    detail: "Two 56-card preconstructed champion decks, two booster packs, two playmats, two deck boxes, 1 rulebook",
    msrp: "$34.99",
  },
  {
    name: "Vault Bundle",
    detail: "Six booster packs, 36 runes, three foil promo tokens, a storage box and two dividers — sold by many stores as the \"Radiance Vault\"",
    msrp: "$34.99",
  },
  {
    name: "Pre-Rift kits",
    detail: "Stores' event kit: 16 player kits (a 15-card mini-precon, five boosters and a promo each) plus a prize display, played as Sealed 16–22 October",
  },
];

// Riot Merch Store DRAW, not pre-orders (playriftbound.com, "Radiance Merch
// Store Update", 17 Sep 2026). North America and Europe only; each selected
// entrant may buy one Booster Display. No price published on that page.
export const RADIANCE_MERCH_DRAW = {
  regions: "North America and Europe",
  signupOpens: "2026-09-25",
  signupCloses: "2026-09-30", // 9:00 AM PT
  selectionFrom: "2026-10-05",
  limit: "one Radiance Booster Display per selected entrant",
} as const;

export interface RadianceFaq {
  q: string;
  a: string;
}

// Rendered visibly by RadianceHub AND fed to lib/jsonld's faqPage() verbatim —
// one array, so the two can never say different things.
export const RADIANCE_FAQ: RadianceFaq[] = [
  {
    q: "When does Riftbound Radiance release?",
    a: "Radiance releases worldwide on October 23, 2026. Card previews begin September 25, with Pre-Rift early-play events running October 16–22.",
  },
  {
    q: "How many cards are in Riftbound Radiance?",
    a: "180 cards, including 66 Showcase variants and a new Ultimate Rare card.",
  },
  {
    q: "Which champions (legends) are in Riftbound Radiance?",
    a: "Six legends are confirmed — Seraphine, Evelynn, Ekko, Ziggs, Jarvan IV and Orianna — with three more unrevealed at the start of preview season.",
  },
  {
    q: "What are the Radiance Showdown Decks?",
    a: `"Showdown Decks: Seraphine vs. Evelynn" includes two 56-card preconstructed decks, two booster packs, two playmats and a rulebook, at $34.99 MSRP.`,
  },
  {
    q: "Where can I preorder Riftbound Radiance the cheapest?",
    a: "RiftCompare compares live Radiance preorder prices for the booster display, Showdown Decks, Vault Bundle and Pre-Rift kits across every store it tracks in your market — the US, UK, Australia, Canada, Singapore and the eurozone — cheapest first, in your currency.",
  },
  {
    q: "Can I buy Radiance directly from Riot?",
    a: "Only through a draw. Riot's Merch Store takes sign-ups from 25 to 30 September 2026 in North America and Europe; entrants selected from about 5 October may buy one Radiance Booster Display each, shipping from release day. Everywhere else, and for every other product, it is a store or a marketplace.",
  },
  {
    q: "How often do Radiance prices update on RiftCompare?",
    a: "Daily through preview season and launch. Singles appear within hours of reveal, each with a full store-by-store breakdown and price history.",
  },
];
