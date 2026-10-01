// The Pokémon section's cache tag and TTL, in a module with no imports so the
// routes and tests that need them never load the database client.

export const POKEMON_TAG = "pokemon";
/** Six hours. The data changes once a day; the purge after each import is what keeps it fresh. */
export const POKEMON_TTL = 21600;
