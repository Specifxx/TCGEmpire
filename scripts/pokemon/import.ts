// Pokémon sealed import — run by .github/workflows/pokemon-import.yml once a day.
//   POKEMON_DATABASE_URL=… npx tsx scripts/pokemon/import.ts
// Writes ONLY to the Pokémon database (src/lib/pokemon/import.ts). Exits 0
// without doing anything when that database is not configured, so the workflow
// is harmless before the owner has created it.
import { pokemonDb } from "../../src/lib/pokemon/db";
import { pokemonDbConfigured } from "../../src/lib/pokemon/gate";
import { importPokemon } from "../../src/lib/pokemon/import";

async function main() {
  if (!pokemonDbConfigured()) {
    console.log("POKEMON_DATABASE_URL is not set — nothing to import. (The Pokémon section is off.)");
    return;
  }
  const started = Date.now();
  const summary = await importPokemon();
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Pokémon import finished in ${Math.round((Date.now() - started) / 1000)}s.`);
  await pokemonDb().$disconnect();
  // The catalogue stage is the one that matters: fail the job (and the
  // revalidate step after it) only when it did not run at all.
  if (summary.catalog.products === 0) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
});
