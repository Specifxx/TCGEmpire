// Pokémon sealed import — run by .github/workflows/pokemon-import.yml twice a day.
//   npx tsx scripts/pokemon/import.ts
// Reads and writes ONLY the section's files in data/pokemon (src/lib/pokemon/store.ts);
// the workflow commits them to main with scripts/pokemon/publish-data.sh.
import { importPokemon } from "../../src/lib/pokemon/import";

async function main() {
  const started = Date.now();
  const summary = await importPokemon();
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Pokémon import finished in ${Math.round((Date.now() - started) / 1000)}s.`);
  // The catalogue stage is the one that matters: fail the job (and the publish
  // step after it) only when it did not run at all.
  if (summary.catalog.products === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
