import { pokemonSectionOn } from "./flag";
import { pokemonDataPresent } from "./store";

// The server-side on/off answer. Kept apart from lib/pokemon/data.ts on
// purpose: the sitemap module (and through it lib/revalidate-content.ts, which
// every Riftbound importer loads) has to ask "is the section on?" without
// loading the section's loaders.

/** Does this deployment carry the section's data files (data/pokemon/)? */
export function pokemonDataReady(): boolean {
  return pokemonDataPresent();
}

/**
 * Server-side gate for every Pokémon surface: the switch AND the files.
 * The flag alone (lib/pokemon/flag.ts) is what client components can see.
 */
export function pokemonEnabled(): boolean {
  return pokemonSectionOn() && pokemonDataReady();
}
