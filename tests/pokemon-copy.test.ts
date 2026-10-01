import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { copyViolations } from "./helpers/pokemon-copy";

// THE POKÉMON SECTION'S COPY RULES, enforced on every string a Pokémon page can
// render. tests/site-claims.test.ts holds the whole site to its honesty rules;
// this adds the ones the Pokémon section needs on top (DECISIONS.md, the
// Pokémon homepage / indexability / blog / distribution panel, 2026-10-01):
//
//   - listings, never sales: our figures are asking prices on open listings;
//   - updated daily, never real-time, never "twice a day" or "hourly";
//   - "lowest price per pack", never value, deals, bargains or "undervalued";
//   - no prediction or investment language ("worth", invest*, "will rise");
//   - no MSRP/RRP until a sourced registry exists (sources disagree);
//   - no pull or hit rates (we hold no such data);
//   - six markets, never "five markets" (eBay is tracked in five, named);
//   - item price, postage extra — never "shipping included".
//
// It scans string literals, template text and JSX text with comments stripped
// (the TypeScript parser does that), so a code comment may explain a banned
// word and an identifier like `msrpFilter` passes (every ban is word-bounded).
// The matcher files are skipped: they hold the words eBay sellers use, which
// is exactly what they exist to reject.

const ROOT = process.cwd();
const DIRS = ["src/lib/pokemon", "src/app/pokemon", "src/app/api/pokemon", "src/components/pokemon"];
const SKIP = new Set(
  ["ebay-match.ts", "kinds.ts", "catalog.ts", "packs.ts", "cardmarket-match.ts", "import.ts", "ebay.ts"].map((f) => `src/lib/pokemon/${f}`),
);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

test("the scanner reads string, template and JSX text, and ignores comments and identifiers", () => {
  const src = [
    `// a comment about the best value is fine`,
    `/* so is "MSRP" in a block comment */`,
    `import x from "./deals";`,
    `const msrpFilter = false;`,
    "const a = `Cheapest listing ${x} today`;",
    `const b = "A great deal";`,
    `export const C = () => <p>Sold listings below {a}</p>;`,
    `const d = "Nothing here is real-time, so check the listing";`,
  ].join("\n");
  const hits = copyViolations(src, "probe.tsx");
  assert.equal(hits.length, 2, hits.join("\n"));
  assert.ok(hits[0].includes("great deal"));
  assert.ok(hits[1].includes("Sold listings"));
});

test("Pokémon copy: no value, prediction, sales, MSRP or real-time language", () => {
  const files = DIRS.flatMap((d) => walk(join(ROOT, d))).map((p) => relative(ROOT, p).split("\\").join("/"));
  assert.ok(files.length > 20, "the Pokémon folders were found");
  const bad: string[] = [];
  for (const rel of files) {
    if (SKIP.has(rel)) continue;
    bad.push(...copyViolations(readFileSync(join(ROOT, rel), "utf8"), rel));
  }
  assert.deepEqual(bad, [], `Banned wording in Pokémon copy:\n${bad.join("\n")}`);
});
