// Verified set facts for Riftbound: Legacy (Set 6), the single source for
// /sets/legacy's hub (components/sets/LegacyHub.tsx) AND its FAQPage JSON-LD,
// so the visible page and the structured data can never say different things.
// The same shape as lib/sets/radiance.ts, built 2026-11-01 (owner: "everything
// we did right for Radiance, we got to get Legacy set up").
//
// SOURCED 2026-11-01 against Riot's own "Products and Sets into 2027"
// (playriftbound.com, 4 Aug 2026, re-read today) and riftbound.gg/legacy/.
// Product contents and the US MSRPs are the US distributor sheet (PHD Games,
// 11 Aug 2026), as on /legacy-preorders. Nothing here is guessed: the four
// unnamed Legends stay unnamed, and no price outside the US is given because
// none has been announced.
//
// ONE DATE THE SOURCES DISAGREE ON: Riot's Legacy announcement puts the first
// preview at "Convergence Fest, December 13-15"; Riot's roadmap and the
// Convergence Fest site date the festival 11–13 December. The spoilers post
// (/blog/riftbound-legacy-spoilers-set-6) reads it as the preview beat starting
// on the 13th, and so does this file: LEGACY_PREVIEW_START is 13 December.
import { setByCode, streetDateStartMs } from "../constants";

export interface LegacyLegend {
  name: string;
  /** URL-safe id for the chip's anchor. */
  slug: string;
  /** True for the one Legend with no earlier Riftbound card (Vladimir). */
  newToGame?: boolean;
}

// Riot's eight, in Riot's order. "And four more friends!" — twelve in all.
export const LEGACY_LEGENDS_CONFIRMED: LegacyLegend[] = [
  { name: "Ashe", slug: "ashe" },
  { name: "Garen", slug: "garen" },
  { name: "Heimerdinger", slug: "heimerdinger" },
  { name: "Illaoi", slug: "illaoi" },
  { name: "Karma", slug: "karma" },
  { name: "Lux", slug: "lux" },
  { name: "Tryndamere", slug: "tryndamere" },
  { name: "Vladimir", slug: "vladimir", newToGame: true },
];
export const LEGACY_LEGENDS_TOTAL = 12;
export const LEGACY_LEGENDS_UNREVEALED = LEGACY_LEGENDS_TOTAL - LEGACY_LEGENDS_CONFIRMED.length;

export const LEGACY_SET_CODE = "LGC";
export const LEGACY_RELEASE_DATE = setByCode(LEGACY_SET_CODE)?.releasedOn ?? "2027-01-29";
export const LEGACY_PREVIEW_START = "2026-12-13";
export const LEGACY_PRERIFT_START = "2027-01-22";
export const LEGACY_PRERIFT_END = "2027-01-28";
/** Proving Grounds 2nd Edition (PG2): a boxed starter, not a set. */
export const PROVING_GROUNDS_2_DATE = "2027-02-19";

// Riot's total, Showcase included, read from SETS rather than typed again.
export const LEGACY_TOTAL_CARDS = setByCode(LEGACY_SET_CODE)?.announcedCards ?? 239;
export const LEGACY_SHOWCASE_COUNT = 93;

/** Before Legacy's street date (from midnight AEDT, like every release check). */
export function isBeforeLegacyRelease(now: Date = new Date()): boolean {
  return now.getTime() < streetDateStartMs(LEGACY_RELEASE_DATE);
}

export interface LegacyProduct {
  name: string;
  detail: string;
  msrp?: string;
}

// The same list /legacy-preorders shows (that page keeps its own copy of the
// wording for its longer layout; the facts are identical). The Champion Deck
// MSRP is left out on purpose: the distributor sheet and ICv2 disagree.
export const LEGACY_PRODUCTS: LegacyProduct[] = [
  {
    name: "Booster Display (booster box)",
    msrp: "US$120",
    detail: "24 packs of 14 cards: 6 Commons, 3 Uncommons, 1 Legend or Battlefield, 1 foil, 2 Rares or better, 2 Runes or Tokens and 1 insert",
  },
  {
    name: "Vault Bundle",
    msrp: "US$34.99",
    detail: "6 Legacy booster packs, 36 basic runes, 4 full-art foil promo tokens and a reusable storage box",
  },
  {
    name: "Champion Decks: Tryndamere, Ashe, Lux, Garen",
    detail: "Four decks sold separately, each with a paper playmat, one Legacy booster pack and a folded deck box",
  },
  {
    name: "Pre-Rift kits",
    detail: "Stores' event kits for Pre-Rift, 22–28 January 2027. Riot has not published their contents",
  },
  {
    name: "Proving Grounds 2nd Edition",
    msrp: "US$40",
    detail: "Due 19 February 2027: four Champion Decks (Heimerdinger, Karma, Vladimir, Illaoi), four oversized Battlefields, four playmats, four score trackers. Every card in it is also in Legacy boosters",
  },
];

export interface LegacyFaq {
  q: string;
  a: string;
}

// Rendered visibly by LegacyHub AND fed to faqPage() verbatim.
export const LEGACY_FAQ: LegacyFaq[] = [
  {
    q: "When does Riftbound Legacy release?",
    a: "29 January 2027 worldwide. The first previews are at Convergence Fest in Las Vegas from 13 December 2026, with more in January, and Pre-Rift events run at stores from 22 to 28 January 2027.",
  },
  {
    q: "How many cards are in Riftbound Legacy?",
    a: "239, per Riot, 93 of them Showcase printings. Some early coverage said 346; Riot's own announcement says 239. Legacy's set code is LGC.",
  },
  {
    q: "Which Legends are in Riftbound Legacy?",
    a: "Riot has named eight of twelve: Ashe, Garen, Heimerdinger, Illaoi, Karma, Lux, Tryndamere and Vladimir. Four more are still to be revealed. Vladimir is the only one with no earlier Riftbound card.",
  },
  {
    q: "What is different about Legacy booster packs?",
    a: "One Common slot becomes a Legend-or-Battlefield slot at roughly 50/50, so a Legacy pack holds six Commons instead of seven. Legacy is also the first Riftbound set Riot built for draft.",
  },
  {
    q: "How much is a Legacy booster box?",
    a: "The US distributor list price is US$120 for the 24-pack Booster Display. Stores set their own pre-order prices and no list price outside the US has been announced, so RiftCompare compares every tracked store's live pre-order price in your market, cheapest first.",
  },
  {
    q: "Is Proving Grounds 2nd Edition part of Legacy?",
    a: "No, it is a separate US$40 boxed starter due 19 February 2027, with Heimerdinger, Karma, Vladimir and Illaoi Champion Decks. Riot says every card in it can also be pulled from booster packs.",
  },
];

// Which articles carry the Legacy pre-order banner (components/
// LegacyPreorderCta.tsx) near the top and again after their first section:
// every post tagged "legacy". A rule, not a list, for the reason
// carriesRadiancePreorderCta() gives: a list goes stale the first week of
// reveals. Unlike Radiance's rule it takes guides too: Legacy has no guide
// with its own release-day capture to protect.
export function carriesLegacyPreorderCta(article: { tags: readonly string[] }): boolean {
  return article.tags.includes("legacy") && isBeforeLegacyRelease();
}
