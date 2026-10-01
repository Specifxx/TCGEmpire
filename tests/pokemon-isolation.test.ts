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
  // Route handlers and opengraph-image files skip app/pokemon/layout.tsx, so
  // each gates itself. The Discord endpoint also needs its own public key.
  assert.match(
    read("src/app/api/pokemon/discord/route.ts"),
    /if \(!pokemonEnabled\(\) \|\| !publicKey\) return NextResponse\.json\(\{ error: "Not found" \}, \{ status: 404 \}\);/,
  );
  for (const og of ["src/app/pokemon/opengraph-image.tsx", "src/app/pokemon/sealed/[slug]/opengraph-image.tsx", "src/app/pokemon/sets/[set]/opengraph-image.tsx"]) {
    assert.match(read(og), /if \(!pokemonEnabled\(\)\) notFound\(\);/, og);
  }
  // Every page that reads the Pokémon data gates its own body as well: Next
  // renders the layout and the page in parallel, and a page whose read fails
  // first answers 500 instead of the layout's 404 (measured with the section
  // off and an ISR product page never rendered before).
  const pages: string[] = [];
  const visitPages = (d: string) => {
    for (const e of readdirSync(join(ROOT, d))) {
      const rel = `${d}/${e}`;
      if (statSync(join(ROOT, rel)).isDirectory()) visitPages(rel);
      else if (e === "page.tsx") pages.push(rel);
    }
  };
  visitPages("src/app/pokemon");
  for (const rel of pages) {
    const src = stripComments(read(rel));
    if (!/getPokemon(?:Catalog|Product)\(/.test(src)) continue;
    const body = src.slice(src.indexOf("export default"));
    assert.match(body, /^export default[^\n]*\{\s*if \(!pokemonEnabled\(\)\) notFound\(\);/, `${rel}: the page body gates itself first`);
  }
  // The Discord page exists only once the owner has created the app.
  assert.match(read("src/app/pokemon/discord/page.tsx"), /if \(!appId\) notFound\(\);/);
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
    // The Pokémon blog is its own registry: the Riftbound article system, its
    // posts and its IndexNow pings stay out (DECISIONS, the Pokémon panel D4).
    [/\bArticleView\b/, "the Riftbound article renderer"],
    [/from ["']@\/lib\/(?:articles|posts)["']/, "the Riftbound article registry"],
    [/tool-guides/, "the Riftbound tool guides"],
    [/lib\/indexnow/, "Riftbound's IndexNow submitter"],
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
  // sitemap.ts reaches the gate and the blog registry; both must stay as bare
  // as the importers need. index-gate.ts imports nothing; the registry imports
  // only itself (its types and posts), never the blocks, renderer, seo or db.
  const sitemap = stripComments(readFileSync(join(ROOT, "src/lib/pokemon/sitemap.ts"), "utf8"));
  assert.doesNotMatch(sitemap, /^import[^;]*from ["']\.\/(?:blog|seo|data)\b/m, "sitemap.ts loads the blog only dynamically, and never ./seo or ./data");
  assert.doesNotMatch(stripComments(readFileSync(join(ROOT, "src/lib/pokemon/index-gate.ts"), "utf8")), /^\s*import\b/m, "index-gate.ts imports nothing");
  const blogFiles = [
    "src/lib/pokemon/blog/index.ts",
    "src/lib/pokemon/blog/types.ts",
    ...readdirSync(join(ROOT, "src/lib/pokemon/blog/posts")).map((f) => `src/lib/pokemon/blog/posts/${f}`),
  ];
  for (const rel of blogFiles) {
    const src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
    for (const m of src.matchAll(/^(?:import|export)[^;]*?from ["']([^"']+)["']/gm)) {
      const spec = m[1];
      assert.ok(/^\.\.?\//.test(spec), `${rel} imports ${spec}: the registry imports only its own files`);
      assert.doesNotMatch(spec, /(?:^|\/)(?:db|seo|blocks|render|data)$/, `${rel} imports ${spec}`);
      // posts/* may reach ../types; index.ts and types.ts stay in their own folder.
      const outside = rel.includes("/posts/") ? /^\.\.\/\.\./ : /^\.\.\//;
      assert.doesNotMatch(spec, outside, `${rel} imports ${spec}, outside the blog folder`);
    }
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
  for (const p of [
    "src/app/pokemon/page.tsx",
    "src/app/pokemon/sealed/page.tsx",
    "src/app/pokemon/sets/page.tsx",
    "src/app/pokemon/sets/[set]/page.tsx",
    "src/app/pokemon/booster-boxes/page.tsx",
    "src/app/pokemon/elite-trainer-boxes/page.tsx",
    "src/app/pokemon/booster-bundles/page.tsx",
    "src/app/pokemon/price-per-pack/page.tsx",
  ]) {
    assert.match(readFileSync(join(ROOT, p), "utf8"), /export const dynamic = "force-dynamic";/, p);
  }
  // Blog posts: ISR at the loaders' TTL, nothing prerendered at build.
  const post = stripComments(readFileSync(join(ROOT, "src/app/pokemon/blog/[slug]/page.tsx"), "utf8"));
  assert.equal(Number(/export const revalidate = (\d+);/.exec(post)?.[1]), POKEMON_TTL);
  assert.match(post, /export function generateStaticParams\(\): \{ slug: string \}\[\] \{\s*return \[\];\s*\}/);
  // The price share cards: never cached longer than the data they draw.
  for (const og of ["src/app/pokemon/sealed/[slug]/opengraph-image.tsx", "src/app/pokemon/sets/[set]/opengraph-image.tsx"]) {
    assert.equal(Number(/export const revalidate = (\d+);/.exec(readFileSync(join(ROOT, og), "utf8"))?.[1]), POKEMON_TTL, og);
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

/** Scripts outside scripts/pokemon/ allowed to mention the section: the audit registrations. */
const SCRIPT_TOUCHPOINTS = ["scripts/adsense-audit.ts", "scripts/template-seo-check.ts"].sort();

test("the Riftbound scripts know about the Pokémon section in exactly the listed files", () => {
  // Their Pokémon rows are harmless if left behind after a removal (the
  // templates simply match nothing), but they belong on the removal checklist.
  // The pattern catches path strings, regex literals (\/pokemon) and the
  // template names, and ignores a Riftbound slug like
  // "pokemon-collector-to-riftbound".
  const found = readdirSync(join(ROOT, "scripts"))
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f))
    .map((f) => `scripts/${f}`)
    .filter((rel) =>
      /\\\/pokemon\b|["'`]\/pokemon\b|lib\/pokemon|pokemon-(?:hub|landing|index|set|product|post)\b/.test(stripComments(readFileSync(join(ROOT, rel), "utf8"))),
    )
    .sort();
  assert.deepEqual(found, SCRIPT_TOUCHPOINTS);
});

test("the archive probe: by hand, no secrets, no database, the date only through env", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/pokemon-archive-probe.yml"), "utf8").replace(/^\s*#.*$/gm, "");
  assert.doesNotMatch(wf, /secrets\./);
  assert.doesNotMatch(wf, /DATABASE_URL/);
  assert.doesNotMatch(wf, /^\s*(schedule|push|pull_request):/m);
  assert.match(wf, /permissions:\s*\n\s*contents: read/);
  // A workflow_dispatch input interpolated into run: is script injection.
  assert.deepEqual(
    wf.split("\n").filter((l) => l.includes("inputs.date")).map((l) => l.trim()),
    ["PROBE_DATE: ${{ inputs.date }}"],
  );
});
