// A TCGplayer Mass Entry link with the whole list in the URL: one tap opens
// TCGplayer with every card ready to add to the cart. TCGplayer credits the whole
// cart to the first affiliate click (48 hours), so a deck's cart link is worth
// far more than one card's (DECISIONS.md, "Discord price bot", 2026-10-27).
// Returns the plain tcgplayer.com URL; callers wrap it through affiliateUrl().
export const RIFTBOUND_TCG_LINE = "Riftbound: League of Legends Trading Card Game";

// Lines past this are dropped so the link stays well inside URL limits.
const MAX_LINES = 75;

export function tcgplayerMassEntryUrl(productLine: string, lines: { qty: number; name: string }[]): string {
  const c = lines
    .filter((l) => l.qty > 0 && l.name.trim())
    .slice(0, MAX_LINES)
    .map((l) => `${l.qty} ${l.name.trim()}`)
    .join("||");
  return `https://www.tcgplayer.com/massentry?productline=${encodeURIComponent(productLine)}&c=${encodeURIComponent(c)}`;
}
