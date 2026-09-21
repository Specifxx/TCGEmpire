// Cardmarket product links — the one place a www.cardmarket.com card URL is
// built, and the one place a wrongly-built one is repaired on the way out.
//
// WHY THIS IS ITS OWN FILE: the builder belongs to the importer (lib/cardmarket.ts,
// which writes RetailerPrice.url) and the repair belongs to the outbound-link path
// (lib/affiliate.ts, client-safe). Both need the same knowledge of what a working
// Cardmarket URL looks like, and lib/cardmarket.ts pulls in Prisma and the whole
// catalogue matcher, so affiliate.ts cannot import from it.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE BUG THIS FILE EXISTS FOR (reported by a user, 2026-09-19)
// ─────────────────────────────────────────────────────────────────────────────
//   "when I clicked it, it just redirected me on card market but not on that
//    card page"
//
// Every Cardmarket link we had ever written was
//
//   https://www.cardmarket.com/en/Riftbound/Products/Singles?idProduct=845712
//
// and `/en/Riftbound/Products/Singles` is itself a REAL page: the browse-all
// singles listing for the game. Cardmarket renders it and ignores the unknown
// `idProduct` query, so the link always "worked" — it just never went to the
// card. Nothing 404s, nothing errors, and nothing in our own tests could see it.
//
// The resolving form drops the `/Singles` segment:
//
//   https://www.cardmarket.com/en/Riftbound/Products?idProduct=845712
//
// `/Products` with an id is Cardmarket's own dispatcher and redirects to the
// product's real slug URL. This is not a guess: it is the exact shape Scryfall
// publishes as `purchase_uris.cardmarket` for every Magic card it lists, e.g.
// `https://www.cardmarket.com/en/Magic/Products?idProduct=693418&referrer=scryfall`.
//
// The full slug URL (/Products/Singles/<Expansion-Slug>/<Card-Slug>) is NOT an
// option for us: Cardmarket's public download files carry `idExpansion` as a bare
// number with no name anywhere public (see lib/cardmarket.ts's header), so the
// expansion half of that path cannot be constructed from the data we have. The
// id dispatcher needs neither half.
//
// VERIFICATION, stated plainly: www.cardmarket.com sits behind a Cloudflare WAF
// that hard-403s every automated client — curl and the fetch tooling alike — so
// neither form can be checked from CI or a sandbox. The evidence here is
// Scryfall's live production links plus the reporter's own observation of the
// old form. If the dispatcher ever stops redirecting, this is the file to change.

/** Cardmarket's game segment for Riftbound, as it appears in their URL path. */
export const CARDMARKET_GAME = "Riftbound";

/** The canonical, resolving product URL for a Cardmarket product id. */
export function cardmarketProductUrl(idProduct: number, game: string = CARDMARKET_GAME): string {
  return `https://www.cardmarket.com/en/${game}/Products?idProduct=${idProduct}`;
}

/**
 * Repair a stored Cardmarket URL written in the old, non-resolving form.
 *
 * Rows are rewritten wholesale on every price refresh, so the importer fix alone
 * would heal the database within a cycle — but a link that lands on the wrong
 * page is exactly the kind of thing someone checks the minute a fix ships, and
 * "correct after the next import" is not a fix they can see. Applied on the
 * outbound path, every stale row is right the moment the deploy lands.
 *
 * Deliberately narrow: it only ever moves a `/Products/...` path that already
 * carries an `idProduct` back to the `/Products` dispatcher, keeping the
 * language and game segments the URL came with. Anything else is returned
 * untouched.
 */
export function normalizeCardmarketUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!/(?:^|\.)cardmarket\.com$/i.test(u.hostname)) return url;
    const id = u.searchParams.get("idProduct");
    if (!id) return url;
    // /<lang>/<Game>/Products/<anything> — the sub-path is what breaks the id.
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/Products\/.+$/);
    if (!m) return url;
    u.pathname = `/${m[1]}/${m[2]}/Products`;
    return u.toString();
  } catch {
    return url;
  }
}
