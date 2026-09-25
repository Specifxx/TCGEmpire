// Card condition, read from the free-text labels stores write.
//
// Two rankings over the same labels, for two different questions:
//
//   • conditionRank — which VARIANT of one store's product to record (the
//     importer's question). It only ORDERS conditions so the best available
//     copy wins; a label with no condition in it ("Default Title", "Foil")
//     reads as standard/NM because that is what the store's headline price
//     means. Moved here unchanged from lib/price-import.ts.
//
//   • alertConditionRank — may this row's price TRIGGER a price alert (the
//     alert run's question, lib/alert-price.ts)? Only rank 0 may: Near Mint,
//     Mint or no stated condition. It is stricter than conditionRank on
//     purpose: "Slightly Played" (CardTrader's wording) and a bare "Played"
//     read as played, and a label naming two conditions reads as the worse
//     one, because a played copy read as a "price drop" is exactly the false
//     alert this exists to stop (DECISIONS.md, "Price alerts fire on the price
//     you would pay", 2026-09-25).

/** Importer ordering: 0 = NM/unstated … 4 = damaged. Lower wins. */
export function conditionRank(variantTitle: string): number {
  const t = (variantTitle || "").toLowerCase();
  if (/near\s*mint|\bnm\b|mint/.test(t)) return 0;
  if (/light(ly)?\s*play|\blp\b/.test(t)) return 1;
  if (/moderate(ly)?\s*play|\bmp\b/.test(t)) return 2;
  if (/heav(ily)?\s*play|\bhp\b/.test(t)) return 3;
  if (/damaged|\bdmg\b|\bdamage\b/.test(t)) return 4;
  // Cardmarket's scale ("Good" ≈ moderately played). Without this a "Good"
  // variant tied with NM and the cheaper one won (review, 2026-09-25).
  if (GOOD.test(t)) return 2;
  return 0; // no condition in the title (e.g. "Default Title") → treat as standard/NM
}

const GOOD = /\b(very\s*)?good\b|\bgd\b/;

// Played/damaged wording a store may put in a PRODUCT title rather than a
// variant ("Jinx – Heavily Played" with a single "Default Title" variant). The
// Shopify matcher strips exactly these words (price-import.ts STOP) to isolate
// the card name, so such a product matches the card; without reading them the
// row was written with condition null, which counts as Near Mint. Only the
// unambiguous phrases — a product title is mostly a card NAME, and bare words
// like "good" or "poor" could be part of one.
const PRODUCT_TITLE_CONDITION = /\b(lightly|moderately|heavily)\s+played\b|\bdamaged\b/i;

/**
 * The condition label a store listing is recorded with: the chosen variant's
 * own label, unless it names no condition ("Default Title", "Foil", nothing)
 * and the PRODUCT title names a played/damaged one — then that phrase.
 */
export function listingCondition(productTitle: string, variantTitle: string | null | undefined): string | null {
  const v = variantTitle && variantTitle !== "Default Title" ? variantTitle : null;
  const variantNamesOne = v != null && (conditionRank(v) > 0 || /near\s*mint|\bnm\b|mint/i.test(v));
  if (variantNamesOne) return v;
  const m = (productTitle || "").match(PRODUCT_TITLE_CONDITION);
  if (m) return v ? `${m[0]} ${v}` : m[0];
  return v;
}

/**
 * Alert eligibility: 0 = Near Mint, Mint or unstated (may trigger an alert);
 * 1 = lightly/slightly played or Excellent; 2 = moderately played, Good or
 * just "played";
 * 3 = heavily played; 4 = damaged/poor. Worst condition named wins.
 */
export function alertConditionRank(condition: string | null | undefined): number {
  const t = (condition ?? "").trim().toLowerCase();
  if (!t) return 0;
  if (/damaged|\bdmg\b|\bpoor\b/.test(t)) return 4;
  if (/heav(ily|y)?[\s-]*play|\bhp\b/.test(t)) return 3;
  if (/moderate(ly)?[\s-]*play|\bmp\b/.test(t)) return 2;
  // Cardmarket's "Good" sits below "Excellent": played, never NM.
  if (GOOD.test(t)) return 2;
  if (/(light|slight)(ly)?[\s-]*play|\blp\b|\bsp\b|excellent|\bex\b/.test(t)) return 1;
  if (/play(ed)?\b/.test(t)) return 2;
  return 0;
}
