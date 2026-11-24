// Verified set facts for Riftbound: The Reckoning (Set 7), the single source for
// /sets/the-reckoning's hub (components/sets/ReckoningHub.tsx) AND its FAQPage
// JSON-LD, the same shape as lib/sets/legacy.ts. Built 2026-11-24 (owner: "start
// getting Riftbound Reckoning set up on RiftCompare").
//
// SOURCED 2026-11-24 against riftbound.gg/the-reckoning/ (updated 4 Nov 2026),
// Riot's "Products and Sets into 2027" rundown (as read on 2026-10-25 for
// release-calendar.ts), ICv2's pre-order write-up and cardsrealm. Nothing is
// guessed: no MSRP has been announced (stores' listed prices are their own), no
// preview date has been announced, and the four unnamed Legends stay unnamed.
//
// ONE FIGURE THE SOURCES DISAGREE ON: ICv2 says "250 cards"; Riot's rundown and
// riftbound.gg say 264 (67 Showcase). Riot's own figure wins.
import { setByCode, streetDateStartMs } from "../constants";

export const RECKONING_SET_CODE = "REC";
export const RECKONING_SLUG = "the-reckoning";
export const RECKONING_RELEASE_DATE = setByCode(RECKONING_SET_CODE)?.releasedOn ?? "2027-04-30";
export const RECKONING_PRERIFT_START = "2027-04-23";
export const RECKONING_PRERIFT_END = "2027-04-29";
export const RECKONING_TOTAL_CARDS = 264;
export const RECKONING_SHOWCASE_COUNT = 67;

export interface ReckoningLegend {
  name: string;
  slug: string;
}
// riftbound.gg's five, alphabetical. "Four more unannounced Legends": nine in all.
export const RECKONING_LEGENDS_CONFIRMED: ReckoningLegend[] = [
  { name: "Aurelion Sol", slug: "aurelion-sol" },
  { name: "Cho'Gath", slug: "cho-gath" },
  { name: "Shyvana", slug: "shyvana" },
  { name: "Vayne", slug: "vayne" },
  { name: "Zilean", slug: "zilean" },
];
export const RECKONING_LEGENDS_TOTAL = 9;
export const RECKONING_LEGENDS_UNREVEALED = RECKONING_LEGENDS_TOTAL - RECKONING_LEGENDS_CONFIRMED.length;

/** Before The Reckoning's street date (from midnight AEDT, like every release check). */
export function isBeforeReckoningRelease(now: Date = new Date()): boolean {
  return now.getTime() < streetDateStartMs(RECKONING_RELEASE_DATE);
}

export interface ReckoningProduct {
  name: string;
  detail: string;
}

// The products riftbound.gg and ICv2 name. Contents only where a source states them.
export const RECKONING_PRODUCTS: ReckoningProduct[] = [
  { name: "Booster Display (booster box)", detail: "Booster packs of 14 cards, sold singly and by the display" },
  { name: "Vault Bundle", detail: "6 booster packs, 36 runes and 3 full-art tokens" },
  { name: "Champion Decks: Shyvana, Vayne", detail: "Each a ready-to-play deck, one booster pack, a paper playmat and a deck box; also sold in displays of four" },
  { name: "Pre-Rift kits", detail: "Stores' event kits for Pre-Rift, 23–29 April 2027" },
];

export interface ReckoningFaq {
  q: string;
  a: string;
}

// Rendered visibly by ReckoningHub AND fed to faqPage() verbatim. Short on purpose.
export const RECKONING_FAQ: ReckoningFaq[] = [
  {
    q: "When does Riftbound The Reckoning release?",
    a: "30 April 2027 worldwide. Pre-Rift events run at stores from 23 to 29 April 2027. Riot has not dated the preview season yet.",
  },
  {
    q: "How many cards are in The Reckoning?",
    a: "264, per Riot, 67 of them Showcase printings. The set code is REC.",
  },
  {
    q: "Which Legends are in The Reckoning?",
    a: "Riot has named five of nine: Aurelion Sol, Cho'Gath, Shyvana, Vayne and Zilean. Four are still to be revealed.",
  },
  {
    q: "Can I pre-order The Reckoning yet?",
    a: "Yes. Stores in the US, Canada and Europe already list booster boxes, Vault Bundles and the Shyvana and Vayne Champion Decks. Riot has not announced a list price, so RiftCompare compares each store's own pre-order price, cheapest first.",
  },
  {
    q: "How does The Reckoning relate to Legacy?",
    a: "Legacy (Set 6) comes first, on 29 January 2027. Riot says The Reckoning is closely tied to it in theme, with more detail due at the first State of the Game of 2027.",
  },
];
