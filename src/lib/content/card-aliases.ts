import { normalizeSearch } from "@/lib/format";

// Community nicknames for specific card printings — hand-maintained, same
// convention as creators.ts and community.ts: no database table, no admin UI,
// just a map a PR edits.
//
// WHY THIS EXISTS: people search a card by the name the community gave it, not
// the name Riot printed. Those queries are pure intent — someone typing "armpit
// boi riftbound" wants exactly one card and nothing else — and until now the
// site could not answer them at all. The nickname existed in one blog article
// (lib/articles.ts, the Shen Signature piece) and nowhere the card page or the
// search box could reach.
//
// ── THE BAR FOR ADDING A ROW ────────────────────────────────────────────────
// A nickname goes in ONLY when both halves are verified:
//   1. The nickname is genuinely used by the community — a real post, a real
//      article, or a Search Console query with real impressions.
//   2. It maps to ONE unambiguous printing. A nickname that might mean the base
//      card or its Signature is not ready; leave it out until it is certain.
//
// Do not add a row because a nickname sounds plausible, and do not invent one to
// fill a gap. A wrong alias sends a visitor to the wrong card and teaches the
// search box a lie — strictly worse than not answering the query.
//
// KEYED BY SLUG, which is the card's stable public identifier (lib/card-url.ts)
// and is printing-specific: `shen-eye-of-twilight-ven-193s-166` is the Signature
// (the `s` is the `*`), `...-193-166` would be the base card. Keying by name
// would be ambiguous across exactly the printings this map exists to separate.
//
// A NOTE ON "moonwalk": it was reported as a search term, and it is not a card.
// It was a typo for Moonfall (UNL 198), which is a real card whose own page
// already owns "moonfall riftbound" through the ordinary name path — no alias
// needed. Kept here as the worked example of the bar above: the fix for a
// reported query is to identify the card first, not to guess a mapping.
export const CARD_ALIASES: Record<string, string[]> = {
  // Shen, Eye of Twilight (Signature), VEN 193*/166. The art crops to an
  // unfortunate angle and the community named it accordingly; the nickname is
  // used in our own coverage of the card (lib/articles.ts,
  // "shen-eye-of-twilight-signature-underrated-vendetta").
  //
  // "Armpit Shen" is not a guess — Search Console, 28 days to 2026-09-17:
  // 711 impressions at average position 5.9, and a 1.4% click-through against a
  // ~3% typical rate for that position. We already rank for it; what answers it
  // is the blog post, not the card page, which is the page someone typing a card
  // nickname actually wants. Both forms map to the SAME printing — the joke is
  // about the Signature art specifically — so the second half of the bar holds.
  "shen-eye-of-twilight-ven-193s-166": ["Armpit Boi", "Armpit Shen"],
};

/** Nicknames for a card, by slug. Empty for the overwhelming majority. */
export function aliasesForSlug(slug: string | null | undefined): string[] {
  if (!slug) return [];
  return CARD_ALIASES[slug] ?? [];
}

/**
 * Slugs whose nickname matches a search query.
 *
 * Two match directions, and the asymmetry between them is the point.
 * normalizeSearch strips spaces from both sides, so these are substring tests on
 * compacted strings ("armpit boi" → "armpitboi").
 *
 *   • The query CONTAINS the nickname — "armpit boi riftbound" carries extra
 *     words, and should still land on the card.
 *   • The nickname STARTS WITH the query — someone is still typing ("armpit b").
 *
 * The second one is a PREFIX test, not a substring test, and that is a fix, not
 * a detail: "Armpit Shen" compacts to "armpitshen", which CONTAINS "shen". A
 * substring test would therefore have made the plain query "shen" resolve to one
 * specific Signature printing and rank it above every real Shen card — a
 * nickname map quietly hijacking the ordinary name search it sits beside.
 *
 * The 3-character floor stops a two-letter query from matching on a prefix.
 */
export function aliasSlugsFor(query: string): string[] {
  const nq = normalizeSearch(query ?? "");
  if (nq.length < 3) return [];
  const out: string[] = [];
  for (const [slug, names] of Object.entries(CARD_ALIASES)) {
    const hit = names.some((n) => {
      const na = normalizeSearch(n);
      return na.length >= 3 && (na.startsWith(nq) || nq.includes(na));
    });
    if (hit) out.push(slug);
  }
  return out;
}
