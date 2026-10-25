// METAL CARDS (2026-10-25, owner: "add the medal prize wall cards … tag them as
// medal card, and have those prices in as well … eBay prices … and graded").
//
// Riot gives out metal reprints of champion Legends and units at organized-play
// events: the "Prize Wall" printing (traded for event points) and the "Best Of"
// printing (top finishers). They reuse the base card's name and collector number
// but are separate, scarce physical products, priced in thousands where the base
// card costs dollars. TCGplayer lists them in "Riftbound Organized Play
// Promotional Cards" as "<Name> (Metal) (Prize Wall|Best Of)".
//
// Each is a card of its own (prisma/manual-cards.json): isPromo, externalId
// "tcg-<productId>" so TCGplayer prices it straight from its own product (never
// by number — lib/tcgplayer.ts), and the tag "metal" plus "prize wall" or
// "best of". The tags are what the eBay matcher reads (lib/ebay.ts): a metal
// card matches only listings that say "metal", and every other card rejects them.
export type MetalKind = "Prize Wall" | "Best Of";

export const METAL_TAG = "metal";

/** The metal kind a card's comma-separated tags declare, or null for any other card. */
export function metalKindOf(tags: string | null | undefined): MetalKind | null {
  const t = (tags ?? "").toLowerCase().split(",").map((s) => s.trim());
  if (!t.includes(METAL_TAG)) return null;
  if (t.includes("best of")) return "Best Of";
  return "Prize Wall";
}

/** A listing title that describes a metal card. */
export const METAL_TITLE = /\bmetal\b/i;
const PRIZE_WALL_TITLE = /prize\s*wall/i;
const BEST_OF_TITLE = /\bbest\s*of\b/i;

/**
 * Does a listing title fit a card's metal kind? A metal card needs "metal" in the
 * title and must not be named as the OTHER kind (a title naming neither is
 * accepted for both: sellers often write only "Metal"). A non-metal card must not
 * be described as metal at all.
 */
export function titleFitsMetal(title: string, kind: MetalKind | null | undefined): boolean {
  const metal = METAL_TITLE.test(title);
  if (!kind) return !metal;
  if (!metal) return false;
  if (kind === "Prize Wall") return !BEST_OF_TITLE.test(title) || PRIZE_WALL_TITLE.test(title);
  return !PRIZE_WALL_TITLE.test(title) || BEST_OF_TITLE.test(title);
}
