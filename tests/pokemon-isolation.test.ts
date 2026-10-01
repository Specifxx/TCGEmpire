import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pokemonSectionOn, pokemonIndexProducts } from "../src/lib/pokemon/flag";
import { pokemonDbConfigured, pokemonEnabled } from "../src/lib/pokemon/gate";
import { POKEMON_TTL } from "../src/lib/pokemon/cache-keys";

// THE POKÉMON SECTION MUST STAY REMOVABLE (owner, 2026-10-01: "if there is an
// issue, I can just completely remove all the Pokemon"). Everything Pokémon
// lives in its own folders and its own database; the Riftbound site knows about
// it in exactly the files below, each gated by the section's switch. A new
// reference anywhere else fails here, and adding it to this list is the moment
// to also add it to docs/pokemon/README.md's removal checklist.

const ROOT = process.cwd();
const POKEMON_DIRS = ["src/lib/pokemon", "src/components/pokemon", "src/app/pokemon", "src/app/api/pokemon"];

/** The Riftbound files allowed to mention the section — the removal checklist. */
const HOST_TOUCHPOINTS = [
  "src/components/FooterAds.tsx", // OFF_TOPIC_ROUTES: no Riftbound banners on /pokemon
  "src/components/home/HomeSections.tsx", // <PokemonHomePromo />
  "src/components/nav-groups.ts", // the gated "Pokémon (beta)" link
  "src/lib/db-chains.ts", // POKEMON_VARS
  "src/lib/nudge-gate.ts", // no Premium slide-in on /pokemon
  "src/lib/sitemap-sections.ts", // the gated "pokemon" section
].sort();

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const inPokemon = (rel: string) => POKEMON_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`));

test("the Riftbound code knows about the Pokémon section in exactly the listed files", () => {
  const found = walk(join(ROOT, "src"))
    .map((f) => relative(ROOT, f))
    .filter((rel) => !inPokemon(rel))
    .filter((rel) =>
      /lib\/pokemon|components\/pokemon|["'`]\/pokemon\b|\.\/pokemon\/|POKEMON_DATABASE_URL/.test(stripComments(readFileSync(join(ROOT, rel), "utf8"))),
    )
    .sort();
  assert.deepEqual(found, HOST_TOUCHPOINTS);
});

test("every host touchpoint that renders or lists something is behind the switch", () => {
  const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
  assert.match(read("src/components/nav-groups.ts"), /\.\.\.\(pokemonSectionOn\(\)\s*\?/);
  assert.match(read("src/lib/sitemap-sections.ts"), /s !== "pokemon" \|\| pokemonSectionOn\(\)/);
  assert.match(read("src/components/pokemon/PokemonHomePromo.tsx"), /if \(!pokemonSectionOn\(\)\) return null;/);
  assert.match(read("src/app/pokemon/layout.tsx"), /if \(!pokemonEnabled\(\)\) notFound\(\);/);
  assert.match(read("src/app/api/pokemon/revalidate/route.ts"), /if \(!pokemonEnabled\(\)\)/);
  assert.match(read("src/app/api/pokemon/product/[slug]/route.ts"), /if \(!pokemonEnabled\(\)\)/);
  assert.match(read("src/lib/pokemon/sitemap.ts"), /if \(!pokemonEnabled\(\)\) return \[\];/);
});

test("the switch is OFF by default: nothing Pokémon shows until the owner turns it on", () => {
  // npm test runs with .env.production only, which never sets these.
  assert.equal(pokemonSectionOn(), false);
  assert.equal(pokemonDbConfigured(), false);
  assert.equal(pokemonEnabled(), false);
  assert.equal(pokemonIndexProducts(), false);
  assert.doesNotMatch(readFileSync(join(ROOT, ".env.production"), "utf8"), /POKEMON/);
});

test("the Pokémon code never touches the Riftbound databases, importers or eBay queries", () => {
  const files = POKEMON_DIRS.filter((d) => existsSync(join(ROOT, d))).flatMap((d) => walk(join(ROOT, d)));
  files.push(join(ROOT, "scripts/pokemon/import.ts"));
  const banned: [RegExp, string][] = [
    [/from ["'](?:@\/lib\/db|\.\.\/db|\.\.\/\.\.\/db)["']/, "the operational database client"],
    [/db-history/, "the history database client"],
    [/from ["']@prisma\/client["']/, "the Riftbound Prisma client"],
    [/riftboundEbayQuery|ebaySealedQuery/, "a Riftbound eBay query helper"],
    [/from ["'](?:@\/lib\/ebay|\.\.\/ebay)["']/, "Riftbound's eBay importer (on refresh-prices.yml's push paths)"],
    [/sealed-import|price-import|revalidateContent|CONTENT_TAG/, "the Riftbound importer or its purge"],
  ];
  const bad: string[] = [];
  for (const f of files) {
    const src = stripComments(readFileSync(f, "utf8"));
    for (const [re, what] of banned) if (re.test(src)) bad.push(`${relative(ROOT, f)} imports ${what}`);
  }
  assert.deepEqual(bad, []);
  assert.match(readFileSync(join(ROOT, "src/lib/pokemon/db.ts"), "utf8"), /from "\.prisma\/pokemon-client"/);
});

test("nothing a Riftbound importer loads pulls in the Pokémon Prisma client", () => {
  // lib/sitemap-sections.ts is reached from lib/revalidate-content.ts, which
  // refresh-prices.yml's scripts load; those jobs generate only the main client.
  for (const rel of ["src/lib/sitemap-sections.ts", "src/lib/pokemon/sitemap.ts", "src/lib/pokemon/gate.ts", "src/lib/pokemon/flag.ts"]) {
    const src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
    const pokemonDb = rel.startsWith("src/lib/pokemon/") ? /^import[^;]*from ["']\.\/db["']/m : /^import[^;]*from ["'][^"']*pokemon\/db["']/m;
    assert.doesNotMatch(src, pokemonDb, `${rel} statically imports the Pokémon client`);
    assert.doesNotMatch(src, /\.prisma\/pokemon-client/, rel);
  }
});

test("its own database: a separate schema, client and variable", () => {
  const schema = readFileSync(join(ROOT, "prisma/pokemon/schema.prisma"), "utf8");
  assert.match(schema, /url\s*=\s*env\("POKEMON_DATABASE_URL"\)/);
  assert.match(schema, /output\s*=\s*"\.\.\/\.\.\/node_modules\/\.prisma\/pokemon-client"/);
  const main = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
  assert.doesNotMatch(main, /model Pokemon/, "no Pokémon table in the Riftbound schema");
  assert.match(readFileSync(join(ROOT, "src/lib/db-chains.ts"), "utf8"), /export const POKEMON_VARS = \["POKEMON_DATABASE_URL"\] as const;/);
});

test("no loading.tsx under /pokemon (adsense-guard fails one above a notFound page)", () => {
  const dirs: string[] = [];
  const visit = (d: string) => {
    dirs.push(d);
    for (const e of readdirSync(d)) if (statSync(join(d, e)).isDirectory()) visit(join(d, e));
  };
  visit(join(ROOT, "src/app/pokemon"));
  assert.deepEqual(dirs.filter((d) => existsSync(join(d, "loading.tsx"))).map((d) => relative(ROOT, d)), []);
});

test("caching: the product page's TTL is the loaders' TTL, and the grids are per-request", () => {
  const product = stripComments(readFileSync(join(ROOT, "src/app/pokemon/sealed/[slug]/page.tsx"), "utf8"));
  assert.equal(Number(/export const revalidate = (\d+);/.exec(product)?.[1]), POKEMON_TTL);
  // ISR on first visit, nothing prerendered at build: an empty list, like /card/[id].
  assert.match(product, /export function generateStaticParams\(\): \{ slug: string \}\[\] \{\s*return \[\];\s*\}/);
  for (const p of ["src/app/pokemon/page.tsx", "src/app/pokemon/sealed/page.tsx", "src/app/pokemon/sets/page.tsx", "src/app/pokemon/sets/[set]/page.tsx"]) {
    assert.match(readFileSync(join(ROOT, p), "utf8"), /export const dynamic = "force-dynamic";/, p);
  }
  const revalidate = readFileSync(join(ROOT, "src/app/api/pokemon/revalidate/route.ts"), "utf8");
  assert.match(revalidate, /revalidateTag\(POKEMON_TAG\)/);
  assert.match(revalidate, /revalidatePath\("\/pokemon", "layout"\)/);
});

test("the import workflow: schedule only, its own database, its own purge", () => {
  // YAML comments explain the rules (they name RM5 to say it is never used); test the config.
  const wf = readFileSync(join(ROOT, ".github/workflows/pokemon-import.yml"), "utf8").replace(/^\s*#.*$/gm, "");
  const on = wf.slice(wf.indexOf("\non:"), wf.indexOf("\nconcurrency:"));
  assert.match(on, /schedule:/);
  assert.doesNotMatch(on, /\bpush:|pull_request/, "landing code never starts an import");
  assert.match(wf, /POKEMON_DATABASE_URL: \$\{\{ secrets\.POKEMON_DATABASE_URL \}\}/);
  assert.doesNotMatch(wf, /\bRM\d+\b|HISTORY_DATABASE_URL|(?<!POKEMON_)DATABASE_URL: /, "never a Riftbound database");
  assert.match(wf, /\/api\/pokemon\/revalidate/);
  assert.doesNotMatch(wf, /\/api\/revalidate\b/, "never the Riftbound purge");
  assert.match(wf, /prisma db push --schema prisma\/pokemon\/schema\.prisma/);
});
