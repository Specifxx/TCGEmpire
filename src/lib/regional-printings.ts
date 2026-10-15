// REGIONAL PRINTINGS: the cards that ARE a foreign-language printing.
//
// Everywhere else on the site a Chinese, Korean or Japanese listing is noise: it
// shares an English card's collector number, trades cheaper, and would steal its
// price, so every price source drops it first (FOREIGN_LANG in lib/scrape-http.ts,
// isForeignListing in lib/ebay.ts). That guard stays exactly as it is.
//
// These few cards are the exception, and only these. Each exists ONLY in one
// language: a Korea-only promo, a print found only in Korean or Chinese packs.
// For them the foreign listing is the only listing there is, so the eBay pass
// searches for them with their own query and accepts a listing only when it is
// in the right language AND names this printing. Owner, 2026-10-15: "we don't
// want every single non-English card on the website, only the special ones...
// we want to track those prices as well." DECISIONS.md, "Regional exclusives".
//
// Adding one: the card goes into prisma/manual-cards.json (with an official
// image, or none), and an entry here keyed on the same externalId. `query` is
// what a seller actually types; `match` is what a title must say for it to be
// this printing rather than the English card or a different regional print.

export type RegionalLanguage = "KR" | "CN";

export interface RegionalPrinting {
  externalId: string;
  language: RegionalLanguage;
  /** Shown on the card page under the printing, e.g. "Korea exclusive". */
  label: string;
  /** The eBay Browse query. Short on purpose: Browse ANDs every keyword. */
  query: string;
  /** A listing title must match this (as well as the language) to be this card. */
  match: RegExp;
}

export const REGIONAL_PRINTINGS: readonly RegionalPrinting[] = [
  {
    // OGN 030/298 P KR: the Korean launch-stamp Jinx (출시 특별판).
    externalId: "promo-ogn-030-jinx-demolitionist-kr-launch",
    language: "KR",
    label: "Korea exclusive promo",
    query: "Jinx Korean promo Riftbound",
    match: /\b(jinx)\b|징크스/i,
  },
  {
    // OGN 076b/298 P KR: Yasuo, Remorseful by Kim Star, from MSI Fan Festa and the
    // Korean Origins launch events. Sellers title it "MSI Korea Exclusive Yasuo Promo".
    externalId: "promo-ogn-076b-yasuo-remorseful-kr-msi",
    language: "KR",
    label: "Korea exclusive promo",
    query: "Yasuo Korea promo Riftbound",
    match: /\b(yasuo)\b|야스오/i,
  },
  {
    // OGN 303a/298 S KR: the Korea-only overnumbered Ahri (Dynasty Ahri homage,
    // Allen Song), in Korean Origins packs only. Korean packs also carry the
    // ordinary 303, so the title must name THIS one: its number, or its art.
    externalId: "regional-ogn-303a-ahri-nine-tailed-fox-kr",
    language: "KR",
    label: "Korea exclusive",
    query: "Ahri Korean 303a Riftbound",
    match: /^(?=.*(\bahri\b|아리|구미호))(?=.*(303a|gumiho|구미호|hanbok|dynasty))/i,
  },
  {
    // RAD 174a*/167 SC: the signed overnumbered Seraphine found only in Chinese
    // Radiance packs. The English 174 and 174* exist too, so the number is required.
    externalId: "regional-rad-174as-seraphine-starry-eyed-songstress-cn",
    language: "CN",
    label: "China exclusive",
    query: "Seraphine 174a Riftbound",
    match: /^(?=.*\bseraphine\b)(?=.*174a)/i,
  },
];

const BY_ID = new Map(REGIONAL_PRINTINGS.map((r) => [r.externalId, r]));

/** The regional entry for a card, or undefined for every ordinary card. */
export function regionalPrinting(externalId: string | null | undefined): RegionalPrinting | undefined {
  return externalId ? BY_ID.get(externalId) : undefined;
}

// What makes a title "in this language": its script, its name in English, or the
// region (a Korea-only promo is titled "Korea Exclusive" far more often than "Korean").
const REGION_SIGNAL: Record<RegionalLanguage, RegExp> = {
  KR: /[가-힯]|\b(korean|korea|kor|kr)\b/i,
  CN: /[㐀-鿿]|\b(chinese|china|simplified|chs|cn|sc)\b/i,
};

/** Does this listing title say it is the regional printing's language or region? */
export function titleInRegion(title: string, language: RegionalLanguage): boolean {
  return REGION_SIGNAL[language].test(title);
}
