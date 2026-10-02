// Card slugs that were corrected after they were live, old → new.
//
// A card's slug is its public URL, so a rename must keep the old URL working.
// It is done in the LOOKUP rather than as a next.config.js redirect: the rows
// are renamed by a one-off script (scripts/fix-card-names.ts) that runs on its
// own schedule, while config redirects only change with a deploy, so a config
// redirect would 404 the card for however long the two are out of step. Here
// every card route matches the old AND the new slug, and the card page's
// existing canonical redirect (`params.id !== card.slug` → 308) sends whichever
// URL is not the row's current slug to the one that is — before the script
// runs, after it, and on a re-run.
//
// Add a line here in the same change as any script that moves a slug.
export const CARD_SLUG_RENAMES: Readonly<Record<string, string>> = {
  // Named "Yordle, Heart of the Tempest" by the gallery importer, which took the
  // Legend's first tag as its champion (2026-09-27; lib/legend-name.ts).
  "yordle-heart-of-the-tempest-ven-155": "kennen-heart-of-the-tempest-ven-155",
  // Named "Master, Wuju Bladesman - Starter" by sync-cards (same entry).
  "master-wuju-bladesman-starter-ogs-019-024": "master-yi-wuju-bladesman-ogs-019-024",
  "master-wuju-bladesman-starter-ogs-019-024-promo": "master-yi-wuju-bladesman-ogs-019-024-promo",
  // Catalogued by hand at 146/167, a number read under a video caption; Riot's
  // own card image prints 148/167 (2026-09-30). scripts/add-manual-cards.ts
  // moves the slug on its next run.
  "ntofo-strikes-rad-146-167": "ntofo-strikes-rad-148-167",
  // K'Sante's Legend, catalogued without its champion prefix, which kept it off
  // his champion page (lib/champions.ts matches "K'Sante,"). 2026-09-30.
  "pride-of-nazumah-rad-172-167": "k-sante-pride-of-nazumah-rad-172-167",
  "pride-of-nazumah-rad-147-167": "k-sante-pride-of-nazumah-rad-147-167",
};

const REVERSE: Record<string, string> = Object.fromEntries(Object.entries(CARD_SLUG_RENAMES).map(([o, n]) => [n, o]));

/** The slug a card is meant to have now — the new one for a renamed card, else itself. */
export const currentSlug = (slug: string): string => CARD_SLUG_RENAMES[slug] ?? slug;

/** Every slug the card behind `slug` may have in the database right now (itself first). */
export function slugAliases(slug: string): string[] {
  const other = CARD_SLUG_RENAMES[slug] ?? REVERSE[slug];
  return other ? [slug, other] : [slug];
}

/** For a `slug: { in }` query over a list: each slug plus its aliases. */
export const withSlugAliases = (slugs: readonly string[]): string[] => [...new Set(slugs.flatMap(slugAliases))];

/** A card route's `where` for a slug-or-id path segment, renamed slugs included. */
export const cardWhereParam = (p: string) => ({ OR: [{ id: p }, ...slugAliases(p).map((slug) => ({ slug }))] });
