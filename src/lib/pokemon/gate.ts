import { POKEMON_VARS, resolveUrl } from "../db-chains";
import { pokemonSectionOn } from "./flag";

// The server-side on/off answer, WITHOUT the database client. Kept apart from
// lib/pokemon/db.ts on purpose: the sitemap module (and through it
// lib/revalidate-content.ts, which every Riftbound importer loads) has to ask
// "is the section on?" without loading the generated Pokémon Prisma client,
// which those importers' workflows never generate.

/** Is a Pokémon database configured in this environment? */
export function pokemonDbConfigured(): boolean {
  return Boolean(resolveUrl(POKEMON_VARS));
}

/**
 * Server-side gate for every Pokémon surface: the public switch AND a database.
 * The flag alone (lib/pokemon/flag.ts) is what client components can see.
 */
export function pokemonEnabled(): boolean {
  return pokemonSectionOn() && pokemonDbConfigured();
}
