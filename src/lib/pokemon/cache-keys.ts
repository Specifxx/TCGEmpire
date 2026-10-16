// The Pokémon section's cache tag and TTL, in a module with no imports so the
// routes and tests that need them never load the database client.

export const POKEMON_TAG = "pokemon";
/**
 * A day (six hours until 2026-10-16). The data changes once or twice a day and
 * the purge after each import is what keeps it fresh; the six-hour timer only
 * re-rendered ~1,000 mostly noindex product pages for crawlers between imports
 * (1.4K ISR writes for 163 reads a week). DECISIONS.md, "The import stops
 * purging pages the files serve".
 */
export const POKEMON_TTL = 86400;
